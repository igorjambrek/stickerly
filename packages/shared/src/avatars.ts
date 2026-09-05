/**
 * Who a child is, as a picture.
 *
 * An avatar is data, like every other piece of artwork in this app: an emoji
 * and its name in each language. The name is here rather than in `i18n.ts` for
 * the same reason theme and cover names are — it belongs to the thing, not to
 * the interface — but it carries one extra piece of information those do not.
 *
 * Every noun records its grammatical gender, because a generated nickname is an
 * adjective in front of it and Serbian and Russian adjectives have to agree:
 * `Брзи Лав`, but `Брза Ракета`. Gender is per language and genuinely differs
 * between them — `облак` is masculine in Serbian while `облако` is neuter in
 * Russian — so it cannot be stored once on the avatar. English has no gendered
 * adjectives at all; its gender is recorded anyway so the type stays uniform,
 * and `nicknames.ts` never reads it.
 */

import type { Lang } from './types.ts';

export type Gender = 'm' | 'f' | 'n';

export interface AvatarName {
  word: string;
  gender: Gender;
}

export interface Avatar {
  id: string;
  emoji: string;
  name: Record<Lang, AvatarName>;
}

const avatar = (
  id: string,
  emoji: string,
  srCyrl: [string, Gender],
  srLatn: [string, Gender],
  en: string,
  ru: [string, Gender],
): Avatar => ({
  id,
  emoji,
  name: {
    'sr-Cyrl': { word: srCyrl[0], gender: srCyrl[1] },
    'sr-Latn': { word: srLatn[0], gender: srLatn[1] },
    en: { word: en, gender: 'm' },
    ru: { word: ru[0], gender: ru[1] },
  },
});

/**
 * Animals, machines and things in the sky — nothing that reads as a person.
 * A child picking an avatar should never be picking a stand-in for their face.
 */
export const AVATARS: readonly Avatar[] = [
  avatar('lion', '🦁', ['Лав', 'm'], ['Lav', 'm'], 'Lion', ['Лев', 'm']),
  avatar('fox', '🦊', ['Лисица', 'f'], ['Lisica', 'f'], 'Fox', ['Лиса', 'f']),
  avatar('bear', '🐻', ['Медвед', 'm'], ['Medved', 'm'], 'Bear', ['Медведь', 'm']),
  avatar('owl', '🦉', ['Сова', 'f'], ['Sova', 'f'], 'Owl', ['Сова', 'f']),
  avatar('cat', '🐱', ['Мачак', 'm'], ['Mačak', 'm'], 'Cat', ['Кот', 'm']),
  avatar('dog', '🐶', ['Пас', 'm'], ['Pas', 'm'], 'Dog', ['Пёс', 'm']),
  avatar('rabbit', '🐰', ['Зец', 'm'], ['Zec', 'm'], 'Rabbit', ['Заяц', 'm']),
  avatar('frog', '🐸', ['Жаба', 'f'], ['Žaba', 'f'], 'Frog', ['Лягушка', 'f']),
  avatar('bee', '🐝', ['Пчела', 'f'], ['Pčela', 'f'], 'Bee', ['Пчела', 'f']),
  avatar('turtle', '🐢', ['Корњача', 'f'], ['Kornjača', 'f'], 'Turtle', ['Черепаха', 'f']),
  avatar('whale', '🐳', ['Кит', 'm'], ['Kit', 'm'], 'Whale', ['Кит', 'm']),
  avatar('penguin', '🐧', ['Пингвин', 'm'], ['Pingvin', 'm'], 'Penguin', ['Пингвин', 'm']),
  avatar('panda', '🐼', ['Панда', 'f'], ['Panda', 'f'], 'Panda', ['Панда', 'f']),
  avatar('dragon', '🐉', ['Змај', 'm'], ['Zmaj', 'm'], 'Dragon', ['Дракон', 'm']),
  avatar('unicorn', '🦄', ['Једнорог', 'm'], ['Jednorog', 'm'], 'Unicorn', ['Единорог', 'm']),
  avatar('dino', '🦕', ['Диносаурус', 'm'], ['Dinosaurus', 'm'], 'Dino', ['Динозавр', 'm']),
  avatar('rocket', '🚀', ['Ракета', 'f'], ['Raketa', 'f'], 'Rocket', ['Ракета', 'f']),
  avatar('train', '🚂', ['Воз', 'm'], ['Voz', 'm'], 'Train', ['Поезд', 'm']),
  avatar('plane', '✈️', ['Авион', 'm'], ['Avion', 'm'], 'Plane', ['Самолёт', 'm']),
  avatar('ball', '⚽', ['Лопта', 'f'], ['Lopta', 'f'], 'Ball', ['Мяч', 'm']),
  avatar('star', '⭐', ['Звезда', 'f'], ['Zvezda', 'f'], 'Star', ['Звезда', 'f']),
  avatar('moon', '🌙', ['Месец', 'm'], ['Mesec', 'm'], 'Moon', ['Луна', 'f']),
  avatar('sun', '☀️', ['Сунце', 'n'], ['Sunce', 'n'], 'Sun', ['Солнце', 'n']),
  avatar('cloud', '☁️', ['Облак', 'm'], ['Oblak', 'm'], 'Cloud', ['Облако', 'n']),
];

export const DEFAULT_AVATAR_ID = 'lion';

/** An unknown id resolves to the first avatar rather than to nothing. */
export const getAvatar = (id: string | null | undefined): Avatar =>
  AVATARS.find((a) => a.id === id) ?? AVATARS.find((a) => a.id === DEFAULT_AVATAR_ID) ?? AVATARS[0]!;

export const isAvatarId = (id: unknown): boolean =>
  typeof id === 'string' && AVATARS.some((a) => a.id === id);
