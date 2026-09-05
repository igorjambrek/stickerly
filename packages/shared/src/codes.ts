/**
 * The short codes a child reads off one screen and types into another.
 *
 * These are pairing codes (this is me, on my other device) and album invites
 * (come and build this album with me). Both are minted by the server, live for
 * minutes, and can be used once — which is what lets them be short enough for a
 * six-year-old to copy by hand. The alphabet is the whole reason that works:
 * every character that can be misread as another one is missing, so a code that
 * is read correctly cannot be typed incorrectly.
 */

/**
 * Thirty characters. `0 1 I L O U` are gone: the first four because they are
 * indistinguishable from each other in most typefaces, `U` so that no code
 * accidentally spells a word a child would rather not read aloud.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export const CODE_LENGTH = 6;

/** `AB3K9P` -> `AB3-K9P`. Two short halves are easier to hold in your head. */
export const formatCode = (code: string): string =>
  code.length === CODE_LENGTH ? `${code.slice(0, 3)}-${code.slice(3)}` : code;

/**
 * Undo everything a child might reasonably do to a code on the way in: type it
 * in lower case, keep the hyphen we showed them, or space the halves apart.
 * Characters outside the alphabet are deliberately *kept* so that `isCode`
 * rejects them — silently dropping a typo could turn one person's code into
 * another's.
 */
export const normaliseCode = (input: string): string => input.toUpperCase().replace(/[\s\-_.]+/g, '');

export const isCode = (code: string): boolean =>
  code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
