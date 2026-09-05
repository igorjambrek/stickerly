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
import type { Album, Lang } from './types.ts';

/** One of the three PDFs. Doubles as the URL segment and the i18n key suffix. */
export type PrintPart = 'cover' | 'pages' | 'stickers';

/** In the order they go into the printer. */
export const PRINT_PARTS: readonly PrintPart[] = ['cover', 'pages', 'stickers'];

/**
 * The half of the filename that says which part this is, in the album's own
 * language so a parent recognises it in their downloads folder. ASCII only —
 * the Cyrillic languages carry a transliterated word, because a filename is no
 * place to test a browser's feelings about a non-Latin byte.
 */
export const PART_SLUG: Record<Lang, Record<PrintPart, string>> = {
  'sr-Cyrl': { cover: 'korice', pages: 'strane', stickers: 'nalepnice' },
  'sr-Latn': { cover: 'korice', pages: 'strane', stickers: 'nalepnice' },
  en: { cover: 'cover', pages: 'pages', stickers: 'stickers' },
  ru: { cover: 'oblozhka', pages: 'stranicy', stickers: 'nakleyki' },
};

/**
 * Cyrillic to plain Latin, so a title keeps its shape in an ASCII filename
 * instead of being dropped to nothing (which is how every album ends up
 * downloading as the same file). Serbian collapses its accents — Đ, Č, Š all
 * lose the mark — and Russian follows the usual passport spelling. The map is
 * chosen by the album's language, because the two scripts share letters they
 * pronounce differently (ц, ч, ш, ж).
 */
const TRANSLIT: Record<'sr' | 'ru', Record<string, string>> = {
  sr: {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z',
    и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c',
    ч: 'c', џ: 'dz', ш: 's',
  },
  ru: {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  },
};

const transliterate = (text: string, lang: Lang): string => {
  const table = TRANSLIT[lang === 'ru' ? 'ru' : 'sr'];
  return [...text]
    .map((ch) => {
      const rep = table[ch.toLowerCase()];
      if (rep === undefined) return ch;
      return ch === ch.toLowerCase() || rep === '' ? rep : rep[0]!.toUpperCase() + rep.slice(1);
    })
    .join('');
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
 * shop can read back over the phone: the album's name, then which of the three
 * PDFs this is, in the album's language. ASCII only — a Cyrillic title is
 * transliterated rather than dropped, so two albums never collapse onto the
 * same name, and a `content-disposition` header is not the place to find out
 * how a given browser feels about a non-Latin byte.
 */
export function printFileName(title: string, part: PrintPart, lang: Lang): string {
  const name = transliterate(title, lang)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 _-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
  return `${name || 'album'} - ${PART_SLUG[lang][part]}.pdf`;
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
export const describeAlbumPart = (
  t: Translate,
  part: PrintPart,
  album: Pick<Album, 'pages' | 'title' | 'size' | 'lang'>,
) =>
  describePart(t, part, {
    sheet: sheetPaperFor(part, album.size),
    sheets: printSheetCounts(album)[part],
    file: printFileName(album.title, part, album.lang),
  });

/**
 * The note a parent pastes into a message to a copy shop: how to print, one
 * line per file, and what to do with the paper afterwards.
 */
export const printShopNote = (t: Translate, parts: readonly PartPrintInfo[]): string =>
  [t('print.shop.intro'), ...parts.map((p) => `• ${p.specLine}`), t('print.shop.finish')].join('\n');
