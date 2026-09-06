/**
 * Picture search, and the two things about it that are worth a test.
 *
 * The first is the address guard. Every other feature in this app talks to
 * itself; this one is handed a URL by a third party and asked to go and read
 * it, which is how servers are talked into fetching their own metadata service.
 * So the table below is the specification, not a sample.
 *
 * The second is the pick. A result carries a signed handle rather than the
 * address it stands for, and the whole reason that is worth the ceremony is
 * that a forged one must not work.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { Album, PictureSearch } from '@album/shared';
import { createApp } from '../src/app.ts';
import { createTestDb } from '../src/db/index.ts';
import { createPictures, wikimediaThumb } from '../src/pictures.ts';
import { fetchPicture, isPublicAddress } from '../src/remotefetch.ts';

const FETCH = { maxBytes: 1024, timeoutMs: 2000, userAgent: 'test' };

describe('which addresses may be fetched', () => {
  it('allows ordinary public addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '151.101.1.140', '2606:4700::1111']) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });

  it('refuses everything that is not out on the internet', () => {
    const blocked = [
      '127.0.0.1', // loopback
      '0.0.0.0', // this host
      '10.1.2.3', // private
      '172.16.0.1', // private
      '172.31.255.255', // private, top of the range
      '192.168.1.1', // private
      '169.254.169.254', // the cloud metadata service, the reason all this exists
      '100.64.0.1', // carrier-grade NAT
      '198.18.0.1', // benchmarking
      '224.0.0.1', // multicast
      '255.255.255.255', // broadcast
      '::1', // loopback
      '::', // unspecified
      'fd00::1', // unique local
      'fe80::1', // link-local
      '::ffff:127.0.0.1', // loopback wearing an IPv6 hat
      '::ffff:169.254.169.254', // metadata wearing the same hat
      '64:ff9b::7f00:1', // NAT64, a way back to v4
      'not-an-address',
      '',
    ];
    for (const address of blocked) assert.equal(isPublicAddress(address), false, address);
  });

  it('keeps 172.15 and 172.32 public, either side of the private block', () => {
    assert.equal(isPublicAddress('172.15.0.1'), true);
    assert.equal(isPublicAddress('172.32.0.1'), true);
  });
});

/**
 * The thumbnail the grid paints, which is not the picture and not the
 * provider's idea of a thumbnail either.
 *
 * Openverse's own resizing proxy answers 424 for every Wikimedia-hosted result,
 * so those are asked of Wikimedia directly. That makes this string transform
 * the difference between a shelf of photographs and a shelf of grey squares,
 * which is worth a table rather than an example.
 */
describe('deriving a thumbnail we can paint', () => {
  it('turns a Commons file into a sized request Wikimedia answers', () => {
    assert.equal(
      wikimediaThumb('https://upload.wikimedia.org/wikipedia/commons/1/13/Lamine_Yamal.jpg'),
      'https://commons.wikimedia.org/wiki/Special:FilePath/Lamine_Yamal.jpg?width=400',
    );
  });

  it('names the wiki that holds the file, when it is not Commons', () => {
    assert.equal(
      wikimediaThumb('https://upload.wikimedia.org/wikipedia/en/a/ab/Poster.jpg'),
      'https://en.wikipedia.org/wiki/Special:FilePath/Poster.jpg?width=400',
    );
  });

  /** A path that is already a thumbnail names the original one segment earlier;
   *  taking the last segment would ask for a thumbnail of a thumbnail. */
  it('finds the original behind an address that is already a thumbnail', () => {
    assert.equal(
      wikimediaThumb('https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Lion.jpg/800px-Lion.jpg'),
      'https://commons.wikimedia.org/wiki/Special:FilePath/Lion.jpg?width=400',
    );
  });

  it('keeps the encoding a name arrived with', () => {
    assert.equal(
      wikimediaThumb('https://upload.wikimedia.org/wikipedia/commons/2/2f/Beli_lav_%28zoo%29.JPG'),
      'https://commons.wikimedia.org/wiki/Special:FilePath/Beli_lav_%28zoo%29.JPG?width=400',
    );
  });

  it('has nothing to say about anywhere else', () => {
    for (const url of [
      'https://live.staticflickr.com/65535/123_b.jpg',
      'https://example.com/lion.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/short.jpg',
      'not a url',
      '',
    ]) {
      assert.equal(wikimediaThumb(url), '', url);
    }
  });
});

