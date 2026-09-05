/**
 * The cover PDF: one landscape sheet, printed on both sides and folded around
 * the page block. A3 for a big album, A4 for a small one.
 *
 * Folded, the outside reads back-cover | front-cover. The short-edge flip
 * mirrors the back of the sheet, which is what puts the inside-front panel
 * directly behind the front cover — see COVER_SIDES in the shared package.
 *
 * Every measurement below is in REFERENCE millimetres — the A4 page the
 * artwork was drawn for. Each panel is a `scaled` Panel, so the same layout
 * comes out at 100% on A3 and at 71% on A4 without a second set of numbers.
 */

import type { PDFDocument } from 'pdf-lib';
import type { CoverPanel, Rect } from '@album/shared';
import { COVER_SIDES, REF_PAGE, artRng, mmToPt } from '@album/shared';
import { Panel } from './canvas.ts';
import type { PrintContext } from './common.ts';
import { drawFoldTicks, drawPlaque, drawWritingLines, stickerTotal } from './common.ts';

const FULL: Rect = { x: 0, y: 0, w: REF_PAGE.w, h: REF_PAGE.h };

/** A label with a rule to write on, e.g. "Made by: ______". */
function fieldLine(panel: Panel, ctx: PrintContext, x: number, y: number, w: number, label: string): void {
  const labelW = panel.widthOf(label, ctx.fonts.bodyBold, 4) + 3;
  panel.text(label, { x, y, size: 4, font: ctx.fonts.bodyBold, color: ctx.cover.palette.plaqueInk });
  panel.shape({
    k: 'line',
    x1: x + labelW,
    y1: y + 1,
    x2: x + w,
    y2: y + 1,
    stroke: ctx.cover.palette.plaqueInk,
    sw: 0.4,
    opacity: 0.55,
  });
}

/**
 * The front panel's background.
 *
 * A photo cover is the child's picture, full bleed, with two pieces of
 * insurance: a faint overall scrim and a darker foot, so a bright holiday
 * photo can never make the title or the sticker count hard to read. An album
 * whose photo has not been chosen yet simply falls back to the theme's own
 * artwork rather than printing a hole.
 */
function drawFrontGround(panel: Panel, ctx: PrintContext): void {
  const { image, palette } = ctx.cover;
  if (!image) {
    panel.shapes(ctx.cover.front(artRng(ctx.template.id, 'cover', ctx.album.coverVariantId), REF_PAGE));
    return;
  }

  panel.image(image, FULL, ctx.album.coverCrop, 0);
  panel.shape({ ...FULL, k: 'rect', fill: '#000000', opacity: 0.1 });
  // A graded foot: five bands are enough to read as a soft shadow.
  for (let i = 0; i < 5; i++) {
    panel.shape({
      k: 'rect',
      x: 0,
      y: REF_PAGE.h - 64 + i * 12.8,
      w: REF_PAGE.w,
      h: 12.9,
      fill: '#000000',
      opacity: 0.05 + i * 0.045,
    });
  }
  // A border in the theme's accent, so a photo still reads as a cover.
  panel.shape({ k: 'rect', x: 5, y: 5, w: REF_PAGE.w - 10, h: REF_PAGE.h - 10, stroke: palette.coverAccent, sw: 1.8 });
  panel.shape({
    k: 'rect',
    x: 8.5,
    y: 8.5,
    w: REF_PAGE.w - 17,
    h: REF_PAGE.h - 17,
    stroke: '#FFFFFF',
    sw: 0.5,
    opacity: 0.65,
  });
}

