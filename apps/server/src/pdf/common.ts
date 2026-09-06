/**
 * Print elements shared by the cover, the pages and the sticker sheets.
 *
 * Nothing here decides *where* anything goes — that comes from the shared
 * geometry package. These functions only decide what a thing looks like.
 */

import type { PDFImage } from 'pdf-lib';
import type { Album, ArtFn, NumberSide, PageLayout, Palette, Rect, Size, Slot, Template, Translate } from '@album/shared';
import { CALIBRATION, STICKER_RADIUS, stickerSize } from '@album/shared';
import type { Fonts } from './fonts.ts';
import { Panel } from './canvas.ts';

/**
 * The chosen cover, already resolved.
 *
 * A cover variant repaints the four cover panels and may replace their
 * artwork; when it is a photo cover, `image` is the child's own picture and
 * the artwork below it is only a fallback for an album whose photo is still
 * missing.
 */
export interface CoverPlan {
  palette: Palette;
  front: ArtFn;
  back: ArtFn;
  inside: ArtFn;
  image?: PDFImage;
}

export interface PrintContext {
  album: Album;
  template: Template;
  /** Paper, page size and sticker grid for this album. */
  layout: PageLayout;
  /** The album-page palette. Cover panels use `cover.palette` instead. */
  palette: Palette;
  cover: CoverPlan;
  /** Where this job puts a sticker's number: on the picture, or behind it. */
  numbers: NumberSide;
  fonts: Fonts;
  t: Translate;
  /** Embedded print derivatives, keyed by image id. */
  images: Map<string, PDFImage>;
}

/** The auto-assigned sticker number, in a solid circle. */
export function drawNumberBadge(
  panel: Panel,
  ctx: PrintContext,
  cx: number,
  cy: number,
  r: number,
  n: number,
  fill = ctx.palette.badge,
  ink = ctx.palette.badgeInk,
): void {
  panel.shape({ k: 'circle', cx, cy, r, fill });
  panel.shape({ k: 'circle', cx, cy, r, stroke: '#FFFFFF', sw: r * 0.16 });
  const size = n >= 100 ? r * 0.95 : r * 1.15;
  panel.fitText(String(n), {
    x: cx,
    y: cy + size * 0.36,
    size,
    maxWidth: r * 1.6,
    font: ctx.fonts.displayBold,
    color: ink,
    align: 'center',
  });
}

/**
 * An empty numbered outline on an album page — the thing the child sticks a
 * sticker onto. When the slot already holds a photo we print it as a very faint
 * ghost so the album doubles as a checklist of what goes where.
 */
export function drawSlotOutline(page: Panel, ctx: PrintContext, box: Rect, label: Rect, slot: Slot): void {
  page.shape({ k: 'rect', ...box, rx: STICKER_RADIUS, fill: '#FFFFFF', opacity: 0.75 });

  const image = slot.imageId ? ctx.images.get(slot.imageId) : undefined;
  if (image) page.image(image, box, slot.crop, STICKER_RADIUS, 0.1);

  page.shape({
    k: 'rect',
    ...box,
    rx: STICKER_RADIUS,
    stroke: ctx.palette.frame,
    sw: 0.5,
    dash: [2.2, 1.6],
  });

  drawNumberBadge(page, ctx, box.x, box.y, 4.6, slot.number);

  if (slot.label) {
    page.fitText(slot.label, {
      x: label.x + label.w / 2,
      y: label.y + label.h - 1.4,
      size: 3.1,
      maxWidth: label.w,
      minSize: 2,
      font: ctx.fonts.bodyBold,
      color: ctx.palette.label,
      align: 'center',
    });
  } else {
    // A line to write the name on by hand.
    page.shape({
      k: 'line',
      x1: label.x + 3,
      y1: label.y + label.h - 1.2,
      x2: label.x + label.w - 3,
      y2: label.y + label.h - 1.2,
      stroke: ctx.palette.frame,
      sw: 0.3,
      opacity: 0.5,
    });
  }
}

/**
 * A printed sticker: photo to the edges and a colour band with the name, and
 * the number in the corner only if this job asked for it there. It is printed
 * on the backing paper otherwise, behind this very cell, so that nothing
 * covers the picture once the sticker is in the album.
 *
 * The band is washed over the photo rather than laid on top of it, because it
 * is the foot of the picture as much as it is the name: a child's photo keeps
 * its bottom edge, and a name written across it still reads.
 *
 * The rectangle comes from the slot rather than a constant, because a sticker
 * can be lying down — either because the whole album is, or because this one
 * was turned for a team photo. The name band still runs along its foot on a
 * sticker that is now wider than it is tall.
 */
