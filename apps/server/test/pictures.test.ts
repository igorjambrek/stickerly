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
import { createPictures } from '../src/pictures.ts';
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

/** Answers for the provider only; everything else, including the test's own
 *  calls into the app under test, goes out as normal. */
function stubProvider(): void {
  globalThis.fetch = (async (input: Parameters<typeof realFetch>[0], init?: Parameters<typeof realFetch>[1]) => {
    if (String(input instanceof Request ? input.url : input).startsWith('https://api.openverse.org/')) {
      return new Response(JSON.stringify(OPENVERSE_ANSWER), {
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
    const results = await pictures.search('лав', 'sr-Cyrl');

    assert.equal(results.length, 2);
    assert.equal(results[0]!.title, 'A lion');
    assert.equal(results[0]!.thumbUrl, 'https://pictures.example.com/lion-small.jpg');
    assert.equal(results[0]!.source, 'Ана');
    assert.equal(results[0]!.licence, 'CC BY 4.0');
    // CC0 is a dedication, not a licence, and says so in words.
    assert.equal(results[1]!.licence, 'Public domain');
  });

  it('never puts the address it found in front of the browser', async () => {
    const results = await createPictures().search('лав', 'en');
    assert.ok(!JSON.stringify(results).includes('/lion.jpg'), 'the full address leaked into the results');
  });

  it('opens a pick it signed itself', async () => {
    const pictures = createPictures();
    const results = await pictures.search('лав', 'en');
    assert.equal(pictures.open(results[0]!.pick), 'https://pictures.example.com/lion.jpg');
  });

  it('refuses a pick that has been tampered with', async () => {
    const pictures = createPictures();
    const [hit] = await pictures.search('лав', 'en');
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
      [stale] = await pictures.search('лав', 'en');
    } finally {
      Date.now = realNow;
    }
    assert.throws(() => pictures.open(stale!.pick), /no longer on offer/);
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
