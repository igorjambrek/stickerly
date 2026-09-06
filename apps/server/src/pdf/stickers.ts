/**
 * The sticker sheets PDF: A4 pages for sticker paper.
 *
 * Stickers sit edge to edge like a real Panini sheet, with dashed cut guides
 * between them and a 50 mm calibration bar in the bottom margin so a scaled
 * print is caught before anyone reaches for the scissors.
 *
 * One album can hold both shapes — a page of portraits with one wide sticker
 * for the team — and they share the one grid. A lying sticker is printed lying
 * inside an upright cell: the paper that comes off the scissors is the same
 * rectangle either way, and whoever cuts it out turns it. That keeps one cut
 * pitch, one calibration bar and one sheet count, instead of part-empty sheets
 * of each shape.
 *
 * By default every sheet is printed twice: the stickers on the front, their
 * numbers on the back. A number has to survive being cut out and matched to a
 * slot, and then disappear — printed on the picture it stays there for good,
 * printed on the backing paper it leaves with the liner. So each sheet is
 * followed by its own back side, mirrored for the short-edge flip the whole
 * job is printed with, and the numbers land exactly behind their own stickers.
 *
 * `ctx.numbers` can put them back in the corner of the picture instead, which
 * is how a real Panini sticker carries its number and all a printer that will
 * not feed sticker paper twice can do. Then there is no back side at all: the
 * sheet is what it always was, and `drawSticker` paints the badge.
 */

import type { PDFDocument } from 'pdf-lib';
import type { Rect, SheetLayoutName, Slot } from '@album/shared';
import {
  SHEET_LAYOUTS,
  STICKER,
  STICKER_RADIUS,
  STICKER_SHEET,
  filledSlots,
  mmToPt,
  stickerBackRect,
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
function drawCutGuide(sheet: Panel, cell: Rect): void {
  sheet.shape({
    k: 'rect',
    ...cell,
    stroke: '#B9BEC4',
    sw: 0.25,
    dash: [1.6, 1.6],
  });
}

/** A blank A4 sticker sheet, as a panel to draw on. */
function addSheet(doc: PDFDocument): Panel {
  const page = doc.addPage([mmToPt(STICKER_SHEET.w), mmToPt(STICKER_SHEET.h)]);
  const sheet = new Panel(page, 0, 0, STICKER_SHEET.w, STICKER_SHEET.h);
  sheet.shape({ k: 'rect', x: 0, y: 0, w: STICKER_SHEET.w, h: STICKER_SHEET.h, fill: '#FFFFFF' });
  return sheet;
}

/** The stickers themselves, and the dashed grid they are cut out of. */
function drawFront(sheet: Panel, ctx: PrintContext, batch: Slot[], layout: SheetLayoutName): void {
  batch.forEach((slot, i) => {
    const cell = stickerSheetRect(i, layout);
    // A lying sticker is drawn lying, in the same upright cell as the rest.
    if (slot.orientation === 'landscape') sheet.turned(cell, (panel) => drawSticker(panel, ctx, slot));
    else drawSticker(sheet.inset(cell), ctx, slot);
    drawCutGuide(sheet, cell);
  });
}

/**
 * The other side of the same paper: one big number in the middle of each cell.
 *
 * No badge and no colour block behind it — this is the release liner, which
 * holds toner far worse than the coated face does, and a numeral alone on
 * white is the most legible thing per drop of ink. The cut guides are repeated
 * so that a duplex printer that has shifted the back side by a few millimetres
 * says so before anybody starts cutting.
 *
 * Every number stands upright, behind a lying sticker as much as an upright
 * one: this side of the paper is read as one grid of numbers, and turning some
 * of them would only make it harder to find one.
 */
function drawBacks(sheet: Panel, ctx: PrintContext, batch: Slot[], layout: SheetLayoutName): void {
  batch.forEach((slot, i) => {
    const cell = stickerBackRect(i, layout);
    drawCutGuide(sheet, cell);
    const size = 22;
    sheet.fitText(String(slot.number), {
      x: cell.x + cell.w / 2,
      y: cell.y + cell.h / 2 + size * 0.36,
      size,
      maxWidth: cell.w - 12,
      font: ctx.fonts.displayBold,
      color: ctx.palette.badge,
      align: 'center',
    });
  });
}

/** The small print along the foot of a sheet: which sheet this is, and the hint. */
function drawFoot(sheet: Panel, ctx: PrintContext, left: string, right?: string): void {
  const footY = 293.5;
  const paint = { size: 2.6, font: ctx.fonts.body, color: '#4A4A4A' } as const;
  sheet.text(left, { x: 8, y: footY, ...paint });
  if (right) sheet.text(right, { x: STICKER_SHEET.w - 8, y: footY, ...paint, align: 'right' });
}

export function renderStickers(doc: PDFDocument, ctx: PrintContext, layout: SheetLayoutName = 'full'): number {
  const stickers = filledSlots(ctx.album).sort((a, b) => a.number - b.number);
  const perSheet = stickersPerSheet(layout);
  const sheets = chunk(stickers, perSheet);

  sheets.forEach((batch: Slot[], sheetIndex) => {
    const counted = { n: sheetIndex + 1, total: sheets.length };

    const front = addSheet(doc);
    drawFront(front, ctx, batch, layout);
    drawFoot(front, ctx, ctx.t('pdf.sheetOf', counted), ctx.t('pdf.cutHint'));
    drawCalibrationRuler(front, ctx);

    if (ctx.numbers !== 'backing') return;

    // The back's line sits in its own bottom margin, which is behind the
    // front's top one — clear of every sticker on either side of the paper.
    const back = addSheet(doc);
    drawBacks(back, ctx, batch, layout);
    drawFoot(back, ctx, ctx.t('pdf.sheetBacks', counted));
  });

  return sheets.length;
}

/** Exported for tests: the geometry this renderer relies on must stay consistent. */
export const stickerSheetGeometry = { SHEET_LAYOUTS, STICKER, STICKER_RADIUS };
