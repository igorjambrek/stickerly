/**
 * The print job, described for a reader.
 *
 * The dialog inside the editor and the sheet you hold up at the copy shop say
 * the same three things about the same three files, so they say them from one
 * place here. What the paper is, how many sheets it takes and which sides get
 * printed all come from `@album/shared` — the same description each PDF
 * carries in its own metadata.
 */

import type { PartPrintInfo, PrintPart, Translate } from '@album/shared';
import { PRINT_PARTS, describePart, printFileName } from '@album/shared';
import type { PrintSummary } from './api.ts';

/** Icon and badge colour per part. Everything else about them is shared data. */
export const PART_LOOK: Record<PrintPart, { icon: string; chip: string }> = {
  cover: { icon: '📕', chip: 'card' },
  pages: { icon: '📄', chip: 'text' },
  stickers: { icon: '✨', chip: 'sticky' },
};

/** The three parts of the job, in the order they go into the printer. */
export const printParts = (t: Translate, summary: PrintSummary, title: string): PartPrintInfo[] =>
  PRINT_PARTS.map((part) =>
    describePart(t, part, {
      sheet: part === 'stickers' ? summary.stickerPaper : summary.sheetPaper,
      sheets: { cover: summary.coverSheets, pages: summary.pageSheets, stickers: summary.stickerSheets }[part],
      file: printFileName(title, part),
    }),
  );

/**
 * Where the print-shop sheet lives. A URL of its own, because whoever is
 * standing at the counter with a phone should not have to find it three taps
 * deep inside the editor — and because a link can be sent to whoever is
 * actually doing the printing.
 */
export const noticePath = (token: string): string => `/a/${encodeURIComponent(token)}/print`;
