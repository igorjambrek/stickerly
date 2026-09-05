/**
 * Saddle-stitch imposition: turning a run of album pages into printed sheets.
 *
 * The child adds pages one at a time and never learns that a folded booklet
 * needs a page count divisible by four. `padToSignature` absorbs that rule and
 * the print pipeline quietly appends filler pages to make up the difference.
 *
 * Sheets are printed double-sided with the FLIP ON SHORT EDGE, which mirrors
 * the back of the sheet left-to-right. Every formula below assumes that flip.
 */

/** Album pages per printed sheet: two halves, two sides. */
export const PAGES_PER_SHEET = 4;

export type SheetSideName = 'front' | 'back';

export interface SheetSide {
  /** 0-based index of the physical sheet, outermost first. */
  sheet: number;
  side: SheetSideName;
  /** 1-based album page number printed on the left half. */
  left: number;
  /** 1-based album page number printed on the right half. */
  right: number;
}

/** Round a page count up to a whole number of sheets (minimum one sheet). */
export const padToSignature = (pageCount: number): number =>
  Math.max(PAGES_PER_SHEET, Math.ceil(pageCount / PAGES_PER_SHEET) * PAGES_PER_SHEET);

/** How many filler pages must be appended before printing. */
export const fillerPagesNeeded = (pageCount: number): number =>
  padToSignature(pageCount) - pageCount;

/**
 * Lay out `pageCount` album pages onto sheet sides, in the order they should
 * appear in the PDF. `pageCount` must already be a multiple of four.
 */
export function impose(pageCount: number): SheetSide[] {
  if (pageCount <= 0 || pageCount % PAGES_PER_SHEET !== 0) {
    throw new RangeError(`pageCount must be a positive multiple of ${PAGES_PER_SHEET}, got ${pageCount}`);
  }
  const sheets = pageCount / PAGES_PER_SHEET;
  const sides: SheetSide[] = [];
  for (let s = 0; s < sheets; s++) {
    // Front: the outermost remaining page on the left, its partner on the right.
    sides.push({ sheet: s, side: 'front', left: pageCount - 2 * s, right: 2 * s + 1 });
    // Back: mirrored by the short-edge flip, so each page lands behind its partner.
    sides.push({ sheet: s, side: 'back', left: 2 * s + 2, right: pageCount - 2 * s - 1 });
  }
  return sides;
}

/**
 * What the child actually sees: two facing pages.
 *
 * Folded and stapled, page 1 has nothing on its left — the inside of the front
 * cover faces it — and the last page is left alone the same way. Every other
 * page is paired even-on-the-left, odd-on-the-right. It is the same rule
 * `pageArt` mirrors its corner motif on, and the rule the editor shows an
 * album by, so a page is never looked at out of the company it prints in.
 */
export interface Spread {
  /** 0-based, in the order the pages are turned. */
  index: number;
  /** 1-based album page on the left half; null when a cover panel faces it. */
  left: number | null;
  /** 1-based album page on the right half; null when a cover panel faces it. */
  right: number | null;
}

/** Which spread a 1-based page is seen on. */
export const spreadOfPage = (pageNumber: number): number =>
  Math.floor(Math.max(1, Math.floor(pageNumber)) / 2);

/** Every spread in an album of `pageCount` pages, in reading order. */
export function spreads(pageCount: number): Spread[] {
  const total = Math.max(0, Math.floor(pageCount));
  const out: Spread[] = [];
  for (let index = 0; total > 0 && index * 2 <= total; index++) {
    const right = index * 2 + 1;
    out.push({
      index,
      left: index === 0 ? null : index * 2,
      right: right <= total ? right : null,
    });
  }
  return out;
}

/**
 * The cover is its own sheet wrapped around the block. Folded, the outside
 * shows back-cover | front-cover; the short-edge flip puts the inside-front
 * panel directly behind the front cover.
 */
export type CoverPanel = 'back' | 'front' | 'insideFront' | 'insideBack';

export interface CoverSide {
  side: 'outside' | 'inside';
  left: CoverPanel;
  right: CoverPanel;
}

export const COVER_SIDES: readonly CoverSide[] = [
  { side: 'outside', left: 'back', right: 'front' },
  { side: 'inside', left: 'insideFront', right: 'insideBack' },
];
