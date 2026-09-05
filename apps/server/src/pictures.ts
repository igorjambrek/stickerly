/**
 * The shelf of pictures a child can ask for out loud.
 *
 * A search is two steps, deliberately: find some pictures, then fetch exactly
 * one of them. The first step talks to a provider we chose; the second talks to
 * whatever host that provider named, which is why the browser is never given
 * that address and never gets to name one of its own. A result carries a
 * `pick` — the address, signed by this process and good for a few minutes — and
 * the fetch route will only go and get a picture for a `pick` it signed itself.
 * "Download this URL for me" is not a thing this server offers to anybody.
 *
 * Two providers, one seam:
 *
 *  - **Openverse** (openverse.org, the WordPress Foundation) is the default and
 *    needs no credentials, which is why it is the default. It indexes openly
 *    licensed and public-domain pictures, so every result is one a child may
 *    legitimately print and hand to a friend — which matters more here than in
 *    most image searches, because the output of this app is paper. Its
 *    unauthenticated rate limit is modest and its titles are mostly English, so
 *    a Serbian query finds less than an English one.
 *  - **Google** (Custom Search JSON API) needs `GOOGLE_API_KEY` and
 *    `GOOGLE_CSE_ID`, and is used automatically when both are set. It
 *    understands the languages this app is actually used in, and it searches
 *    the open web — so its results carry no licence, and the editor says so.
 *
 * Adding a third is one `search` function and one line in `providerFor`.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Lang, PictureHit } from '@album/shared';
import { MAX_QUERY, cleanQuery } from '@album/shared';
import { config } from './config.ts';
import { canonicalName } from './entities.ts';
import { Invalid } from './repo.ts';

/** What a provider knows about one picture, before it is signed and sent out. */
interface RawHit {
  thumbUrl: string;
  fullUrl: string;
  width: number;
  height: number;
  title: string;
  source: string;
  licence: string;
}

interface Provider {
  name: string;
  search(query: string, lang: Lang): Promise<RawHit[]>;
}

/** Talking to a provider is a normal fetch: a fixed host we picked ourselves. */
async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': config.pictures.userAgent },
    signal: AbortSignal.timeout(config.pictures.timeoutMs),
  });
  // The status is kept in the message on purpose: it is the one clue anybody
  // debugging a dead provider will have, and this is rare enough that a child
  // seeing it means something is actually wrong.
  if (!res.ok) throw new Invalid(`the picture search is not answering (${res.status})`);
  return (await res.json()) as Record<string, unknown>;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const size = (value: unknown): number => (typeof value === 'number' && value > 0 ? Math.round(value) : 0);

/**
 * `by-sa` + `4.0` -> `CC BY-SA 4.0`. The two that are not really licences at
 * all — dedicated to the public domain, or already out of copyright — say so in
 * words, because "CC0 1.0" means nothing to the adult holding the printout.
 */
function openverseLicence(licence: string, version: string): string {
  const code = licence.toLowerCase();
  if (code === 'cc0' || code === 'pdm') return 'Public domain';
  if (!code) return '';
  return `CC ${code.toUpperCase()}${version ? ` ${version}` : ''}`;
}

const openverse: Provider = {
  name: 'openverse',
  async search(query) {
    const url = new URL('https://api.openverse.org/v1/images/');
    url.searchParams.set('q', query);
    // Twenty is the ceiling for an unauthenticated caller — ask for more and
    // the whole request comes back 401, not a shorter list.
    url.searchParams.set('page_size', String(Math.min(20, config.pictures.maxResults)));
    // Openverse filters adult content by default; said out loud because this is
    // a children's app and a default that silently flips is not a safeguard.
    url.searchParams.set('mature', 'false');
    // These albums are printed and given away, so results are narrowed to what
    // may be reused and altered — a sticker is a crop of somebody's photograph.
    url.searchParams.set('license_type', 'commercial,modification');

    const body = await getJson(url.toString());
    const results = Array.isArray(body.results) ? (body.results as Record<string, unknown>[]) : [];

    return results
      .map((hit) => ({
        thumbUrl: text(hit.thumbnail) || text(hit.url),
        fullUrl: text(hit.url),
        width: size(hit.width),
        height: size(hit.height),
        title: text(hit.title),
        source: text(hit.creator) || text(hit.source) || text(hit.provider),
        licence: openverseLicence(text(hit.license), text(hit.license_version)),
      }))
      .filter((hit) => hit.fullUrl && hit.thumbUrl);
  },
};

