/** Wire types shared by the server and the editor. */

import type { AlbumSize } from './geometry.ts';

export type Lang = 'sr-Cyrl' | 'sr-Latn' | 'en' | 'ru';

export const LANGS: readonly Lang[] = ['sr-Cyrl', 'sr-Latn', 'en', 'ru'];

export const DEFAULT_LANG: Lang = 'sr-Cyrl';

/** Album pages are either real sticker pages or padding the child never asked for. */
export type PageKind = 'sticker' | 'filler' | 'autograph';

/** How the child framed a photo inside its window. */
export interface Crop {
  /** Centre of the visible area, as a fraction of the source image (0..1). */
  x: number;
  y: number;
  /** 1 = the image exactly covers the window; larger zooms in. */
  scale: number;
}

export const DEFAULT_CROP: Crop = { x: 0.5, y: 0.5, scale: 1 };

export interface ImageRef {
  id: string;
  /** Intrinsic size of the print derivative, in pixels. */
  w: number;
  h: number;
}

export interface Slot {
  id: string;
  pageId: string;
  /** 0-based position within the page. */
  position: number;
  /** 1-based sticker number, unique across the album and assigned automatically. */
  number: number;
  label: string;
  imageId: string | null;
  crop: Crop;
  /** Which member put the photo here, once an album has more than one. */
  filledBy: string | null;
}

export interface Page {
  id: string;
  /** 0-based position within the album. */
  position: number;
  kind: PageKind;
  title: string;
  slots: Slot[];
}

export interface Album {
  id: string;
  title: string;
  templateId: string;
  /**
   * Which cover the child picked within the theme. Resolved against the
   * template's own list, so an unknown id falls back to the classic cover
   * rather than printing nothing.
   */
  coverVariantId: string;
  /** Set when the chosen cover is a photo the child uploaded. */
  coverImageId: string | null;
  coverCrop: Crop;
  /** Chosen once, at creation: it decides the paper and the page grid. */
  size: AlbumSize;
  slotsPerPage: number;
  lang: Lang;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  pages: Page[];
  images: ImageRef[];
  /** Null for every album made before passports existed. */
  ownerPersonId: string | null;
  /**
   * Everyone building this album. It rides along with the album rather than
   * living behind its own endpoint, for the same reason everything else does:
   * one response is the whole truth and the editor never merges partial state.
   */
  members: AlbumMember[];
}

/**
 * A child, as far as anyone else is concerned: a picture and a name they were
 * given or chose. There is nothing else to know about them — no address, no
 * account, no way back to a real person.
 */
export interface Person {
  id: string;
  nickname: string;
  /** An id from the AVATARS list. */
  avatar: string;
}

export type MemberRole = 'owner' | 'editor';

export interface AlbumMember extends Person {
  role: MemberRole;
  joinedAt: string;
}

/** What the editor is handed when it opens an album by its secret link. */
export interface AlbumWithToken extends Album {
  editToken: string;
}
