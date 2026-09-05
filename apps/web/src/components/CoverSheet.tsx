/**
 * The front cover, on screen.
 *
 * The mirror of `apps/server/src/pdf/cover.ts`: same artwork from the same
 * template code, the same plaque box in the same reference millimetres, and
 * the same photo framing through `coverPlacement`. A child who likes what they
 * see here gets that on paper.
 *
 * Positions are percentages of the reference A4 page and font sizes are
 * container-query units, so one component serves a thumbnail in a picker and a
 * full-size preview without a second set of numbers.
 */

import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { Crop, Lang, Template } from '@album/shared';
import { REF_PAGE, artRng, coverArtOf, coverPalette, coverPlacement, coverWantsPhoto, t } from '@album/shared';
import { ShapeCanvas } from './ShapeCanvas.tsx';

/** Reference millimetres as a share of the cover, for anything that must scale with it. */
const cq = (mm: number) => `${(mm / REF_PAGE.w) * 100}cqw`;
const pctX = (mm: number) => `${(mm / REF_PAGE.w) * 100}%`;
const pctY = (mm: number) => `${(mm / REF_PAGE.h) * 100}%`;

/** The title plaque and the sticker-count pill, straight from the print code. */
const PLAQUE = { x: 16, y: 80, w: REF_PAGE.w - 32, h: 100 };
const PILL = { x: REF_PAGE.w / 2 - 38, y: 194, w: 76, h: 15 };

export interface CoverPhoto {
  url: string;
  /** Intrinsic size, so the framing matches the printed one exactly. */
  w: number;
  h: number;
}

export interface CoverSheetProps {
  template: Template;
  variantId: string;
  title: string;
  ownerName?: string;
  stickerCount?: number;
  lang: Lang;
  photo?: CoverPhoto | null;
  crop?: Crop;
  /** Hide the text furniture, for a small artwork-only chip. */
  bare?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function CoverSheet({
  template,
  variantId,
  title,
  ownerName,
  stickerCount,
  lang,
  photo,
  crop,
  bare = false,
  className,
  style,
}: CoverSheetProps) {
  const palette = coverPalette(template, variantId);
  const shapes = useMemo(
    () => coverArtOf(template, variantId)(artRng(template.id, 'cover', variantId), REF_PAGE),
    [template, variantId],
  );

  // A photo cover with no photo yet falls back to the theme's artwork, exactly
  // as the PDF does, so the preview never shows a hole the print would not.
  const usePhoto = coverWantsPhoto(template, variantId) && Boolean(photo);
  const placed =
    usePhoto && photo ? coverPlacement({ x: 0, y: 0, w: REF_PAGE.w, h: REF_PAGE.h }, photo.w, photo.h, crop ?? { x: 0.5, y: 0.5, scale: 1 }) : null;

  return (
    <div className={`cover-sheet${className ? ` ${className}` : ''}`} style={style}>
      {usePhoto && photo && placed ? (
        <>
          <img
            className="cover-sheet__photo"
            src={photo.url}
            alt=""
            draggable={false}
            style={{
              left: `${(placed.x / REF_PAGE.w) * 100}%`,
              top: `${(placed.y / REF_PAGE.h) * 100}%`,
              width: `${(placed.w / REF_PAGE.w) * 100}%`,
              height: `${(placed.h / REF_PAGE.h) * 100}%`,
            }}
          />
          <span className="cover-sheet__scrim" />
          <span className="cover-sheet__edge" style={{ borderColor: palette.coverAccent, borderWidth: cq(1.8), inset: cq(5) }} />
        </>
      ) : (
        <ShapeCanvas className="cover-sheet__art" shapes={shapes} width={REF_PAGE.w} height={REF_PAGE.h} />
      )}

      {!bare && (
        <>
          <div
            className="cover-sheet__plaque"
            style={{
              left: pctX(PLAQUE.x),
              top: pctY(PLAQUE.y),
              width: pctX(PLAQUE.w),
              height: pctY(PLAQUE.h),
              borderRadius: cq(8),
              background: palette.plaque,
              borderColor: palette.plaqueEdge,
              borderWidth: cq(1.1),
              color: palette.plaqueInk,
              padding: `${cq(10)} ${cq(10)}`,
            }}
          >
            <span className="cover-sheet__kicker" style={{ fontSize: cq(3.8), letterSpacing: cq(1.3) }}>
              {t(lang, 'pdf.albumSubtitle')}
            </span>
            <strong className="cover-sheet__title" style={{ fontSize: cq(15) }}>
              {title}
            </strong>
            <span className="cover-sheet__rule" style={{ background: palette.plaqueEdge, width: cq(52), height: cq(0.8) }} />
            <span className="cover-sheet__owner" style={{ fontSize: cq(6), minHeight: cq(7) }}>
              {ownerName}
            </span>
          </div>

          <span
            className="cover-sheet__pill"
            style={{
              left: pctX(PILL.x),
              top: pctY(PILL.y),
              width: pctX(PILL.w),
              height: pctY(PILL.h),
              borderRadius: cq(7.5),
              background: palette.coverAccent,
              fontSize: cq(5.4),
            }}
          >
            {stickerCount ?? 0} {t(lang, 'editor.stickerCount')}
          </span>
        </>
      )}
    </div>
  );
}