export function drawSticker(sticker: Panel, ctx: PrintContext, slot: Slot): void {
  const inset = 1.6;
  const size: Size = stickerSize(slot.orientation);
  const inner: Rect = { x: inset, y: inset, w: size.w - 2 * inset, h: size.h - 2 * inset };

  // The white peel border.
  sticker.shape({ k: 'rect', x: 0, y: 0, w: size.w, h: size.h, rx: STICKER_RADIUS, fill: '#FFFFFF' });

  const image = slot.imageId ? ctx.images.get(slot.imageId) : undefined;
  if (image) {
    sticker.image(image, inner, slot.crop, STICKER_RADIUS - 0.6);
  } else {
    sticker.shape({ k: 'rect', ...inner, rx: STICKER_RADIUS - 0.6, fill: ctx.palette.pageBg });
  }

  // Name band across the foot of the sticker.
  const bandH = 9;
  const band: Rect = { x: inner.x, y: inner.y + inner.h - bandH, w: inner.w, h: bandH };
  sticker.shape({ k: 'rect', ...band, rx: STICKER_RADIUS - 0.6, fill: ctx.palette.badge, opacity: 0.7 });
  if (slot.label) {
    sticker.fitText(slot.label, {
      x: band.x + band.w / 2,
      y: band.y + bandH / 2 + 1.3,
      size: 3.6,
      maxWidth: band.w - 4,
      minSize: 2.2,
      font: ctx.fonts.bodyBold,
      color: ctx.palette.badgeInk,
      align: 'center',
    });
  }

  if (ctx.numbers === 'sticker') drawNumberBadge(sticker, ctx, 7.6, 7.6, 5, slot.number);

  // A hairline so the sticker's edge is visible against white paper.
  sticker.shape({
    k: 'rect',
    x: 0.15,
    y: 0.15,
    w: size.w - 0.3,
    h: size.h - 0.3,
    rx: STICKER_RADIUS,
    stroke: '#C9CDD2',
    sw: 0.25,
  });
}

/**
 * The 50 mm bar in the bottom margin of every sticker sheet.
 *
 * This is the whole quality-control story in one element: if the bar measures
 * 50 mm the printer did not scale the page, and every sticker will fit its
 * slot. A parent can check it in two seconds without understanding anything
 * about print settings.
 */
export function drawCalibrationRuler(sheet: Panel, ctx: PrintContext): void {
  const { x, y, length, height } = CALIBRATION;
  const ink = '#4A4A4A';

  sheet.shape({ k: 'line', x1: x, y1: y + height, x2: x + length, y2: y + height, stroke: ink, sw: 0.35 });
  for (let mm = 0; mm <= length; mm += 5) {
    const tall = mm % 10 === 0;
    sheet.shape({
      k: 'line',
      x1: x + mm,
      y1: y + height,
      x2: x + mm,
      y2: y + height - (tall ? height : height * 0.55),
      stroke: ink,
      sw: tall ? 0.35 : 0.22,
    });
  }
  sheet.text(ctx.t('pdf.rulerHint'), {
    x: sheet.w / 2,
    y: y + height + 3.4,
    size: 2.6,
    font: ctx.fonts.body,
    color: ink,
    align: 'center',
  });
}

/**
 * Short fold guides at the very top and bottom of a printed sheet.
 *
 * A full fold line would still be visible on the finished album, so only the
 * paper's outer few millimetres are marked — enough to line up a fold, faint
 * enough to disappear into it.
 */
export function drawFoldTicks(sheet: Panel, xMm: number): void {
  const paint = { stroke: '#9AA0A6', sw: 0.25, opacity: 0.8 } as const;
  sheet.shape({ k: 'line', x1: xMm, y1: 0, x2: xMm, y2: 4, ...paint });
  sheet.shape({ k: 'line', x1: xMm, y1: sheet.h - 4, x2: xMm, y2: sheet.h, ...paint });
}

/**
 * A rounded plaque with a border, used behind cover text and info boxes.
 * Takes its palette explicitly, because a cover panel is painted in the cover
 * variant's colours while an album page is painted in the theme's.
 */
export function drawPlaque(panel: Panel, box: Rect, palette: Palette, radius = 6): void {
  panel.shape({ k: 'rect', ...box, rx: radius, fill: palette.plaque, opacity: 0.96 });
  panel.shape({ k: 'rect', ...box, rx: radius, stroke: palette.plaqueEdge, sw: 1.1 });
}

/** Evenly spaced writing lines, for the autograph and swap pages. */
export function drawWritingLines(panel: Panel, box: Rect, spacing: number, colorHex: string): void {
  for (let y = box.y + spacing; y <= box.y + box.h; y += spacing) {
    panel.shape({ k: 'line', x1: box.x, y1: y, x2: box.x + box.w, y2: y, stroke: colorHex, sw: 0.3, opacity: 0.45 });
  }
}

/** Total stickers actually placed, used on the cover. */
export const stickerTotal = (album: Album): number =>
  album.pages.reduce((n, p) => n + p.slots.filter((s) => s.imageId).length, 0);
