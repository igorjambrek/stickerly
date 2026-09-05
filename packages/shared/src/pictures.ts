/**
 * Finding a picture by asking for it out loud.
 *
 * A child who wants a lion on sticker 7 has a photo of one on nobody's phone.
 * So there is a third way into a slot, beside the drag and the camera: say what
 * you want, and pick it off a shelf of pictures.
 *
 * This file is the vocabulary both sides use for that, here for the same reason
 * the live protocol is here — a field the server fills and the editor does not
 * read is a bug you find on a child's screen.
 *
 * Two things are worth knowing about the shape:
 *
 * A result never hands the browser the address it was found at. `pick` is an
 * opaque, signed, short-lived handle, and the server will only fetch a picture
 * for a handle it signed itself. The browser could not usefully fetch the
 * original anyway — a cross-origin image cannot be read back out of a canvas —
 * but the real point is that "download this URL for me" must never be a thing
 * this server offers to whoever asks.
 *
 * And every result carries where it came from and what it may be used for.
 * These albums get printed, handed out and stuck in someone's book, so the
 * licence is part of the picture, not a footnote.
 */

import type { Lang } from './types.ts';

/** Long enough for a sentence a child would say; short enough not to be a payload. */
export const MAX_QUERY = 80;

/** One picture on the shelf. */
export interface PictureHit {
  /** Stable within one search, for React keys. Not an id anything can be looked up by. */
  id: string;
  /** Small preview, loaded straight from the provider by the browser. */
  thumbUrl: string;
  width: number;
  height: number;
  /** What the provider calls it; shown under the picture and used as an alt text. */
  title: string;
  /** Who made it or where it lives — the credit a printed album owes. */
  source: string;
  /** Short licence tag, e.g. `CC BY`, `Public domain`, or '' when unknown. */
  licence: string;
  /** Signed, expiring handle. The only way to ask for these bytes. */
  pick: string;
}

export interface PictureSearch {
  /** Which shelf this came off: `openverse`, `google`. */
  provider: string;
  query: string;
  results: PictureHit[];
}

/**
 * What the server can do, asked once so the editor does not offer a door that
 * opens onto nothing. Picture search is off when the deployment says so.
 */
export interface Features {
  pictureSearch: boolean;
}

/**
 * The tag the browser's speech recogniser wants.
 *
 * Both Serbian scripts are one spoken language — you say `лав` and `lav` the
 * same way — so they ask for the same recogniser and differ only in what comes
 * back written down, which is the provider's business and not ours.
 */
export const speechLang = (lang: Lang): string =>
  lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'sr-RS';

/** Trim, collapse the whitespace a dictation leaves behind, and cap the length. */
export const cleanQuery = (raw: string): string =>
  raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
