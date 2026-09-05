/**
 * The album pages PDF.
 *
 * Album pages are half a sheet and are printed two-up on landscape sheets,
 * imposed so that folding the stack in half puts the pages in reading order.
 * The child adds pages one at a time; the multiple-of-four rule is absorbed
 * here.
 *
 * A page is drawn through TWO panels on purpose:
 *
 *   `art`  reference millimetres, scaled — background, title band and footer,
 *          so the same design serves an A4 page and an A5 one
 *   `page` real millimetres, unscaled — the sticker grid, which must measure
 *          exactly 50 x 70 mm on paper whatever size the album is
 *
 * That split is the whole size feature: a smaller album gets fewer stickers,
 * never smaller ones.
 */

import type { PDFDocument } from 'pdf-lib';
import type { Page, Slot } from '@album/shared';
import {
  FOOTER_Y,
  PAGE_CHROME,
  REF_PAGE,
  artRng,
  impose,
  mmToPt,
  padToSignature,
  pageHeaderRect,
} from '@album/shared';
import { Panel } from './canvas.ts';
import type { PrintContext } from './common.ts';
import { drawFoldTicks, drawPlaque, drawSlotOutline, drawWritingLines } from './common.ts';

/** Padding pages exist only to complete a folded signature. Make them useful. */
export function paddingPages(realCount: number): Page[] {
  const needed = padToSignature(realCount) - realCount;
  return Array.from({ length: needed }, (_, i) => ({
    id: `pad-${i}`,
    position: realCount + i,
    kind: i % 2 === 0 ? ('autograph' as const) : ('filler' as const),
    title: '',
    slots: [] as Slot[],
  }));
}

function drawPageChrome(art: Panel, ctx: PrintContext, pageNumber: number, heading: string): void {
  art.shapes(ctx.template.pageArt(artRng(ctx.template.id, 'page', pageNumber), REF_PAGE, pageNumber));

  const header = pageHeaderRect();
  art.fitText(heading, {
    x: header.x + header.w / 2,
    y: header.y + header.h - 1,
    size: 7,
    minSize: 3.4,
    maxWidth: header.w,
    font: ctx.fonts.displayBold,
    color: ctx.palette.pageInk,
    align: 'center',
  });
  art.shape({
    k: 'line',
    x1: header.x + header.w / 2 - 18,
    y1: header.y + header.h + 2.5,
    x2: header.x + header.w / 2 + 18,
    y2: header.y + header.h + 2.5,
    stroke: ctx.palette.frame,
    sw: 0.6,
    opacity: 0.6,
  });

  // Page number in a small pill at the foot.
  art.shape({
    k: 'rect',
    x: REF_PAGE.w / 2 - 9,
    y: FOOTER_Y - 4.4,
    w: 18,
    h: 7,
    rx: 3.5,
    fill: ctx.palette.frame,
    opacity: 0.14,
  });
  art.text(String(pageNumber), {
    x: REF_PAGE.w / 2,
    y: FOOTER_Y,
    size: 4,
    font: ctx.fonts.bodyBold,
    color: ctx.palette.pageInk,
    align: 'center',
  });
}

function drawStickerPage(page: Panel, art: Panel, ctx: PrintContext, album: Page, pageNumber: number): void {
  drawPageChrome(art, ctx, pageNumber, album.title || ctx.album.title);
  const { slotRect, slotLabelRect } = ctx.layout;
  for (const slot of album.slots) {
    // A slot beyond this album's grid cannot be drawn; it also cannot exist,
    // because the grid is what created the slots in the first place.
    if (slot.position >= ctx.layout.slotsPerPage) continue;
    drawSlotOutline(page, ctx, slotRect(slot.position), slotLabelRect(slot.position), slot);
  }
}

function drawWritingPage(art: Panel, ctx: PrintContext, album: Page, pageNumber: number): void {
  const isSwap = album.kind === 'filler';
  const heading = ctx.t(isSwap ? 'pdf.swapTitle' : 'pdf.autographTitle');
  drawPageChrome(art, ctx, pageNumber, heading);

  const box = {
    x: PAGE_CHROME.marginX,
    y: 44,
    w: REF_PAGE.w - 2 * PAGE_CHROME.marginX,
    h: FOOTER_Y - 56,
  };
  drawPlaque(art, box, ctx.palette, 5);

  const inner = { x: box.x + 8, y: box.y + 10, w: box.w - 16, h: box.h - 18 };
  if (isSwap) {
    art.text(ctx.t('pdf.swapHint'), {
      x: box.x + box.w / 2,
      y: box.y + 8,
      size: 3.4,
      font: ctx.fonts.body,
      color: ctx.palette.pageInk,
      align: 'center',
    });
  }
  drawWritingLines(art, inner, 11, ctx.palette.frame);
}

export function drawAlbumPage(page: Panel, ctx: PrintContext, album: Page, pageNumber: number): void {
  const art = page.scaled(ctx.layout.scale);
  if (album.kind === 'sticker') drawStickerPage(page, art, ctx, album, pageNumber);
  else drawWritingPage(art, ctx, album, pageNumber);
}

/**
 * Render every album page onto imposed sheets.
 * Returns the number of padding pages that had to be added.
 */
export function renderPages(doc: PDFDocument, ctx: PrintContext): number {
  const real = ctx.album.pages;
  const padding = paddingPages(real.length);
  const all = [...real, ...padding];
  const { sheet, halves } = ctx.layout;

  // 1-based album page number -> the page to draw there.
  const byNumber = new Map<number, Page>(all.map((p, i) => [i + 1, p]));

  for (const side of impose(all.length)) {
    const page = doc.addPage([mmToPt(sheet.w), mmToPt(sheet.h)]);
    const sheetPanel = new Panel(page, 0, 0, sheet.w, sheet.h);

    for (const [half, number] of [
      [halves.left, side.left],
      [halves.right, side.right],
    ] as const) {
      const album = byNumber.get(number);
      if (!album) continue;
      drawAlbumPage(sheetPanel.inset(half), ctx, album, number);
    }

    drawFoldTicks(sheetPanel, sheet.w / 2);
  }

  return padding.length;
}
