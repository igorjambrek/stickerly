/**
 * The single source of truth for album geometry.
 *
 * All rectangles are in millimetres with the origin at the TOP-LEFT of their
 * container and y growing DOWNWARDS (the SVG convention). The PDF renderer is
 * the only place that flips into PDF's y-up space; the editor uses these
 * numbers directly with a mm -> px scale factor. Nothing else may define a
 * layout constant.
 *
 * A child makes two choices here — a small album or a big one, and how many
 * stickers go on a page. Everything else follows from those two, and from the
 * fact that a sticker is a physical object whose size never changes.
 */

export interface Size {
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How big the finished album is, named after the paper that goes into the
 * printer. `a4` folds A4 sheets into A5 pages; `a3` folds A3 sheets into A4
 * pages. The choice is made once, when the album is created, because it
 * decides how many stickers can fit on a page.
 */
export type AlbumSize = 'a4' | 'a3';

export const ALBUM_SIZES: readonly AlbumSize[] = ['a4', 'a3'];

export const DEFAULT_ALBUM_SIZE: AlbumSize = 'a3';

/** What a grown-up calls the paper. */
export const PAPER_NAME: Record<AlbumSize, string> = { a4: 'A4', a3: 'A3' };

/**
 * The reference page.
 *
 * Cover artwork and page chrome are authored once, at this size, and drawn
 * through a uniform scale onto whichever page the child chose. The A series
 * keeps its proportions when halved, so a single scale factor is enough and
 * nothing ever has to be re-laid out per size.
 */
export const REF_PAGE: Size = { w: 210, h: 297 };

/** Classic Panini sticker. The same physical size in every album, always. */
export const STICKER: Size = { w: 50, h: 70 };

/** Corner rounding on stickers and on the outlines they get stuck into. */
export const STICKER_RADIUS = 3;

/** Sticker paper: A4 portrait, whatever size the album is. */
export const STICKER_SHEET: Size = { w: 210, h: 297 };

/**
 * Page chrome, in reference millimetres: the title band at the top and the
 * page-number footer. Drawn scaled, so it keeps its proportions on both sizes.
 */
export const PAGE_CHROME = {
  marginX: 22,
  headerTop: 15,
  headerH: 12,
  footerY: 286,
  /** Top of the page-number pill, which the sticker grid must clear. */
  footerTop: 280,
} as const;

/** Baseline y for the page-number footer, in reference millimetres. */
export const FOOTER_Y = PAGE_CHROME.footerY;

/** The page-title band, in reference millimetres. */
export function pageHeaderRect(): Rect {
  return {
    x: PAGE_CHROME.marginX,
    y: PAGE_CHROME.headerTop,
    w: REF_PAGE.w - 2 * PAGE_CHROME.marginX,
    h: PAGE_CHROME.headerH,
  };
}

/** Gap between the title band and the first row of slots, in reference mm. */
const HEADER_GAP = 7;

/** Breathing room between slots, in real millimetres. */
const GAP_X = 8;
const GAP_Y = 6;

/** Name strip printed directly under each sticker outline. */
const LABEL_H = 6;

/**
 * How many stickers a page can hold.
 *
 * The sticker grid is the one thing that is never scaled: a slot outline has
 * to measure exactly 50 x 70 mm on paper or the sticker will not fit it. So a
 * smaller album gets FEWER slots, never smaller ones, and "how many per page"
 * is a real choice rather than a zoom level.
 */
export interface GridChoice {
  perPage: number;
  cols: number;
  rows: number;
}

export const GRID_CHOICES: Record<AlbumSize, readonly GridChoice[]> = {
  a4: [
    { perPage: 2, cols: 1, rows: 2 },
    { perPage: 4, cols: 2, rows: 2 },
  ],
  a3: [
    { perPage: 4, cols: 2, rows: 2 },
    { perPage: 6, cols: 2, rows: 3 },
    { perPage: 9, cols: 3, rows: 3 },
  ],
};

/** What a new album starts with: as full a page as the paper allows. */
export const DEFAULT_SLOTS_PER_PAGE: Record<AlbumSize, number> = { a4: 4, a3: 9 };

export const slotsPerPageChoices = (size: AlbumSize): readonly number[] =>
  GRID_CHOICES[size].map((c) => c.perPage);

/** What actually goes into the printer: landscape, folded down the middle. */
const SHEETS: Record<AlbumSize, Size> = {
  a4: { w: 297, h: 210 },
  a3: { w: 420, h: 297 },
};

export interface PageLayout {
  size: AlbumSize;
  /** The printed sheet, landscape. */
  sheet: Size;
  /** One album page: half a sheet. */
  page: Size;
  /**
   * Reference millimetres -> page millimetres. Artwork and chrome are drawn
   * through this; the sticker grid is not.
   */
  scale: number;
  /** The two halves of a printed sheet, in sheet coordinates. */
  halves: { left: Rect; right: Rect };
  grid: GridChoice & { marginX: number; top: number; gapX: number; gapY: number; labelH: number };
  slotsPerPage: number;
  /** Height of one grid cell: the sticker itself plus its name strip. */
  cellH: number;
  /** The sticker outline for slot `index` within a page, in page millimetres. */
  slotRect(index: number): Rect;
  /** The name strip under slot `index`. */
  slotLabelRect(index: number): Rect;
}

/** Round away binary dust so derived margins compare cleanly. */
const tidy = (v: number) => Math.round(v * 10000) / 10000;

function makeLayout(size: AlbumSize, choice: GridChoice): PageLayout {
  const sheet = SHEETS[size];
  const page: Size = { w: sheet.w / 2, h: sheet.h };
  const scale = page.w / REF_PAGE.w;
  const cellH = STICKER.h + LABEL_H;

  // Centre the block horizontally, and centre it vertically in whatever room
  // the title band and the page-number pill leave behind.
  const blockW = choice.cols * STICKER.w + (choice.cols - 1) * GAP_X;
  const blockH = choice.rows * cellH + (choice.rows - 1) * GAP_Y;
  const bandTop = (PAGE_CHROME.headerTop + PAGE_CHROME.headerH + HEADER_GAP) * scale;
  const bandBottom = PAGE_CHROME.footerTop * scale;

  const marginX = tidy((page.w - blockW) / 2);
  // Slightly above true centre: a block sitting dead centre under a title band
  // reads as sagging, and a sparse page is where that shows most.
  const top = tidy(bandTop + Math.max(0, (bandBottom - bandTop - blockH) * 0.45));
  const slotsPerPage = choice.cols * choice.rows;

  const slotRect = (index: number): Rect => {
    if (index < 0 || index >= slotsPerPage) {
      throw new RangeError(`slot index ${index} out of range 0..${slotsPerPage - 1}`);
    }
    return {
      x: marginX + (index % choice.cols) * (STICKER.w + GAP_X),
      y: top + Math.floor(index / choice.cols) * (cellH + GAP_Y),
      w: STICKER.w,
      h: STICKER.h,
    };
  };

  return {
    size,
    sheet,
    page,
    scale,
    halves: {
      left: { x: 0, y: 0, w: page.w, h: page.h },
      right: { x: page.w, y: 0, w: page.w, h: page.h },
    },
    grid: { ...choice, marginX, top, gapX: GAP_X, gapY: GAP_Y, labelH: LABEL_H },
    slotsPerPage,
    cellH,
    slotRect,
    slotLabelRect(index: number): Rect {
      const s = slotRect(index);
      return { x: s.x, y: s.y + s.h, w: s.w, h: LABEL_H };
    },
  };
}

const LAYOUTS: Record<AlbumSize, Map<number, PageLayout>> = {
  a4: new Map(GRID_CHOICES.a4.map((c) => [c.perPage, makeLayout('a4', c)])),
  a3: new Map(GRID_CHOICES.a3.map((c) => [c.perPage, makeLayout('a3', c)])),
};

export const isAlbumSize = (v: unknown): v is AlbumSize => ALBUM_SIZES.includes(v as AlbumSize);

/**
 * The layout for an album. Never throws: an album carrying a size or a slot
 * count we do not recognise still opens, on the nearest sensible layout.
 */
export function layoutFor(size: unknown, slotsPerPage?: unknown): PageLayout {
  const key: AlbumSize = isAlbumSize(size) ? size : DEFAULT_ALBUM_SIZE;
  const byCount = LAYOUTS[key];
  return byCount.get(Number(slotsPerPage)) ?? byCount.get(DEFAULT_SLOTS_PER_PAGE[key])!;
}

/** Snap a requested slot count onto one this album size can actually print. */
export function normaliseSlotsPerPage(size: AlbumSize, slotsPerPage: unknown): number {
  return layoutFor(size, slotsPerPage).slotsPerPage;
}

/**
 * Sticker sheet layouts. `full` packs stickers edge to edge like a real Panini
 * sheet; `safe` is the fallback for printers that cannot manage a 5 mm side
 * margin. This choice lives in grown-up settings and never appears in the
 * child's UI. Sticker sheets are A4 whatever size the album is.
 */
export const SHEET_LAYOUTS = {
  full: { cols: 4, rows: 4, marginX: 5, marginTop: 6 },
  safe: { cols: 3, rows: 4, marginX: 30, marginTop: 6 },
} as const;

export type SheetLayoutName = keyof typeof SHEET_LAYOUTS;

export const stickersPerSheet = (layout: SheetLayoutName): number =>
  SHEET_LAYOUTS[layout].cols * SHEET_LAYOUTS[layout].rows;

/** Position of sticker `index` on a sticker sheet, in sheet coordinates. */
export function stickerSheetRect(index: number, layout: SheetLayoutName): Rect {
  const L = SHEET_LAYOUTS[layout];
  const per = L.cols * L.rows;
  if (index < 0 || index >= per) {
    throw new RangeError(`sticker index ${index} out of range 0..${per - 1}`);
  }
  return {
    x: L.marginX + (index % L.cols) * STICKER.w,
    y: L.marginTop + Math.floor(index / L.cols) * STICKER.h,
    w: STICKER.w,
    h: STICKER.h,
  };
}

/** The 50 mm calibration ruler printed in the bottom margin of every sticker sheet. */
export const CALIBRATION = {
  length: 50,
  y: 289,
  height: 2.5,
  get x() {
    return (STICKER_SHEET.w - CALIBRATION.length) / 2;
  },
};

/** Shift a rect into a container (used to place page content onto a sheet half). */
export const offsetRect = (r: Rect, dx: number, dy: number): Rect => ({
  x: r.x + dx,
  y: r.y + dy,
  w: r.w,
  h: r.h,
});