const google: Provider = {
  name: 'google',
  async search(query, lang) {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', config.pictures.googleApiKey);
    url.searchParams.set('cx', config.pictures.googleCseId);
    url.searchParams.set('q', query);
    url.searchParams.set('searchType', 'image');
    // Not optional, and not a preference: this app is used by six-year-olds.
    url.searchParams.set('safe', 'active');
    // The API caps a page at ten whatever we ask for.
    url.searchParams.set('num', String(Math.min(10, config.pictures.maxResults)));
    url.searchParams.set('hl', lang === 'ru' ? 'ru' : lang === 'en' ? 'en' : 'sr');

    const body = await getJson(url.toString());
    const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];

    return items
      .map((item) => {
        const image = (item.image ?? {}) as Record<string, unknown>;
        return {
          thumbUrl: text(image.thumbnailLink) || text(item.link),
          fullUrl: text(item.link),
          width: size(image.width),
          height: size(image.height),
          title: text(item.title),
          source: text(item.displayLink),
          // The open web, so nothing here promises the picture may be reused.
          licence: '',
        };
      })
      .filter((hit) => hit.fullUrl && hit.thumbUrl);
  },
};

/**
 * How wide a thumbnail we ask a host for, when the host lets us ask.
 *
 * A shelf tile is never painted bigger than this, and the originals behind
 * these results routinely run to four megabytes — twenty of those in one grid
 * is its own kind of broken, on a phone especially.
 */
const THUMB_WIDTH = 400;

/**
 * `upload.wikimedia.org/wikipedia/commons/1/13/Name.jpg` ->
 * `commons.wikimedia.org/wiki/Special:FilePath/Name.jpg?width=400`, or '' for
 * anything not hosted there.
 *
 * `Special:FilePath` is Wikimedia's documented way to ask for a file by name at
 * a size, and it is stable in a way that guessing the `/thumb/` path is not.
 * The wiki named in the path is the wiki that holds the file: `commons` is the
 * shared one, but a picture can live on a single language's wiki instead.
 */
export function wikimediaThumb(fullUrl: string): string {
  let url: URL;
  try {
    url = new URL(fullUrl);
  } catch {
    return '';
  }
  if (url.hostname !== 'upload.wikimedia.org') return '';

  // /wikipedia/<wiki>/<a>/<ab>/<file>, or the same with /thumb/ after the wiki
  // and a size-prefixed copy of the name on the end.
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'wikipedia' || parts.length < 5) return '';
  const file = parts[2] === 'thumb' ? parts[5] : parts[parts.length - 1];
  if (!file) return '';

  const wiki = parts[1]!;
  const host = wiki === 'commons' ? 'commons.wikimedia.org' : `${wiki}.wikipedia.org`;
  // The segment is already percent-encoded, having come out of a URL.
  return `https://${host}/wiki/Special:FilePath/${file}?width=${THUMB_WIDTH}`;
}

/**
 * A thumbnail we can actually paint.
 *
 * Openverse does not serve thumbnails itself: `thumbnail` points back at its
 * own resizing proxy, and that proxy answers `424 Thumbnail unavailable from
 * provider` for whole classes of result — every Wikimedia-hosted picture, at
 * the time of writing. The search is fine and the full picture is fine; only
 * the one URL the grid paints is dead, which is a blank shelf in front of a
 * child who asked for a footballer and was found twenty good photographs of him.
 *
 * So where the host will resize for us, we ask it ourselves rather than trust
 * the provider's proxy. Everything else keeps the thumbnail the provider gave,
 * because checking it from here would mean fetching twenty URLs before
 * answering; the browser carries that half instead, and a tile whose picture
 * will not load takes itself down.
 */
const thumbFor = (hit: RawHit): string => wikimediaThumb(hit.fullUrl) || hit.thumbUrl || hit.fullUrl;

const providerFor = (name: string): Provider | null =>
  name === 'google' ? google : name === 'openverse' ? openverse : null;

