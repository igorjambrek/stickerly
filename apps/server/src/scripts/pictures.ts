/**
 * Ask the picture search a question from the command line.
 *
 * There is one thing tests cannot tell you about this feature: whether the
 * credentials on this machine actually work, and whether the provider still
 * answers in the shape the code reads. Both are somebody else's server, and
 * both are the kind of thing that changes quietly.
 *
 *   npm run pictures:check              # whatever is configured, looking for a lion
 *   npm run pictures:check ракета ru
 *   GOOGLE_API_KEY=... GOOGLE_CSE_ID=... npm run pictures:check lav sr-Latn
 *
 * It goes all the way through: search, open the pick, fetch every thumbnail
 * and then fetch the first picture — so a run that prints bytes at the end has
 * exercised the address guard, the redirect handling and the size cap as well.
 *
 * The thumbnails are checked because they are the half a person sees. A search
 * can return twenty good photographs and paint none of them, and for a while it
 * did: Openverse's own resizing proxy answers 424 for Wikimedia-hosted results,
 * and this script said "the whole path works" throughout, because it only ever
 * fetched the full picture behind the first result. A shelf nobody can look at
 * is a broken feature, so a run that cannot paint says so.
 */

import type { Lang } from '@album/shared';
import { DEFAULT_LANG, LANGS } from '@album/shared';
import { config } from '../config.ts';
import { createPictures } from '../pictures.ts';
import { fetchPicture } from '../remotefetch.ts';

const query = process.argv[2] ?? 'lion';
const asked = process.argv[3] as Lang | undefined;
const lang = asked && LANGS.includes(asked) ? asked : DEFAULT_LANG;

const pictures = createPictures();
if (!pictures.enabled) {
  console.error(`picture search is off (PICTURE_SEARCH=${process.env.PICTURE_SEARCH ?? ''})`);
  process.exit(1);
}

console.log(`provider: ${pictures.provider}\nlooking for: ${query} (${lang})\n`);

const { query: foundAs, results } = await pictures.search(query, lang);
// The words the pictures were found by, when the ones that were typed
// found nothing and a name in another spelling did.
if (foundAs !== query) console.log(`found instead as: ${foundAs}\n`);
if (results.length === 0) {
  console.error('nothing came back — a different word, or a provider with a smaller index');
  process.exit(1);
}

/**
 * Ask for a thumbnail the way the grid will: an `<img>` sends a browser's
 * `Accept`, and asking with `image/*` instead gets a 406 out of Openverse that
 * has nothing to do with whether the picture is there.
 */
const BROWSER_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*;q=0.8,*/*;q=0.5';

async function paints(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { accept: BROWSER_ACCEPT, 'user-agent': config.pictures.userAgent },
      signal: AbortSignal.timeout(config.pictures.timeoutMs),
    });
    const type = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (res.ok && type.startsWith('image/')) return '';
    return res.ok ? `not a picture (${type || 'no type'})` : `${res.status}`;
  } catch (error) {
    return (error as Error).message;
  }
}

const trouble = await Promise.all(results.map((hit) => paints(hit.thumbUrl)));

for (const [index, hit] of results.entries()) {
  const credit = [hit.source, hit.licence].filter(Boolean).join(' · ') || 'no credit given';
  const bad = trouble[index]!;
  console.log(`${String(index + 1).padStart(2)}. ${bad ? '✗' : '✓'} ${hit.title || '(untitled)'}`);
  console.log(`    ${hit.width}x${hit.height} · ${credit}`);
  if (bad) console.log(`    thumbnail will not paint: ${bad}\n    ${hit.thumbUrl}`);
}

const broken = trouble.filter(Boolean).length;
if (broken > 0) {
  console.log(`\n${broken} of ${results.length} thumbnails will not paint — that many empty tiles on the shelf`);
}

const first = results[0]!;
const url = pictures.open(first.pick);
console.log(`\nfetching the first one:\n  ${url}`);

const picture = await fetchPicture(url, {
  maxBytes: config.maxUploadBytes,
  timeoutMs: config.pictures.timeoutMs,
  userAgent: config.pictures.userAgent,
});
console.log(`  ${picture.bytes.length} bytes of ${picture.contentType}`);

// Fetching one picture was never the whole path; a child has to be able to see
// the shelf before they can pick anything off it.
console.log(broken === 0 ? '\nthe whole path works' : '\nthe fetch works, but the shelf has holes in it');
if (broken === results.length) process.exit(1);
