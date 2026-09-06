/**
 * The single source of truth for album geometry.
 *
 * All rectangles are in millimetres with the origin at the TOP-LEFT of their
 * container and y growing DOWNWARDS (the SVG convention). The PDF renderer is
 * the only place that flips into PDF's y-up space; the editor uses these
 * numbers directly with a mm -> px scale factor. Nothing else may define a
 * layout constant.
 *
 * A child makes three choices here — a small album or a big one, which way up
 * a sticker stands, and how many go on a page. Everything else follows from
 * those, and from the fact that a sticker is a physical object whose size
 * never changes.
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

/**
 * Which way up a sticker stands.
 *
 * It is the same physical rectangle either way — turned, never resized — but
 * turning it changes what fits on a page, so it is chosen once beside the
 * album size and the slot count and never afterwards.
 */
export type StickerOrientation = 'portrait' | 'landscape';

export const STICKER_ORIENTATIONS: readonly StickerOrientation[] = ['portrait', 'landscape'];

export const DEFAULT_ORIENTATION: StickerOrientation = 'portrait';

export const isStickerOrientation = (v: unknown): v is StickerOrientation =>
  STICKER_ORIENTATIONS.includes(v as StickerOrientation);

/** Classic Panini sticker, standing up. The same physical size in every album, always. */
export const STICKER: Size = { w: 50, h: 70 };

/** The same rectangle, the way this album turns it. */
export const stickerSize = (orientation: StickerOrientation = DEFAULT_ORIENTATION): Size =>
  orientation === 'landscape' ? { w: STICKER.h, h: STICKER.w } : { w: STICKER.w, h: STICKER.h };

/** Corner rounding on stickers and on the outlines they get stuck into. */
export const STICKER_RADIUS = 3;

/**
 * Sticker paper: A4 portrait, whatever size the album is and whichever way its
 * stickers stand.
 *
 * A lying sticker is printed on its side in an upright cell rather than given
 * a sheet of its own. It is a rectangle of paper about to be cut out: whoever
 * cuts it turns it, and one grid with one cut pitch beats two sheets of
 * part-empty paper.
 */
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

/**
 * Every grid a child can pick, per orientation and per paper.
 *
 * None of these is a free choice: each is an arrangement whose block of
 * 50 x 70 (or 70 x 50) slots still clears the title band, the page number and
 * both side margins, which the geometry tests re-derive rather than trust.
 * That is also why the small album has a single landscape grid — two 70 mm
 * stickers side by side are wider than half an A4 sheet, so a wide sticker
 * gets a column to itself there.
 */
export const GRID_CHOICES: Record<StickerOrientation, Record<AlbumSize, readonly GridChoice[]>> = {
  portrait: {
    a4: [
      { perPage: 2, cols: 1, rows: 2 },
      { perPage: 4, cols: 2, rows: 2 },
    ],
    a3: [
      { perPage: 4, cols: 2, rows: 2 },
      { perPage: 6, cols: 2, rows: 3 },
      { perPage: 9, cols: 3, rows: 3 },
    ],
  },
  landscape: {
    a4: [{ perPage: 2, cols: 1, rows: 2 }],
    a3: [
      { perPage: 4, cols: 2, rows: 2 },
      { perPage: 6, cols: 2, rows: 3 },
      { perPage: 8, cols: 2, rows: 4 },
    ],
  },
};

/** What a new album starts with: as full a page as the paper allows. */
export const DEFAULT_SLOTS_PER_PAGE: Record<StickerOrientation, Record<AlbumSize, number>> = {
  portrait: { a4: 4, a3: 9 },
  landscape: { a4: 2, a3: 8 },
};

export const gridChoices = (
  size: AlbumSize,
  orientation: StickerOrientation = DEFAULT_ORIENTATION,
): readonly GridChoice[] => GRID_CHOICES[orientation][size];

export const slotsPerPageChoices = (
  size: AlbumSize,
  orientation: StickerOrientation = DEFAULT_ORIENTATION,
): readonly number[] => gridChoices(size, orientation).map((c) => c.perPage);

