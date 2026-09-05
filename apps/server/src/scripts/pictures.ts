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
 * It goes all the way through: search, open the pick, and fetch the first
 * picture — so a run that prints bytes at the end has exercised the address
 * guard, the redirect handling and the size cap as well.
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

const results = await pictures.search(query, lang);
if (results.length === 0) {
  console.error('nothing came back — a different word, or a provider with a smaller index');
  process.exit(1);
}

for (const [index, hit] of results.entries()) {
  const credit = [hit.source, hit.licence].filter(Boolean).join(' · ') || 'no credit given';
  console.log(`${String(index + 1).padStart(2)}. ${hit.title || '(untitled)'}`);
  console.log(`    ${hit.width}x${hit.height} · ${credit}`);
}

const first = results[0]!;
const url = pictures.open(first.pick);
console.log(`\nfetching the first one:\n  ${url}`);

const picture = await fetchPicture(url, {
  maxBytes: config.maxUploadBytes,
  timeoutMs: config.pictures.timeoutMs,
  userAgent: config.pictures.userAgent,
});
console.log(`  ${picture.bytes.length} bytes of ${picture.contentType} — the whole path works`);
