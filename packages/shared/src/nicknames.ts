/**
 * Names children are given, so they never have to type one.
 *
 * A new passport arrives already called something — `Брзи Лав`, `Brave Rocket`
 * — and the child can reroll it or type over it. Generating by default is the
 * privacy feature as much as the onboarding one: if the path of least
 * resistance is a made-up name, a real name never gets typed by accident.
 *
 * The noun is the child's own avatar (see `avatars.ts`), so the name always
 * matches the picture they are looking at and one word list serves both. The
 * adjective has to agree with that noun's gender in Serbian and Russian, which
 * is why every entry below carries three forms and why the English ones are
 * written out three times identically rather than special-cased.
 *
 * Nothing here is random. Picking the two ids is the caller's job, with the
 * caller's own source of entropy — `crypto.getRandomValues` in the browser,
 * `randomBytes` on the server. `rng.ts` is a seeded PRNG for scattering
 * artwork and must never be used for this.
 */

import type { Lang } from './types.ts';
import { DEFAULT_LANG } from './types.ts';
import type { Gender } from './avatars.ts';
import { AVATARS, getAvatar } from './avatars.ts';

export interface Adjective {
  id: string;
  forms: Record<Lang, Record<Gender, string>>;
}

type Triple = [m: string, f: string, n: string];

const byGender = ([m, f, n]: Triple): Record<Gender, string> => ({ m, f, n });

const adjective = (id: string, srCyrl: Triple, srLatn: Triple, en: string, ru: Triple): Adjective => ({
  id,
  forms: {
    'sr-Cyrl': byGender(srCyrl),
    'sr-Latn': byGender(srLatn),
    en: byGender([en, en, en]),
    ru: byGender(ru),
  },
});

export const ADJECTIVES: readonly Adjective[] = [
  adjective('fast', ['Брзи', 'Брза', 'Брзо'], ['Brzi', 'Brza', 'Brzo'], 'Fast', ['Быстрый', 'Быстрая', 'Быстрое']),
  adjective('brave', ['Храбри', 'Храбра', 'Храбро'], ['Hrabri', 'Hrabra', 'Hrabro'], 'Brave', ['Храбрый', 'Храбрая', 'Храброе']),
  adjective('merry', ['Весели', 'Весела', 'Весело'], ['Veseli', 'Vesela', 'Veselo'], 'Merry', ['Весёлый', 'Весёлая', 'Весёлое']),
  adjective('big', ['Велики', 'Велика', 'Велико'], ['Veliki', 'Velika', 'Veliko'], 'Big', ['Большой', 'Большая', 'Большое']),
  adjective('little', ['Мали', 'Мала', 'Мало'], ['Mali', 'Mala', 'Malo'], 'Little', ['Маленький', 'Маленькая', 'Маленькое']),
  adjective('golden', ['Златни', 'Златна', 'Златно'], ['Zlatni', 'Zlatna', 'Zlatno'], 'Golden', ['Золотой', 'Золотая', 'Золотое']),
  adjective('clever', ['Паметни', 'Паметна', 'Паметно'], ['Pametni', 'Pametna', 'Pametno'], 'Clever', ['Умный', 'Умная', 'Умное']),
  adjective('funny', ['Смешни', 'Смешна', 'Смешно'], ['Smešni', 'Smešna', 'Smešno'], 'Funny', ['Смешной', 'Смешная', 'Смешное']),
  adjective('sleepy', ['Поспани', 'Поспана', 'Поспано'], ['Pospani', 'Pospana', 'Pospano'], 'Sleepy', ['Сонный', 'Сонная', 'Сонное']),
  adjective('wild', ['Дивљи', 'Дивља', 'Дивље'], ['Divlji', 'Divlja', 'Divlje'], 'Wild', ['Дикий', 'Дикая', 'Дикое']),
  adjective('bright', ['Сјајни', 'Сјајна', 'Сјајно'], ['Sjajni', 'Sjajna', 'Sjajno'], 'Bright', ['Яркий', 'Яркая', 'Яркое']),
  adjective('quiet', ['Тихи', 'Тиха', 'Тихо'], ['Tihi', 'Tiha', 'Tiho'], 'Quiet', ['Тихий', 'Тихая', 'Тихое']),
  adjective('strong', ['Јаки', 'Јака', 'Јако'], ['Jaki', 'Jaka', 'Jako'], 'Strong', ['Сильный', 'Сильная', 'Сильное']),
  adjective('lucky', ['Срећни', 'Срећна', 'Срећно'], ['Srećni', 'Srećna', 'Srećno'], 'Lucky', ['Счастливый', 'Счастливая', 'Счастливое']),
  adjective('curious', ['Радознали', 'Радознала', 'Радознало'], ['Radoznali', 'Radoznala', 'Radoznalo'], 'Curious', ['Любопытный', 'Любопытная', 'Любопытное']),
  adjective('magic', ['Чаробни', 'Чаробна', 'Чаробно'], ['Čarobni', 'Čarobna', 'Čarobno'], 'Magic', ['Волшебный', 'Волшебная', 'Волшебное']),
];

export const getAdjective = (id: string | null | undefined): Adjective =>
  ADJECTIVES.find((a) => a.id === id) ?? ADJECTIVES[0]!;

/**
 * Pure and deterministic: the same three ids always give the same name. A
 * nickname is stored as the finished string, never as its parts, so that it
 * stays put when a child switches interface language and so that a friend
 * reading the album in another language sees the name they were actually told.
 */
export function makeNickname(lang: Lang, avatarId: string, adjectiveId: string): string {
  const name = getAvatar(avatarId).name[lang] ?? getAvatar(avatarId).name[DEFAULT_LANG]!;
  const forms = getAdjective(adjectiveId).forms[lang] ?? getAdjective(adjectiveId).forms[DEFAULT_LANG]!;
  // Masculine is the fallback: a missing form should read a little wrong, not
  // leave a child with a name that is half blank.
  return `${forms[name.gender] || forms.m} ${name.word}`;
}

/**
 * Pick a pair. `randomInt(n)` must return a whole number in `[0, n)` from a
 * source the caller trusts; this function only knows how many there are of each.
 */
export function pickNicknameIds(randomInt: (bound: number) => number): {
  avatarId: string;
  adjectiveId: string;
} {
  return {
    avatarId: AVATARS[randomInt(AVATARS.length)]!.id,
    adjectiveId: ADJECTIVES[randomInt(ADJECTIVES.length)]!.id,
  };
}