/**
 * The key that makes a `pick` unforgeable.
 *
 * Fresh per process by default, which is right for what it protects: a handle
 * that is meant to live for minutes, in a server that already keeps its live
 * revisions in memory. A restart invalidates every outstanding pick, and the
 * child searches again. Set `PICTURE_SECRET` when that is not good enough.
 */
const secret = process.env.PICTURE_SECRET || randomBytes(32).toString('hex');

const b64url = (value: string | Buffer): string => Buffer.from(value).toString('base64url');

const signature = (payload: string): string =>
  createHmac('sha256', secret).update(payload).digest('base64url');

function sign(url: string, expiresAt: number): string {
  const payload = b64url(JSON.stringify({ u: url, e: expiresAt }));
  return `${payload}.${signature(payload)}`;
}

/**
 * The address a `pick` stands for, or a refusal.
 *
 * Compared in constant time — an attacker who can measure how wrong a guess was
 * can eventually make a right one — and then checked for freshness, so a handle
 * that leaked into a log stops working on its own.
 */
function open(pick: string): string {
  const [payload, given] = pick.split('.');
  if (!payload || !given) throw new Invalid('that is not a picture');

  const expected = Buffer.from(signature(payload));
  const offered = Buffer.from(given);
  if (expected.length !== offered.length || !timingSafeEqual(expected, offered)) {
    throw new Invalid('that is not a picture');
  }

  let claim: { u?: unknown; e?: unknown };
  try {
    claim = JSON.parse(Buffer.from(payload, 'base64url').toString()) as typeof claim;
  } catch {
    throw new Invalid('that is not a picture');
  }
  if (typeof claim.u !== 'string' || typeof claim.e !== 'number') throw new Invalid('that is not a picture');
  if (claim.e < Date.now()) throw new Invalid('that picture is no longer on offer, search again');

  return claim.u;
}

/** What came back, and the words that found it — not always the words asked. */
export interface Found {
  /** The query the results actually came from, spelled the way it was searched. */
  query: string;
  results: PictureHit[];
}

export interface Pictures {
  /** False when no provider is configured; the editor then hides the door. */
  enabled: boolean;
  provider: string;
  search(query: string, lang: Lang): Promise<Found>;
  /** The address behind a handle this process signed. Throws for anything else. */
  open(pick: string): string;
}

export function createPictures(): Pictures {
  const provider = providerFor(config.pictures.provider);

  return {
    enabled: provider !== null,
    provider: provider?.name ?? 'off',

    async search(rawQuery, lang) {
      if (!provider) throw new Invalid('picture search is switched off');
      const query = cleanQuery(rawQuery);
      if (!query) throw new Invalid('say what you are looking for');
      if (query.length > MAX_QUERY) throw new Invalid('that is a very long thing to look for');

      const expiresAt = Date.now() + config.pictures.pickTtlMs;

      let asked = query;
      let hits = await provider.search(query, lang);

      // Nothing at all is the shape a name takes when it was spelled the way it
      // sounds in the language it was said in. Ask what it is called in English
      // and have one more go; anything that did find pictures is left alone.
      if (hits.length === 0) {
        const canonical = await canonicalName(query, lang);
        if (canonical && canonical.toLowerCase() !== query.toLowerCase()) {
          const second = await provider.search(canonical, lang);
          // Only adopt the other spelling if it was the better one. A rename
          // that finds nothing either is a rename worth forgetting, so the
          // child is told what they asked rather than what we guessed.
          if (second.length > 0) {
            asked = canonical;
            hits = second;
          }
        }
      }

      const results = hits.slice(0, config.pictures.maxResults).map((hit, index) => ({
        // Something to key a list by, and nothing more. Deriving it from the
        // address would put the address back in front of the browser, which is
        // the one thing `pick` exists to avoid.
        id: `${index}-${createHash('sha256').update(hit.fullUrl).digest('base64url').slice(0, 12)}`,
        thumbUrl: thumbFor(hit),
        width: hit.width,
        height: hit.height,
        title: hit.title,
        source: hit.source,
        licence: hit.licence,
        pick: sign(hit.fullUrl, expiresAt),
      }));

      return { query: asked, results };
    },

    open,
  };
}