describe('fetching a picture', () => {
  it('refuses anything that is not https', async () => {
    await assert.rejects(() => fetchPicture('http://example.com/cat.jpg', FETCH), /only https/);
  });

  it('refuses an address literal that is not public', async () => {
    await assert.rejects(() => fetchPicture('https://127.0.0.1/cat.jpg', FETCH), /not public/);
    await assert.rejects(() => fetchPicture('https://169.254.169.254/latest/meta-data/', FETCH), /not public/);
    await assert.rejects(() => fetchPicture('https://[::1]/cat.jpg', FETCH), /not public/);
  });

  it('refuses a port that is not a web port', async () => {
    await assert.rejects(() => fetchPicture('https://example.com:9000/cat.jpg', FETCH), /not allowed/);
  });
});

/**
 * The provider is stubbed rather than called: a test that needs Openverse to be
 * up is a test that fails for reasons that have nothing to do with this code.
 */
const OPENVERSE_ANSWER = {
  results: [
    {
      id: 'abc',
      title: 'A lion',
      url: 'https://pictures.example.com/lion.jpg',
      thumbnail: 'https://pictures.example.com/lion-small.jpg',
      creator: 'Ана',
      license: 'by',
      license_version: '4.0',
      width: 1200,
      height: 800,
    },
    {
      id: 'def',
      title: 'Another lion',
      url: 'https://pictures.example.com/lion2.jpg',
      thumbnail: 'https://pictures.example.com/lion2-small.jpg',
      source: 'flickr',
      license: 'cc0',
      license_version: '1.0',
      width: 900,
      height: 900,
    },
  ],
};

const realFetch = globalThis.fetch;

/**
 * Answers for the provider, and a Wikipedia that has heard of nobody — these
 * tests are not about the name bridge, but Serbian and Russian now consult it
 * on every search (see pictures.ts), so a stub that only knew Openverse would
 * make every one of them reach out to the real Wikipedia. Everything else,
 * including the test's own calls into the app under test, goes out as normal.
 */
