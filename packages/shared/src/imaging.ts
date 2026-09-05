/**
 * How a photo is framed inside a sticker window.
 *
 * The child drags and zooms; we store that as a normalised Crop. Turning a
 * Crop into an actual placement has to happen identically in the editor
 * preview and in the PDF, so it lives here and nowhere else.
 */

import type { Rect } from './geometry.ts';
import type { Crop } from './types.ts';

/**
 * Where to draw an image so it completely covers `box`, honouring the crop.
 *
 * The result is usually larger than the box; the caller clips to the box.
 * Placement is clamped so the box can never show a gap, which means the child
 * cannot drag a photo far enough to expose a white corner.
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

/** Convert a drag in millimetres into an updated crop focal point. */
export function panCrop(crop: Crop, box: Rect, imageW: number, imageH: number, dxMm: number, dyMm: number): Crop {
  const placed = coverPlacement(box, imageW, imageH, crop);
  return {
    ...crop,
    x: clamp01(crop.x - dxMm / placed.w),
    y: clamp01(crop.y - dyMm / placed.h),
  };
}
