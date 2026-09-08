/**
 * How a photo is framed inside a sticker window.
 *
 * The child drags, zooms and turns; we store that as a normalised Crop.
 * Turning a Crop into an actual placement has to happen identically in the
 * editor preview and in the PDF, so it lives here and nowhere else.
 */

import type { Rect, Size } from './geometry.ts';
import type { Crop } from './types.ts';
import { MM_PER_INCH } from './units.ts';

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

/**
 * How finely a picture will actually print, in dots per inch.
 *
 * This is the same question `photoPlacement` already answers, read the other
 * way round. That function says how many millimetres of paper the picture is
 * stretched across; divide its pixels by those millimetres and you have the
 * resolution a printer is left with. Asking it through the placement rather
 * than from the file's own dimensions is the whole point: a photo is fitted to
 * *cover* its window, so a wide picture in a tall sticker has most of its
 * width cropped away and prints from its height alone, and zooming in spends
 * pixels on a smaller part of the picture. Both are invisible in the file's
 * size and obvious on paper.
 *
 * `box` is the window the picture is drawn into, in millimetres — a sticker's
 * `stickerWindow()`, or the album page for a cover.
 */
export function printDpi(box: Size, imageW: number, imageH: number, crop: Crop): number {
  if (!(imageW > 0) || !(imageH > 0)) return 0;
  const { image } = photoPlacement({ x: 0, y: 0, w: box.w, h: box.h }, imageW, imageH, crop);
  // Aspect is preserved, so either axis gives the same answer.
  return (imageW / image.w) * MM_PER_INCH;
}

/**
 * The resolution below which a printed picture starts to show its pixels.
 *
 * `PRINT_DPI` in `units.ts` (300) is what we aim for and what the derivatives
 * are sized to; this is the lower number, the floor under which a photo falls
 * apart visibly on paper. The gap between them is deliberate: a warning at 299
 * dpi would fire on a perfectly good 16:9 phone photo — our own upload cap
 * lands one of those at almost exactly 300 — and a warning a child sees on
 * every second picture is one they stop reading. So this marks the point where
 * the print is genuinely worse, not the point where it stops being ideal.
 */
export const MIN_PRINT_DPI = 200;

/** Whether this picture has the pixels for the window it will be printed in. */
export const printsSharply = (box: Size, imageW: number, imageH: number, crop: Crop): boolean =>
  printDpi(box, imageW, imageH, crop) >= MIN_PRINT_DPI;