function stubProvider(): void {
  globalThis.fetch = (async (input: Parameters<typeof realFetch>[0], init?: Parameters<typeof realFetch>[1]) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://api.openverse.org/')) {
      return new Response(JSON.stringify(OPENVERSE_ANSWER), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.startsWith('https://sr.wikipedia.org/') || url.startsWith('https://ru.wikipedia.org/')) {
      return new Response(JSON.stringify({ query: { pages: {} } }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

describe('picks', () => {
  before(stubProvider);
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('describes what it found, licence and all', async () => {
    const pictures = createPictures();
    const { results } = await pictures.search('лав', 'sr-Cyrl');

    assert.equal(results.length, 2);
    assert.equal(results[0]!.title, 'A lion');
    // Not a Wikimedia host, so the provider's own thumbnail is what there is.
    assert.equal(results[0]!.thumbUrl, 'https://pictures.example.com/lion-small.jpg');
    assert.equal(results[0]!.source, 'Ана');
    assert.equal(results[0]!.licence, 'CC BY 4.0');
    // CC0 is a dedication, not a licence, and says so in words.
    assert.equal(results[1]!.licence, 'Public domain');
  });

  it('never puts the address it found in front of the browser', async () => {
    const { results } = await createPictures().search('лав', 'en');
    assert.ok(!JSON.stringify(results).includes('/lion.jpg'), 'the full address leaked into the results');
  });

  it('opens a pick it signed itself', async () => {
    const pictures = createPictures();
    const { results } = await pictures.search('лав', 'en');
    assert.equal(pictures.open(results[0]!.pick), 'https://pictures.example.com/lion.jpg');
  });

  it('refuses a pick that has been tampered with', async () => {
    const pictures = createPictures();
    const [hit] = (await pictures.search('лав', 'en')).results;
    const [payload, signature] = hit!.pick.split('.');

    const forged = Buffer.from(
      JSON.stringify({ u: 'https://169.254.169.254/latest/meta-data/', e: Date.now() + 60_000 }),
    ).toString('base64url');

    assert.throws(() => pictures.open(`${forged}.${signature}`), /not a picture/);
    assert.throws(() => pictures.open(`${payload}.${'a'.repeat(43)}`), /not a picture/);
    assert.throws(() => pictures.open('nonsense'), /not a picture/);
  });

  /**
   * The key is per process, not per instance, so this signs a pick in the past
   * by moving the clock rather than by reaching inside. A pick that leaked into
   * a log has to stop working on its own.
   */
  it('lets an expired pick go', async () => {
    const pictures = createPictures();
    const realNow = Date.now;
    Date.now = () => realNow() - 60 * 60 * 1000;
    let stale;
    try {
      [stale] = (await pictures.search('лав', 'en')).results;
    } finally {
      Date.now = realNow;
    }
    assert.throws(() => pictures.open(stale!.pick), /no longer on offer/);
  });
});

/**
 * More than one screenful, without pretending a provider can hand back more
 * than it will ever hand back in one answer.
 */
describe('paging further into the shelf', () => {
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('asks openverse for the page it was told to, and says whether there is another', async () => {
    const pagesAsked: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof realFetch>[0]) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith('https://api.openverse.org/')) throw new Error(`unexpected call to ${url}`);
      pagesAsked.push(new URL(url).searchParams.get('page') ?? '');
      return new Response(JSON.stringify({ ...OPENVERSE_ANSWER, page_count: 3 }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const first = await createPictures().search('lion', 'en', 1);
    assert.equal(first.hasMore, true, 'page 1 of 3 said there was nothing more');
    assert.equal(first.results.length, 2);

    const second = await createPictures().search('lion', 'en', 2);
    assert.equal(second.results.length, 2);

    assert.deepEqual(pagesAsked, ['1', '2']);
  });

  it('says there is no more once the last page has come back', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ...OPENVERSE_ANSWER, page_count: 1 }), {
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    const found = await createPictures().search('lion', 'en', 1);
    assert.equal(found.hasMore, false);
  });

  /**
   * A later page is asked for with the spelling the first page settled on, and
   * the name bridge is never consulted again to produce it — the spelling
   * cannot change on page two, and asking would only spend the one rate limit
   * every child on this deployment shares.
   */
  it('does not consult the name bridge again for a later page', async () => {
    let wikiKnocks = 0;
    globalThis.fetch = (async (input: Parameters<typeof realFetch>[0]) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://api.openverse.org/')) {
        return new Response(JSON.stringify(OPENVERSE_ANSWER), { headers: { 'content-type': 'application/json' } });
      }
      wikiKnocks++;
      return new Response(JSON.stringify({ query: { pages: {} } }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const found = await createPictures().search('lav', 'sr-Latn', 2);
    assert.equal(wikiKnocks, 0, 'a later page went looking for a better spelling anyway');
    assert.equal(found.query, 'lav', 'a later page renamed a search that never got the chance to be renamed');
  });

  describe('the google provider, which pages by result index rather than a page number', () => {
    const savedEnv = { ...process.env };

    before(() => {
      process.env.PICTURE_SEARCH = 'google';
      process.env.GOOGLE_API_KEY = 'test-key';
      process.env.GOOGLE_CSE_ID = 'test-cse';
    });

    after(() => {
      process.env = savedEnv;
      globalThis.fetch = realFetch;
    });

    it('starts the next page `num` results after the last one', async () => {
      const starts: string[] = [];
      globalThis.fetch = (async (input: Parameters<typeof realFetch>[0]) => {
        const url = String(input instanceof Request ? input.url : input);
        if (!url.startsWith('https://www.googleapis.com/')) throw new Error(`unexpected call to ${url}`);
        const params = new URL(url).searchParams;
        const start = params.get('start') ?? '';
        starts.push(start);
        const item = {
          title: 'A lion',
          link: 'https://pictures.example.com/lion.jpg',
          image: { thumbnailLink: 'https://pictures.example.com/lion-small.jpg', width: 800, height: 600 },
        };
        const body: Record<string, unknown> = { items: [item] };
        // Google says so by including a next page, not by a count or a flag.
        if (start === '1') body.queries = { nextPage: [{ startIndex: 11 }] };
        return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
      }) as typeof fetch;

      const first = await createPictures().search('lion', 'en', 1);
      assert.equal(first.hasMore, true);

      const second = await createPictures().search('lion', 'en', 2);
      assert.equal(second.hasMore, false);

      assert.deepEqual(starts, ['1', '11']);
    });
  });
});

/**
 * A name said out loud, and spelled the way it sounded.
 *
 * This is the whole reason `entities.ts` exists: a Serbian recogniser writes
 * `lamin Jamal` for the footballer Lamine Yamal, an index of English titles has
 * never heard of him under that spelling, and the child who said the right name
 * gets an empty shelf. Everything below is stubbed, because the point under test
 * is when we go and ask and what we do with the answer — not whether Wikipedia
 * is up.
 */
describe('a name that was spelled the way it sounded', () => {
  const SPOKEN = 'lamin Jamal';
  const CANONICAL = 'Lamine Yamal';

  /** Openverse knows the name in English only; Wikipedia bridges the two. */
  function stubTheWholeChain(): { openverseQueries: string[] } {
    const openverseQueries: string[] = [];

    globalThis.fetch = (async (input: Parameters<typeof realFetch>[0]) => {
      const url = String(input instanceof Request ? input.url : input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

      if (url.startsWith('https://api.openverse.org/')) {
        const q = new URL(url).searchParams.get('q') ?? '';
        openverseQueries.push(q);
        return json(q === CANONICAL ? OPENVERSE_ANSWER : { results: [] });
      }
      if (url.startsWith('https://sr.wikipedia.org/')) {
        return json({ query: { pages: { '1': { title: 'Ламин Јамал', pageprops: { wikibase_item: 'Q1' } } } } });
      }
      if (url.startsWith('https://www.wikidata.org/')) {
        return json({ entities: { Q1: { sitelinks: { enwiki: { title: CANONICAL } } } } });
      }
      throw new Error(`unexpected call to ${url}`);
    }) as typeof fetch;

    return { openverseQueries };
  }

  after(() => {
    globalThis.fetch = realFetch;
  });

  it('finds him under the name the pictures are labelled with', async () => {
    const { openverseQueries } = stubTheWholeChain();
    const found = await createPictures().search(SPOKEN, 'sr-Latn');

    assert.equal(found.results.length, 2);
    // And says so: the child asked for one spelling and got another, which is
    // worth showing rather than quietly substituting.
    assert.equal(found.query, CANONICAL);
    assert.deepEqual(openverseQueries, [SPOKEN, CANONICAL]);
  });

  /**
   * Serbian and Russian consult Wikipedia on every search now — see pictures.ts
   * for why a full shelf is not evidence it is the right shelf. But a bridge
   * that agrees with what was already asked is not a rename: no second
   * provider search happens, and what is reported back is what the child said.
   */
  it('does not go looking for a second spelling when Wikipedia agrees with the first', async () => {
    const { openverseQueries } = stubTheWholeChain();
    const found = await createPictures().search(CANONICAL, 'sr-Latn');

    assert.equal(found.results.length, 2);
    assert.equal(found.query, CANONICAL);
    assert.deepEqual(openverseQueries, [CANONICAL], 'a spelling wikipedia already agreed with was searched again');
  });

  /**
   * The actual bug this bridge exists for now. Openverse's page size is capped
   * well below its real result count, so `lav` comes back with a full shelf —
   * armoured vehicles, not lions — and the old zero-results-only trigger never
   * fired. Serbian is no longer given that restraint, so the better spelling
   * still gets a chance even though the first search was not empty.
   */
  it('still checks Serbian when the first search already found something, and can still swap', async () => {
    const junk = {
      results: [
        {
          id: 'x1',
          title: 'LAV III',
          url: 'https://pictures.example.com/lav3.jpg',
          thumbnail: 'https://pictures.example.com/lav3-small.jpg',
          source: 'wiki',
          license: '',
          license_version: '',
          width: 100,
          height: 100,
        },
      ],
    };
    const openverseQueries: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof realFetch>[0]) => {
      const url = String(input instanceof Request ? input.url : input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

      if (url.startsWith('https://api.openverse.org/')) {
        const q = new URL(url).searchParams.get('q') ?? '';
        openverseQueries.push(q);
        return json(q === 'Lion' ? OPENVERSE_ANSWER : junk);
      }
      if (url.startsWith('https://sr.wikipedia.org/')) {
        return json({ query: { pages: { '1': { title: 'Лав', pageprops: { wikibase_item: 'Q140' } } } } });
      }
      return json({ entities: { Q140: { sitelinks: { enwiki: { title: 'Lion' } } } } });
    }) as typeof fetch;

    const found = await createPictures().search('lav', 'sr-Latn');

    assert.equal(found.query, 'Lion', 'a shelf full of the wrong thing stopped the better spelling being tried');
    assert.deepEqual(openverseQueries, ['lav', 'Lion']);
    assert.equal(found.results.length, 2);
  });

  /** The restraint English keeps: a word that already found something is left
   *  alone, and Wikipedia is never even asked. */
  it('leaves English alone when it already found something', async () => {
    let wikiKnocks = 0;
    globalThis.fetch = (async (input: Parameters<typeof realFetch>[0]) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://api.openverse.org/')) {
        return new Response(JSON.stringify(OPENVERSE_ANSWER), { headers: { 'content-type': 'application/json' } });
      }
      wikiKnocks++;
      return new Response(JSON.stringify({ query: { pages: {} } }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const found = await createPictures().search('lion', 'en');

    assert.equal(found.query, 'lion');
    assert.equal(wikiKnocks, 0, 'english consulted wikipedia even though the shelf was already full');
  });

  it('keeps the words the child used when the other spelling finds nothing either', async () => {
    globalThis.fetch = (async (input: Parameters<typeof realFetch>[0]) => {
      const url = String(input instanceof Request ? input.url : input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
      if (url.startsWith('https://api.openverse.org/')) return json({ results: [] });
      if (url.startsWith('https://sr.wikipedia.org/')) {
        return json({ query: { pages: { '1': { title: 'Нешто', pageprops: { wikibase_item: 'Q2' } } } } });
      }
      return json({ entities: { Q2: { sitelinks: { enwiki: { title: 'Something Else' } } } } });
    }) as typeof fetch;

    const found = await createPictures().search(SPOKEN, 'sr-Latn');
    assert.equal(found.results.length, 0);
    assert.equal(found.query, SPOKEN, 'a guess that found nothing was reported as what was asked');
  });

  /**
   * Every child on a deployment shares one address, so they share one rate
   * limit, and a 429 can be nobody's fault in particular. The stub below turns
   * one away and then relents, which is the case worth retrying for.
   */
  it('waits a moment and asks again when it is told there have been too many of us', async () => {
    let turnedAway = 0;
    globalThis.fetch = (async (input: Parameters<typeof realFetch>[0]) => {
      const url = String(input instanceof Request ? input.url : input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

      if (url.startsWith('https://api.openverse.org/')) {
        return json(new URL(url).searchParams.get('q') === CANONICAL ? OPENVERSE_ANSWER : { results: [] });
      }
      if (url.startsWith('https://sr.wikipedia.org/')) {
        if (turnedAway++ === 0) return new Response('too many requests', { status: 429 });
        return json({ query: { pages: { '1': { title: 'Ламин Јамал', pageprops: { wikibase_item: 'Q1' } } } } });
      }
      return json({ entities: { Q1: { sitelinks: { enwiki: { title: CANONICAL } } } } });
    }) as typeof fetch;

    const found = await createPictures().search(SPOKEN, 'sr-Latn');
    assert.equal(turnedAway, 2, 'it did not knock a second time');
    assert.equal(found.query, CANONICAL);
    assert.equal(found.results.length, 2);
  });

  /**
   * And the limit of that patience. Told to come back in five minutes we do
   * not wait, and we do not pretend the search failed either — the child gets
   * the empty shelf they already had, immediately.
   */
  it('gives up rather than making a child wait however long it is told to', async () => {
    let knocks = 0;
    globalThis.fetch = (async (input: Parameters<typeof realFetch>[0]) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://api.openverse.org/')) {
        return new Response(JSON.stringify({ results: [] }), { headers: { 'content-type': 'application/json' } });
      }
      knocks++;
      return new Response('too many requests', { status: 429, headers: { 'retry-after': '300' } });
    }) as typeof fetch;

    const started = Date.now();
    const found = await createPictures().search(SPOKEN, 'sr-Latn');

    assert.equal(knocks, 1, 'it waited on a Retry-After it should have refused');
    assert.ok(Date.now() - started < 1000, 'it made the child wait');
    assert.equal(found.results.length, 0);
    assert.equal(found.query, SPOKEN);
  });

  /** A refusal that is not about pace is an answer, and asking again is rude. */
  it('does not knock twice when the answer was not about pace', async () => {
    let knocks = 0;
    globalThis.fetch = (async (input: Parameters<typeof realFetch>[0]) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://api.openverse.org/')) {
        return new Response(JSON.stringify({ results: [] }), { headers: { 'content-type': 'application/json' } });
      }
      knocks++;
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const found = await createPictures().search(SPOKEN, 'sr-Latn');
    assert.equal(knocks, 1);
    assert.equal(found.query, SPOKEN);
  });
});

/**
 * When the provider itself falls over.
 *
 * Openverse is somebody else's server, and it is slow, rate-limited and
 * occasionally unreachable — a search that ends in a rename asks it twice, so
 * a Serbian or Russian query is exposed to that twice over. Two things must
 * not happen when it does. The child must not be told `server error`, which is
 * what the catch-all in `app.ts` says about anything that is not an `Invalid`
 * and which reads as this app being broken. And a shelf that was already
 * found must survive the second, optional search failing.
 */
describe('a provider having a bad afternoon', () => {
  const timeout = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');

  /** Wikipedia renames the query, so the provider is asked a second time. */
  const bridged = (openverse: (q: string) => Response | never) =>
    (async (input: Parameters<typeof realFetch>[0]) => {
      const url = String(input instanceof Request ? input.url : input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

      if (url.startsWith('https://api.openverse.org/')) return openverse(new URL(url).searchParams.get('q') ?? '');
      if (url.startsWith('https://sr.wikipedia.org/')) {
        return json({ query: { pages: { '1': { title: 'Фолксваген голф', pageprops: { wikibase_item: 'Q1' } } } } });
      }
      return json({ entities: { Q1: { sitelinks: { enwiki: { title: 'Volkswagen Golf' } } } } });
    }) as typeof fetch;

  after(() => {
    globalThis.fetch = realFetch;
  });

  /**
   * `Golf 3`, said out loud in Serbian: the first search finds pictures, the
   * bridge renames it to `Volkswagen Golf`, and the second search times out.
   * The child asked once and was found something; losing it to a guess made on
   * their behalf is the worst of both.
   */
  it('keeps the shelf the first search found when the rename cannot be searched', async () => {
    const asked: string[] = [];
    globalThis.fetch = bridged((q) => {
      asked.push(q);
      if (q !== 'Golf 3') throw timeout();
      return new Response(JSON.stringify(OPENVERSE_ANSWER), { headers: { 'content-type': 'application/json' } });
    });

    const found = await createPictures().search('Golf 3', 'sr-Latn');

    assert.deepEqual(asked, ['Golf 3', 'Volkswagen Golf'], 'the rename was never tried');
    assert.equal(found.results.length, 2, 'a shelf that was already found was thrown away');
    assert.equal(found.query, 'Golf 3', 'a rename that never came back was reported as the one that found these');
  });

  /**
   * And when there is no shelf to fall back on, a sentence about the picture
   * search — not about this server, which did nothing wrong.
   */
  it('blames the picture search, not itself, when the provider is too slow', async () => {
    globalThis.fetch = bridged(() => {
      throw timeout();
    });

    await assert.rejects(
      () => createPictures().search('Golf 3', 'sr-Latn'),
      (error: Error) => {
        assert.match(error.message, /picture search is not answering \(too slow\)/);
        assert.equal(error.cause instanceof DOMException, true, 'the reason was lost on the way to the log');
        return true;
      },
    );
  });

  it('says the same when the provider cannot be reached at all', async () => {
    globalThis.fetch = bridged(() => {
      throw new TypeError('fetch failed');
    });

    await assert.rejects(() => createPictures().search('Golf 3', 'sr-Latn'), /not answering \(unreachable\)/);
  });

  /** A provider that answers an error page instead of JSON, with a 200 on it. */
  it('says the same when the answer is not an answer', async () => {
    globalThis.fetch = bridged(
      () => new Response('<html>we are down</html>', { headers: { 'content-type': 'text/html' } }),
    );

    await assert.rejects(() => createPictures().search('Golf 3', 'sr-Latn'), /not an answer we can read/);
  });
});

describe('the routes', () => {
  let app: FastifyInstance;
  let base: string;
  let dataDir: string;
  let token: string;

  before(async () => {
    stubProvider();
    dataDir = await mkdtemp(path.join(tmpdir(), 'nalepko-pictures-'));
    process.env.DATA_DIR = dataDir;
    app = await createApp({ db: createTestDb(), serveWeb: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

    const res = await fetch(`${base}/api/albums`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId: 'space', title: 'Тест', ownerName: 'Ана' }),
    });
    token = ((await res.json()) as { editToken: string; album: Album }).editToken;
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('says picture search is available, so the editor may offer it', async () => {
    const res = await fetch(`${base}/api/features`);
    assert.deepEqual(await res.json(), { pictureSearch: true });
  });

  it('answers a search behind the album token', async () => {
    const res = await fetch(`${base}/api/albums/${token}/pictures?q=${encodeURIComponent('лав')}&lang=sr-Cyrl`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as PictureSearch;
    assert.equal(body.provider, 'openverse');
    assert.equal(body.results.length, 2);
    assert.ok(body.results[0]!.pick.length > 0);
  });

  it('turns the page when asked to, and reports it as a boolean either way', async () => {
    const pagesAsked: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof realFetch>[0], init?: Parameters<typeof realFetch>[1]) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://api.openverse.org/')) {
        pagesAsked.push(new URL(url).searchParams.get('page') ?? '');
        return new Response(JSON.stringify(OPENVERSE_ANSWER), { headers: { 'content-type': 'application/json' } });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    try {
      const res = await fetch(
        `${base}/api/albums/${token}/pictures?q=${encodeURIComponent('лав')}&lang=sr-Cyrl&page=2`,
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as PictureSearch;
      assert.equal(typeof body.hasMore, 'boolean');
      // Page two of a search already under way, so no wiki call and no
      // renaming — the provider is asked for exactly that page, once.
      assert.deepEqual(pagesAsked, ['2']);
    } finally {
      stubProvider();
    }
  });

  /**
   * The whole point of the two guards above, seen from where the child is: a
   * provider that will not answer produces a sentence about the picture
   * search, never the catch-all's `server error`.
   */
  it('never reports a dead provider as this server failing', async () => {
    globalThis.fetch = (async (input: Parameters<typeof realFetch>[0], init?: Parameters<typeof realFetch>[1]) => {
      const url = String(input instanceof Request ? input.url : input);
      const upstream =
        url.startsWith('https://api.openverse.org/') ||
        url.includes('wikipedia.org') ||
        url.includes('wikidata.org');
      if (upstream) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      return realFetch(input, init);
    }) as typeof fetch;

    try {
      const res = await fetch(`${base}/api/albums/${token}/pictures?q=${encodeURIComponent('Golf 3')}&lang=sr-Latn`);
      const body = (await res.json()) as { error: string };
      assert.notEqual(res.status, 500, 'a slow provider was reported as this server failing');
      assert.notEqual(body.error, 'server error');
      assert.match(body.error, /picture search/);
    } finally {
      stubProvider();
    }
  });

  it('treats a page that is not a real page number as the first one', async () => {
    const res = await fetch(`${base}/api/albums/${token}/pictures?q=${encodeURIComponent('лав')}&page=not-a-number`);
    assert.equal(res.status, 200);
  });

  it('does not answer one for an album that does not exist', async () => {
    const res = await fetch(`${base}/api/albums/nope/pictures?q=lion`);
    assert.equal(res.status, 404);
  });

  it('asks for something to look for', async () => {
    const res = await fetch(`${base}/api/albums/${token}/pictures?q=%20`);
    assert.equal(res.status, 400);
  });

  it('refuses to fetch a picture nobody offered', async () => {
    const forged = Buffer.from(JSON.stringify({ u: 'https://127.0.0.1/x.jpg', e: Date.now() + 60_000 })).toString(
      'base64url',
    );
    const res = await fetch(`${base}/api/albums/${token}/images/from-search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pick: `${forged}.${'a'.repeat(43)}` }),
    });
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as { error: string }).error, /not a picture/);
  });

  it('wants to be told which picture', async () => {
    const res = await fetch(`${base}/api/albums/${token}/images/from-search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  /**
   * The host in the stubbed answer does not exist, which is the point: a
   * picture that cannot be fetched is the child's problem to solve by picking
   * another, and never a 500 with our network in it.
   */
  it('says so plainly when a picture cannot be fetched', async () => {
    const found = (await (
      await fetch(`${base}/api/albums/${token}/pictures?q=${encodeURIComponent('лав')}`)
    ).json()) as PictureSearch;

    const res = await fetch(`${base}/api/albums/${token}/images/from-search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pick: found.results[0]!.pick }),
    });
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as { error: string }).error, /could not be fetched/);
  });
});