function drawFront(panel: Panel, ctx: PrintContext): void {
  const palette = ctx.cover.palette;
  drawFrontGround(panel, ctx);

  const plaque: Rect = { x: 16, y: 80, w: REF_PAGE.w - 32, h: 100 };
  drawPlaque(panel, plaque, palette, 8);

  panel.text(ctx.t('pdf.albumSubtitle'), {
    x: REF_PAGE.w / 2,
    y: plaque.y + 16,
    size: 3.8,
    letterSpacing: 1.3,
    font: ctx.fonts.bodyBold,
    color: palette.plaqueInk,
    opacity: 0.75,
    align: 'center',
  });

  panel.textBlock(ctx.album.title, {
    box: { x: plaque.x + 10, y: plaque.y + 24, w: plaque.w - 20, h: 50 },
    size: 17,
    minSize: 7,
    lineHeight: 1.15,
    font: ctx.fonts.displayBold,
    color: palette.plaqueInk,
    align: 'center',
    valign: 'middle',
  });

  panel.shape({
    k: 'line',
    x1: REF_PAGE.w / 2 - 26,
    y1: plaque.y + 80,
    x2: REF_PAGE.w / 2 + 26,
    y2: plaque.y + 80,
    stroke: palette.plaqueEdge,
    sw: 0.8,
  });

  if (ctx.album.ownerName) {
    panel.fitText(ctx.album.ownerName, {
      x: REF_PAGE.w / 2,
      y: plaque.y + 91,
      size: 6,
      minSize: 3.5,
      maxWidth: plaque.w - 24,
      font: ctx.fonts.display,
      color: palette.plaqueInk,
      align: 'center',
    });
  }

  // Sticker count ribbon.
  const total = stickerTotal(ctx.album);
  const pill: Rect = { x: REF_PAGE.w / 2 - 38, y: 194, w: 76, h: 15 };
  panel.shape({ k: 'rect', ...pill, rx: 7.5, fill: palette.coverAccent });
  panel.fitText(`${total} ${ctx.t('editor.stickerCount')}`, {
    x: REF_PAGE.w / 2,
    y: pill.y + 10,
    size: 5.4,
    minSize: 3,
    maxWidth: pill.w - 8,
    font: ctx.fonts.bodyBold,
    color: '#1F2430',
    align: 'center',
  });
}

function drawBack(panel: Panel, ctx: PrintContext): void {
  const palette = ctx.cover.palette;
  panel.shapes(ctx.cover.back(artRng(ctx.template.id, 'back', ctx.album.coverVariantId), REF_PAGE));

  const plaque: Rect = { x: 20, y: 150, w: REF_PAGE.w - 40, h: 78 };
  drawPlaque(panel, plaque, palette, 8);

  fieldLine(panel, ctx, plaque.x + 12, plaque.y + 24, plaque.w - 24, ctx.t('pdf.madeBy'));
  fieldLine(panel, ctx, plaque.x + 12, plaque.y + 44, plaque.w - 24, ctx.t('pdf.date'));

  panel.text(`${ctx.t('pdf.totalStickers')} ${stickerTotal(ctx.album)}`, {
    x: plaque.x + plaque.w / 2,
    y: plaque.y + 66,
    size: 4.2,
    font: ctx.fonts.body,
    color: palette.plaqueInk,
    align: 'center',
  });

  panel.text(ctx.t('app.name'), {
    x: REF_PAGE.w / 2,
    y: REF_PAGE.h - 18,
    size: 4,
    letterSpacing: 0.8,
    font: ctx.fonts.displayBold,
    color: '#FFFFFF',
    opacity: 0.85,
    align: 'center',
  });

  panel.text(ctx.t('pdf.copyright', { year: String(new Date().getFullYear()) }), {
    x: REF_PAGE.w / 2,
    y: REF_PAGE.h - 11,
    size: 2.6,
    font: ctx.fonts.body,
    color: '#FFFFFF',
    opacity: 0.6,
    align: 'center',
  });
}

