/**
 * The sticker sheets PDF: A4 pages for sticker paper.
 *
 * Stickers sit edge to edge like a real Panini sheet, with dashed cut guides
 * between them and a 50 mm calibration bar in the bottom margin so a scaled
 * print is caught before anyone reaches for the scissors.
 */

import type { PDFDocument } from 'pdf-lib';
import type { SheetLayoutName, Slot } from '@album/shared';
import {
  SHEET_LAYOUTS,
  STICKER,
  STICKER_RADIUS,
  STICKER_SHEET,
  filledSlots,
  mmToPt,
  stickerSheetRect,
  stickersPerSheet,
} from '@album/shared';
import { Panel } from './canvas.ts';
import type { PrintContext } from './common.ts';
import { drawCalibrationRuler, drawSticker } from './common.ts';

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * A dashed rectangle on the cell boundary. Drawn per sticker rather than as a
 * full grid so a partly filled last sheet does not print guides across blank
 * paper.
 */
function drawCutGuide(sheet: Panel, index: number, layout: SheetLayoutName): void {
  const cell = stickerSheetRect(index, layout);
  sheet.shape({
    k: 'rect',
    ...cell,
    stroke: '#B9BEC4',
    sw: 0.25,
    dash: [1.6, 1.6],
  });
}

export function renderStickers(doc: PDFDocument, ctx: PrintContext, layout: SheetLayoutName = 'full'): number {
  const stickers = filledSlots(ctx.album).sort((a, b) => a.number - b.number);
  const perSheet = stickersPerSheet(layout);
  const sheets = chunk(stickers, perSheet);

  sheets.forEach((batch: Slot[], sheetIndex) => {
    const page = doc.addPage([mmToPt(STICKER_SHEET.w), mmToPt(STICKER_SHEET.h)]);
    const sheet = new Panel(page, 0, 0, STICKER_SHEET.w, STICKER_SHEET.h);
    sheet.shape({ k: 'rect', x: 0, y: 0, w: STICKER_SHEET.w, h: STICKER_SHEET.h, fill: '#FFFFFF' });

    batch.forEach((slot, i) => {
      const cell = stickerSheetRect(i, layout);
      drawSticker(sheet.inset(cell), ctx, slot);
      drawCutGuide(sheet, i, layout);
    });

    const footY = 293.5;
    sheet.text(ctx.t('pdf.sheetOf', { n: sheetIndex + 1, total: sheets.length }), {
      x: 8,
      y: footY,
      size: 2.6,
      font: ctx.fonts.body,
      color: '#4A4A4A',
    });
    sheet.text(ctx.t('pdf.cutHint'), {
      x: STICKER_SHEET.w - 8,
      y: footY,
      size: 2.6,
      font: ctx.fonts.body,
      color: '#4A4A4A',
      align: 'right',
    });
    drawCalibrationRuler(sheet, ctx);
  });

  return sheets.length;
}

/** Exported for tests: the geometry this renderer relies on must stay consistent. */
export const stickerSheetGeometry = { SHEET_LAYOUTS, STICKER, STICKER_RADIUS };