/** What actually goes into the printer: landscape, folded down the middle. */
const SHEETS: Record<AlbumSize, Size> = {
  a4: { w: 297, h: 210 },
  a3: { w: 420, h: 297 },
};

export interface PageLayout {
  size: AlbumSize;
  /** Which way up this album stands its stickers. */
  orientation: StickerOrientation;
  /** One sticker, turned the way this album turns it. */
  sticker: Size;
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

/**
 * One slot on a page, as the grid sees it.
 *
 * A slot standing the way its album does takes one cell. A slot turned against
 * it takes two — the classic team photo, which in a real album is where two
 * ordinary stickers would have gone. That is the only arrangement that keeps
 * the rule everything else here depends on: a sticker is a physical 50 x 70 mm
 * rectangle and is never resized, only turned, so the room for a turned one
 * has to be found rather than made.
 */
export interface SlotSpan {
  /** The first cell it covers, which is also the slot's position. */
  start: number;
  /** Every cell it covers: one, or two side by side (or stacked). */
  cells: number[];
  /** The sticker outline itself, centred in what those cells give it. */
  rect: Rect;
  /** The name strip, directly under the sticker. */
  label: Rect;
}

/** Round away binary dust so derived margins compare cleanly. */
const tidy = (v: number) => Math.round(v * 10000) / 10000;

function makeLayout(size: AlbumSize, orientation: StickerOrientation, choice: GridChoice): PageLayout {
  const sheet = SHEETS[size];
  const page: Size = { w: sheet.w / 2, h: sheet.h };
  const scale = page.w / REF_PAGE.w;
  const sticker = stickerSize(orientation);
  const cellH = sticker.h + LABEL_H;

  // Centre the block horizontally, and centre it vertically in whatever room
  // the title band and the page-number pill leave behind.
  const blockW = choice.cols * sticker.w + (choice.cols - 1) * GAP_X;
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
      x: marginX + (index % choice.cols) * (sticker.w + GAP_X),
      y: top + Math.floor(index / choice.cols) * (cellH + GAP_Y),
      w: sticker.w,
      h: sticker.h,
    };
  };

  return {
    size,
    orientation,
    sticker,
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

const layoutsFor = (orientation: StickerOrientation): Record<AlbumSize, Map<number, PageLayout>> =>
  Object.fromEntries(
    ALBUM_SIZES.map((size) => [
      size,
      new Map(gridChoices(size, orientation).map((c) => [c.perPage, makeLayout(size, orientation, c)])),
    ]),
  ) as Record<AlbumSize, Map<number, PageLayout>>;

const LAYOUTS: Record<StickerOrientation, Record<AlbumSize, Map<number, PageLayout>>> = {
  portrait: layoutsFor('portrait'),
  landscape: layoutsFor('landscape'),
};

/**
 * Which cells a slot at `position` would take, standing the way `orientation`
 * says, or null when the grid has no room to turn it there.
 *
 * A turned sticker needs the cell beside it — to the right in an album of
 * standing stickers, below it in an album of lying ones — and takes the one
 * behind it instead when it is at the end of the run. That second case is not
 * an edge case: in a two-column grid half the stickers are in the last column,
 * and a team photo that could not go on the right-hand side of a page would be
 * a strange rule to explain to a child.
 */
export function slotSpanOf(
  layout: PageLayout,
  position: number,
  orientation: StickerOrientation,
): SlotSpan | null {
  const { cols, rows } = layout.grid;
  if (position < 0 || position >= layout.slotsPerPage) return null;

  if (orientation === layout.orientation) {
    const rect = layout.slotRect(position);
    return { start: position, cells: [position], rect, label: layout.slotLabelRect(position) };
  }

  // Along the row for a standing album, down the column for a lying one:
  // either way, the direction that turns two cells into a square-ish hole.
  const step = layout.orientation === 'portrait' ? 1 : cols;
  const sameRun = (a: number, b: number) =>
    step === 1 ? Math.floor(a / cols) === Math.floor(b / cols) : b >= 0 && b < cols * rows;

  const start = sameRun(position, position + step)
    ? position
    : sameRun(position, position - step)
      ? position - step
      : null;
  if (start === null) return null;

  const cells = [start, start + step];
  const first = layout.slotRect(cells[0]!);
  const last = layout.slotRect(cells[1]!);
  const sticker = stickerSize(orientation);

  // The hole the two cells leave, with the turned sticker centred in it.
  const hole: Rect = {
    x: first.x,
    y: first.y,
    w: last.x + last.w - first.x,
    h: last.y + last.h - first.y,
  };
  const rect: Rect = {
    x: tidy(hole.x + (hole.w - sticker.w) / 2),
    y: tidy(hole.y + (hole.h - sticker.h) / 2),
    w: sticker.w,
    h: sticker.h,
  };
  return { start, cells, rect, label: { x: rect.x, y: rect.y + rect.h, w: rect.w, h: LABEL_H } };
}

/** Can a slot at `position` be turned at all, given what the grid gives it? */
export const canTurnSlot = (layout: PageLayout, position: number): boolean =>
  slotSpanOf(layout, position, otherOrientation(layout.orientation)) !== null;

/** The other way up. */
export const otherOrientation = (orientation: StickerOrientation): StickerOrientation =>
  orientation === 'portrait' ? 'landscape' : 'portrait';

export const isAlbumSize = (v: unknown): v is AlbumSize => ALBUM_SIZES.includes(v as AlbumSize);

/**
 * The layout for an album. Never throws: an album carrying a size, an
 * orientation or a slot count we do not recognise still opens, on the nearest
 * sensible layout.
 */
export function layoutFor(size: unknown, slotsPerPage?: unknown, orientation?: unknown): PageLayout {
  const key: AlbumSize = isAlbumSize(size) ? size : DEFAULT_ALBUM_SIZE;
  const way: StickerOrientation = isStickerOrientation(orientation) ? orientation : DEFAULT_ORIENTATION;
  const byCount = LAYOUTS[way][key];
  return byCount.get(Number(slotsPerPage)) ?? byCount.get(DEFAULT_SLOTS_PER_PAGE[way][key])!;
}

/** Snap a requested slot count onto one this album size can actually print. */
export function normaliseSlotsPerPage(
  size: AlbumSize,
  slotsPerPage: unknown,
  orientation?: StickerOrientation,
): number {
  return layoutFor(size, slotsPerPage, orientation).slotsPerPage;
}

/**
 * Sticker sheet layouts. `full` packs stickers edge to edge like a real Panini
 * sheet; `safe` is the fallback for printers that cannot manage a 5 mm side
 * margin. This choice lives in grown-up settings and never appears in the
 * child's UI. Sticker sheets are A4 whatever size the album is.
 *
 * The cell is always the upright sticker, because a lying one is printed lying
 * inside it — the same rectangle of paper, printed on its side and turned once
 * it has been cut out.
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

/**
 * The same cell, seen from the back of the sheet.
 *
 * A sticker's number is not printed on its face — it goes on the backing
 * paper, where it is there while the sticker is being cut out and matched to
 * its slot, and peels away with the liner when the sticker is stuck in. So the
 * sticker sheet is printed on both sides like the rest of the job, and each
 * number has to land exactly behind its own cell. The flip is on the short
 * edge, which on an upright A4 sheet keeps left where it is and swaps top for
 * bottom.
 */
export const backOfSheet = (r: Rect): Rect => ({ x: r.x, y: STICKER_SHEET.h - r.y - r.h, w: r.w, h: r.h });

/** Where sticker `index`'s number goes: behind the cell the sticker is printed on. */
export const stickerBackRect = (index: number, layout: SheetLayoutName): Rect =>
  backOfSheet(stickerSheetRect(index, layout));

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
