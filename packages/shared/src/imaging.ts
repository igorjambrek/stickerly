/**
 * How a photo is framed inside a sticker window.
 *
 * The child drags, zooms and turns; we store that as a normalised Crop.
 * Turning a Crop into an actual placement has to happen identically in the
 * editor preview and in the PDF, so it lives here and nowhere else.
 */

import type { Rect } from './geometry.ts';
import type { Crop } from './types.ts';

/**
 * Where to draw an image so it completely covers `box`, honouring the crop.
 *
 * The result is usually larger than the box; the caller clips to the box.
 * Placement is clamped so the box can never show a gap, which means the child
 * cannot drag a photo far enough to expose a white corner.
 *
 * This is the unturned half of the problem: `crop.rotate` is not read here.
 * Callers drawing a photo want `photoPlacement` below, which applies the turn
 * around this.
 */
export function coverPlacement(box: Rect, imageW: number, imageH: number, crop: Crop): Rect {
  const imageAspect = imageW / imageH;
  const boxAspect = box.w / box.h;

  // Smallest size that still covers the box in both directions.
  let w = imageAspect > boxAspect ? box.h * imageAspect : box.w;
  let h = imageAspect > boxAspect ? box.h : box.w / imageAspect;

  const zoom = Math.max(1, crop.scale);
  w *= zoom;
  h *= zoom;

  // Put the crop's focal point at the centre of the box...
  let x = box.x + box.w / 2 - clamp01(crop.x) * w;
  let y = box.y + box.h / 2 - clamp01(crop.y) * h;

  // ...then pull it back so the box stays fully covered.
  x = Math.min(box.x, Math.max(box.x + box.w - w, x));
  y = Math.min(box.y, Math.max(box.y + box.h - h, y));

  return { x, y, w, h };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The quarter turns a photo can be at: anything else is snapped to one of these. */
export const QUARTER_TURNS = [0, 90, 180, 270] as const;

export type QuarterTurn = (typeof QUARTER_TURNS)[number];

/**
 * Any number of degrees, snapped to the nearest quarter turn clockwise.
 *
 * A photo comes out of a phone at one of four angles and is corrected by one
 * of four, so nothing here has to deal with arbitrary rotation: the sticker
 * would no longer be a rectangle full of picture if it did.
 */
export function quarterTurn(degrees: unknown): QuarterTurn {
  const n = typeof degrees === 'number' && Number.isFinite(degrees) ? degrees : 0;
  const steps = ((Math.round(n / 90) % 4) + 4) % 4;
  return QUARTER_TURNS[steps]!;
}

/** The same crop, turned a quarter further round. */
export const turnCrop = (crop: Crop, by = 90): Crop => ({
  ...crop,
  rotate: quarterTurn(quarterTurn(crop.rotate) + by),
});

export interface PhotoPlacement {
  /**
   * The window the picture is fitted to, before the turn is applied: the box
   * itself at 0 and 180, and the box lying on its side at 90 and 270. Its
   * centre is always the centre of the box, so turning it by `rotate` lands it
   * back exactly on the box.
   */
  frame: Rect;
  /** Where the picture sits inside that frame, in the same coordinates. */
  image: Rect;
  /** Quarter turns clockwise, about the centre of the box. */
  rotate: QuarterTurn;
}

/**
 * Everything needed to draw a photo in a window, turn included.
 *
 * A turned photo is fitted to the window *lying on its side* and then rotated
 * back onto it, which is what keeps a sideways picture filling the sticker
 * instead of arriving with two white wedges. Both renderers take the three
 * numbers below and do the same thing with them: place the picture in the
 * frame, then rotate the frame about the middle of the window.
 */
export function photoPlacement(box: Rect, imageW: number, imageH: number, crop: Crop): PhotoPlacement {
  const rotate = quarterTurn(crop.rotate);
  const onItsSide = rotate === 90 || rotate === 270;
  const frame: Rect = onItsSide
    ? { x: box.x + (box.w - box.h) / 2, y: box.y + (box.h - box.w) / 2, w: box.h, h: box.w }
    : { ...box };

  return { frame, image: coverPlacement(frame, imageW, imageH, crop), rotate };
}

/**
 * A drag the child made on screen, said in the frame's own coordinates.
 *
 * The picture under their finger has been turned, so "right" on the glass is
 * not "right" in the picture. Undoing the turn here is what keeps a drag
 * following the finger on a sideways photo.
 */
function unturn(dx: number, dy: number, rotate: QuarterTurn): [number, number] {
  switch (rotate) {
    case 90:
      return [dy, -dx];
    case 180:
      return [-dx, -dy];
    case 270:
      return [-dy, dx];
    default:
      return [dx, dy];
  }
}

/** Convert a drag in millimetres into an updated crop focal point. */
export function panCrop(crop: Crop, box: Rect, imageW: number, imageH: number, dxMm: number, dyMm: number): Crop {
  const { image, rotate } = photoPlacement(box, imageW, imageH, crop);
  const [dx, dy] = unturn(dxMm, dyMm, rotate);
  return {
    ...crop,
    x: clamp01(crop.x - dx / image.w),
    y: clamp01(crop.y - dy / image.h),
  };
}
