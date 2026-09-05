/**
 * Suggesting a name, in the browser.
 *
 * The lists and the grammar live in `@album/shared`; all that belongs here is
 * the entropy, and it has to be real entropy — `rng.ts` in that package is a
 * seeded PRNG for scattering artwork, and a name drawn from it would be the
 * same name for everybody.
 *
 * Doing this locally rather than asking the server is what makes the reroll
 * button feel like a toy instead of a form: a child can spin through names as
 * fast as they can tap.
 */

import type { Lang } from '@album/shared';
import { makeNickname, pickNicknameIds } from '@album/shared';

function randomInt(bound: number): number {
  const ceiling = Math.floor(0xffffffff / bound) * bound;
  const draw = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(draw);
    if (draw[0]! < ceiling) return draw[0]! % bound;
  }
}

export interface Suggestion {
  nickname: string;
  avatarId: string;
}

/**
 * With no avatar, this picks the picture too, so the name and the face a child
 * is first shown belong together. Given one, it keeps it and only changes the
 * adjective — which is what the reroll button next to a chosen avatar wants.
 */
export function suggestNickname(lang: Lang, avatarId?: string): Suggestion {
  const picked = pickNicknameIds(randomInt);
  const avatar = avatarId ?? picked.avatarId;
  return { nickname: makeNickname(lang, avatar, picked.adjectiveId), avatarId: avatar };
}
