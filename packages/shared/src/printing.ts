/**
 * What to feed the printer.
 *
 * The three PDFs an album produces do not want the same paper. A cover that
 * lives in a school bag wants card; pages want to be heavier than office paper
 * or the photo on the other side shows through the sticker; the stickers want
 * to be sticky. None of that is visible from the files themselves, so it is
 * described once here and said three times over — as a badge on each download,
 * as a note a parent can hand to a copy shop, and in each PDF's own metadata,
 * which is all a copy shop actually receives.
 *
 * The sentences live in `i18n.ts`; the numbers live here, so four translations
 * cannot end up disagreeing about the paper.
 */

import { PAPER_NAME, stickersPerSheet } from './geometry.ts';
import type { AlbumSize } from './geometry.ts';
import { fillerPagesNeeded } from './imposition.ts';
import { countFilled } from './numbering.ts';
import type { Translate } from './i18n.ts';
import type { Album } from './types.ts';

/** One of the three PDFs. Doubles as the URL segment and the i18n key suffix. */
export type PrintPart = 'cover' | 'pages' | 'stickers';

/** In the order they go into the printer. */
export const PRINT_PARTS: readonly PrintPart[] = ['cover', 'pages', 'stickers'];

/** The half of the filename that says which part this is. */
export const PART_SLUG: Record<PrintPart, string> = {
  cover: 'korice',
  pages: 'strane',
  stickers: 'nalepnice',
};

export interface PaperSpec {
  /**
   * Weight in grams per square metre — the one number a copy shop always asks
   * for. A range, because nobody stocks an exact figure. Null where the paper
   * is named by what it does instead, and its weight is whatever that comes in.
   */
  gsm: readonly [number, number] | null;
  /** Printed on both sides? The imposition assumes a short-edge flip if so. */
  duplex: boolean;
}

/**
 * Cover: thin card, heavy enough to stay flat and light enough to fold and
 * staple through. Pages: well above the 80 g/m² of office paper, so a sticker
 * does not show the photo behind it. Stickers: whatever weight the shop's
 * self-adhesive A4 happens to be.
 */
export const PRINT_PAPER: Record<PrintPart, PaperSpec> = {
  cover: { gsm: [200, 250], duplex: true },
  pages: { gsm: [120, 160], duplex: true },
  stickers: { gsm: null, duplex: false },
};

/** Sticker sheets are always A4, however big the album is. */
export const STICKER_PAPER = 'A4';

/** What goes in the paper tray for this part. */
export const sheetPaperFor = (part: PrintPart, size: AlbumSize): string =>
  part === 'stickers' ? STICKER_PAPER : PAPER_NAME[size];

/** How many sheets each part takes. Arithmetic on the album, nothing else. */
export function printSheetCounts(album: Pick<Album, 'pages'>): Record<PrintPart, number> {
  const pages = album.pages.length + fillerPagesNeeded(album.pages.length);
  return {
    cover: 1,
    pages: pages / 4,
    stickers: Math.ceil(countFilled(album) / stickersPerSheet('full')),
  };
}

/**
 * A filename a parent can recognise in their downloads folder, and a print
 * shop can read back over the phone. ASCII only: the title may be Cyrillic,
 * and a `content-disposition` header is not the place to find out how a given
 * browser feels about that.
 */
export function printFileName(title: string, part: PrintPart): string {
  const ascii = title
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .trim()
    .slice(0, 40);
  return `${ascii || 'album'}-${PART_SLUG[part]}.pdf`;
}

/** The paper for one part, named in the reader's language. */
export const paperText = (t: Translate, part: PrintPart): string => {
  const { gsm } = PRINT_PAPER[part];
  return t(`print.paper.${part}`, gsm ? { gsm: `${gsm[0]}–${gsm[1]}` } : undefined);
};

export interface PartPrintInfo {
  part: PrintPart;
  /** The file the print shop will be looking at. */
  file: string;
  /** Paper size in the tray: the album's sheet, or A4 for stickers. */
  sheet: string;
  sheets: number;
  duplex: boolean;
  /** The paper itself: "Card stock 200-250 gsm". */
  paper: string;
  /** "3 x A3 - double-sided", for under the part's name. */
  sheetsLine: string;
  /** The whole instruction for this file, as one sentence for a print shop. */
  specLine: string;
}

/** Everything there is to say about printing one part. */
export function describePart(
  t: Translate,
  part: PrintPart,
  input: { sheet: string; sheets: number; file: string },
): PartPrintInfo {
  const { duplex } = PRINT_PAPER[part];
  const paper = paperText(t, part);
  return {
    part,
    file: input.file,
    sheet: input.sheet,
    sheets: input.sheets,
    duplex,
    paper,
    sheetsLine: t(duplex ? 'print.sheets.duplex' : 'print.sheets.single', { n: input.sheets, sheet: input.sheet }),
    specLine: t(duplex ? 'print.spec.duplex' : 'print.spec.single', {
      file: input.file,
      n: input.sheets,
      sheet: input.sheet,
      paper,
    }),
  };
}

/** Same, straight from an album — for the server, which has the whole thing. */
export const describeAlbumPart = (t: Translate, part: PrintPart, album: Pick<Album, 'pages' | 'title' | 'size'>) =>
  describePart(t, part, {
    sheet: sheetPaperFor(part, album.size),
    sheets: printSheetCounts(album)[part],
    file: printFileName(album.title, part),
  });

/**
 * The note a parent pastes into a message to a copy shop: how to print, one
 * line per file, and what to do with the paper afterwards.
 */
export const printShopNote = (t: Translate, parts: readonly PartPrintInfo[]): string =>
  [t('print.shop.intro'), ...parts.map((p) => `• ${p.specLine}`), t('print.shop.finish')].join('\n');
