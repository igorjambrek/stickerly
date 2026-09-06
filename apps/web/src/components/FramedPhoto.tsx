/**
 * A photo filling a window, framed the way the child left it.
 *
 * There are three of these windows on screen — the sticker on the page, the
 * bigger one in the sticker dialog, and the cover — and one more in the PDF.
 * All four ask `photoPlacement` in `@album/shared` where the picture goes, so
 * this component exists to make sure the three on screen also *draw* it the
 * same way, turn included.
 *
 * The turn is why there are two elements rather than one. A quarter-turned
 * photo is fitted to the window lying on its side and then rotated back onto
 * it: the outer span is that sideways window, centred on the real one, and
 * rotating it about its own middle lands it exactly on the window. The picture
 * inside is positioned in the sideways window's coordinates and comes along
 * for the ride. At no turn at all the two windows are the same rectangle and
 * this is the plain absolutely-positioned image it always was.
 *
 * Whatever contains this must clip: the picture is deliberately bigger than
 * the window, which is what stops a drag exposing a white corner.
 */

import type { Crop, Size } from '@album/shared';
import { photoPlacement } from '@album/shared';

export interface FramedPhotoProps {
  /** The window, in millimetres. Only its proportions reach the page. */
  box: Size;
  src: string;
  /** Intrinsic size of the picture, in pixels. */
  width: number;
  height: number;
  crop: Crop;
  /** Goes on the picture itself, for whatever the window around it wants. */
  className?: string;
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

export function FramedPhoto({ box, src, width, height, crop, className }: FramedPhotoProps) {
  const { frame, image, rotate } = photoPlacement({ x: 0, y: 0, w: box.w, h: box.h }, width, height, crop);

  return (
    <span
      className="framed"
      style={{
        left: pct(frame.x, box.w),
        top: pct(frame.y, box.h),
        width: pct(frame.w, box.w),
        height: pct(frame.h, box.h),
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
      }}
    >
      <img
        className={className}
        src={src}
        alt=""
        draggable={false}
        style={{
          left: pct(image.x - frame.x, frame.w),
          top: pct(image.y - frame.y, frame.h),
          width: pct(image.w, frame.w),
          height: pct(image.h, frame.h),
        }}
      />
    </span>
  );
}