function drawInsideFront(panel: Panel, ctx: PrintContext): void {
  const palette = ctx.cover.palette;
  panel.shapes(ctx.cover.inside(artRng(ctx.template.id, 'insideFront', ctx.album.coverVariantId), REF_PAGE));

  const owner: Rect = { x: 20, y: 34, w: REF_PAGE.w - 40, h: 56 };
  drawPlaque(panel, owner, palette, 6);
  panel.text(ctx.t('pdf.belongsTo'), {
    x: REF_PAGE.w / 2,
    y: owner.y + 16,
    size: 5,
    font: ctx.fonts.display,
    color: palette.plaqueInk,
    align: 'center',
  });
  if (ctx.album.ownerName) {
    panel.fitText(ctx.album.ownerName, {
      x: REF_PAGE.w / 2,
      y: owner.y + 40,
      size: 12,
      minSize: 5,
      maxWidth: owner.w - 24,
      font: ctx.fonts.displayBold,
      color: palette.plaqueInk,
      align: 'center',
    });
  } else {
    panel.shape({
      k: 'line',
      x1: owner.x + 16,
      y1: owner.y + 40,
      x2: owner.x + owner.w - 16,
      y2: owner.y + 40,
      stroke: palette.plaqueInk,
      sw: 0.5,
      opacity: 0.5,
    });
  }

  // How to use the album: three steps, each numbered.
  panel.text(ctx.t('pdf.howToTitle'), {
    x: REF_PAGE.w / 2,
    y: 118,
    size: 7,
    font: ctx.fonts.displayBold,
    color: palette.plaqueInk,
    align: 'center',
  });

  const steps = [ctx.t('pdf.how1'), ctx.t('pdf.how2'), ctx.t('pdf.how3')];
  steps.forEach((step, i) => {
    const y = 136 + i * 26;
    panel.shape({ k: 'circle', cx: 34, cy: y, r: 8, fill: palette.plaqueEdge });
    panel.text(String(i + 1), {
      x: 34,
      y: y + 3.2,
      size: 8,
      font: ctx.fonts.displayBold,
      color: '#FFFFFF',
      align: 'center',
    });
    panel.textBlock(step, {
      box: { x: 48, y: y - 9, w: REF_PAGE.w - 68, h: 20 },
      size: 4.4,
      minSize: 3,
      font: ctx.fonts.body,
      color: palette.plaqueInk,
      align: 'left',
      valign: 'middle',
    });
  });
}

function drawInsideBack(panel: Panel, ctx: PrintContext): void {
  const palette = ctx.cover.palette;
  panel.shapes(ctx.cover.inside(artRng(ctx.template.id, 'insideBack', ctx.album.coverVariantId), REF_PAGE));

  panel.text(ctx.t('pdf.swapTitle'), {
    x: REF_PAGE.w / 2,
    y: 40,
    size: 8,
    font: ctx.fonts.displayBold,
    color: palette.plaqueInk,
    align: 'center',
  });
  panel.text(ctx.t('pdf.swapHint'), {
    x: REF_PAGE.w / 2,
    y: 50,
    size: 3.8,
    font: ctx.fonts.body,
    color: palette.plaqueInk,
    align: 'center',
  });

  const box: Rect = { x: 20, y: 58, w: REF_PAGE.w - 40, h: REF_PAGE.h - 92 };
  drawPlaque(panel, box, palette, 6);
  drawWritingLines(panel, { x: box.x + 10, y: box.y + 4, w: box.w - 20, h: box.h - 12 }, 12, palette.frame);
}

const PANEL_PAINTERS: Record<CoverPanel, (panel: Panel, ctx: PrintContext) => void> = {
  front: drawFront,
  back: drawBack,
  insideFront: drawInsideFront,
  insideBack: drawInsideBack,
};

export function renderCover(doc: PDFDocument, ctx: PrintContext): void {
  const { sheet, halves, scale } = ctx.layout;

  for (const side of COVER_SIDES) {
    const page = doc.addPage([mmToPt(sheet.w), mmToPt(sheet.h)]);
    const sheetPanel = new Panel(page, 0, 0, sheet.w, sheet.h);

    PANEL_PAINTERS[side.left](sheetPanel.inset(halves.left).scaled(scale), ctx);
    PANEL_PAINTERS[side.right](sheetPanel.inset(halves.right).scaled(scale), ctx);

    drawFoldTicks(sheetPanel, sheet.w / 2);
  }
}
