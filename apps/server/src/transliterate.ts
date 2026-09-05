/**
 * Serbian Latin, respelled the way Serbian Cyrillic spells the same sounds.
 *
 * The two scripts are one language said the same way — `lav` and `лав` are the
 * same word — but they are not one language *ranked* the same way. Serbian
 * Wikipedia's own search treats them as different strings: asked for `lav` it
 * ranks the actress Caitlyn Taylor Love's article (`Tejlor Lav`) first and the
 * animal nowhere in the top ten; asked for `лав` it ranks the animal first.
 * `entities.ts` needs the second answer, and a voice search on this app hands
 * it the first — the recogniser writes Serbian in Latin more often than not,
 * whichever script the editor itself is set to.
 *
 * So the query is respelled before it is asked of Serbian Wikipedia, never
 * shown to anyone. This is a lookup key, not a translation.
 *
 * Nothing here needs to detect which script it was given: every letter this
 * table does not know — punctuation, digits, and Cyrillic itself — passes
 * through untouched, which makes the function safe to run on text that may
 * already be Cyrillic.
 */

/** Digraphs first, longest match first, so `nj` is not read as `n` then `j`. */
const DIGRAPHS: ReadonlyArray<readonly [string, string]> = [
  ['nj', 'њ'],
  ['lj', 'љ'],
  ['dž', 'џ'],
];

const LETTERS: Readonly<Record<string, string>> = {
  a: 'а',
  b: 'б',
  v: 'в',
  g: 'г',
  d: 'д',
  đ: 'ђ',
  e: 'е',
  ž: 'ж',
  z: 'з',
  i: 'и',
  j: 'ј',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  r: 'р',
  s: 'с',
  t: 'т',
  ć: 'ћ',
  u: 'у',
  f: 'ф',
  h: 'х',
  c: 'ц',
  č: 'ч',
  š: 'ш',
};

/** A lone letter's case survives the swap; a digraph has one Cyrillic glyph for
 *  both cases, so `Nj` and `NJ` alike become the single capital `Њ`. */
const isUpper = (ch: string): boolean => ch !== ch.toLowerCase() && ch === ch.toUpperCase();

export function toCyrillic(latin: string): string {
  const lower = latin.toLowerCase();
  let out = '';

  for (let i = 0; i < latin.length; ) {
    const digraph = DIGRAPHS.find(([pair]) => lower.startsWith(pair, i));
    if (digraph) {
      const [, cyr] = digraph;
      out += isUpper(latin[i]!) ? cyr.toUpperCase() : cyr;
      i += 2;
      continue;
    }

    const mapped = LETTERS[lower[i]!];
    out += mapped ? (isUpper(latin[i]!) ? mapped.toUpperCase() : mapped) : latin[i];
    i++;
  }

  return out;
}
