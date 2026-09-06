/**
 * The print job, described for a reader.
 *
 * The dialog inside the editor and the sheet you hold up at the copy shop say
 * the same three things about the same three files, so they say them from one
 * place here. What the paper is, how many sheets it takes and which sides get
 * printed all come from `@album/shared` — the same description each PDF
 * carries in its own metadata.
 */

import type { Lang, PartPrintInfo, PrintOptions, PrintPart, Translate } from '@album/shared';
import { DEFAULT_NUMBER_SIDE, DEFAULT_PRINT_OPTIONS, PRINT_PARTS, describePart, isNumberSide, printFileName } from '@album/shared';
import type { PrintSummary } from './api.ts';

/** Icon and badge colour per part. Everything else about them is shared data. */
export const PART_LOOK: Record<PrintPart, { icon: string; chip: string }> = {
  cover: { icon: '📕', chip: 'card' },
  pages: { icon: '📄', chip: 'text' },
  stickers: { icon: '✨', chip: 'sticky' },
};

/**
 * The three parts of the job, in the order they go into the printer. `lang` is
 * the album's own, so the filename the download wears here matches the one the
 * server writes into `content-disposition` and the PDF's metadata.
 */
export const printParts = (
  t: Translate,
  summary: PrintSummary,
  title: string,
  lang: Lang,
  opts: PrintOptions = DEFAULT_PRINT_OPTIONS,
): PartPrintInfo[] =>
  PRINT_PARTS.map((part) =>
    describePart(
      t,
      part,
      {
        sheet: part === 'stickers' ? summary.stickerPaper : summary.sheetPaper,
        sheets: { cover: summary.coverSheets, pages: summary.pageSheets, stickers: summary.stickerSheets }[part],
        file: printFileName(title, part, lang),
      },
      opts,
    ),
  );

/**
 * Where the print-shop sheet lives. A URL of its own, because whoever is
 * standing at the counter with a phone should not have to find it three taps
 * deep inside the editor — and because a link can be sent to whoever is
 * actually doing the printing.
 */
export const noticePath = (token: string, opts: PrintOptions = DEFAULT_PRINT_OPTIONS): string => {
  const base = `/a/${encodeURIComponent(token)}/print`;
  // The default needs no saying, and a link without a tail is easier to read
  // out loud — which is what happens to this one.
  return opts.numbers === DEFAULT_NUMBER_SIDE ? base : `${base}?numbers=${opts.numbers}`;
};

/**
 * The job as the link describes it. The print-shop sheet is opened by URL, in
 * a tab of its own or on somebody else's phone, so the choice made back in the
 * dialog reaches it the only way it can: in the address.
 */
export const printOptionsFromSearch = (search: string): PrintOptions => {
  const asked = new URLSearchParams(search).get('numbers');
  return { numbers: isNumberSide(asked) ? asked : DEFAULT_NUMBER_SIDE };
};
