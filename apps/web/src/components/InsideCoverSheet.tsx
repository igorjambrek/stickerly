/**
 * The half of a spread that is not an album page.
 *
 * A folded album gives page 1 no left-hand neighbour and the last page no
 * right-hand one: the inside of the cover faces them. Showing that instead of
 * a gap is what makes the first and last spreads honest.
 *
 * The artwork is the very function and seed `apps/server/src/pdf/cover.ts`
 * paints these two panels with, so the colour and the motif are the printed
 * ones. What the panels carry — the owner plaque, the how-to, the swap list —
 * is print-only and never editable, so it is named rather than mimicked.
 */

import { useMemo } from 'react';
import type { CoverPanel, PageLayout, Template } from '@album/shared';
import { REF_PAGE, artRng, coverInsideArtOf, coverPalette } from '@album/shared';
import { useT } from '../lang.ts';
import { ShapeCanvas } from './ShapeCanvas.tsx';

export interface InsideCoverSheetProps {
  template: Template;
  variantId: string;
  layout: PageLayout;
  panel: Extract<CoverPanel, 'insideFront' | 'insideBack'>;
}

export function InsideCoverSheet({ template, variantId, layout, panel }: InsideCoverSheetProps) {
  const t = useT();
  const palette = coverPalette(template, variantId);
  const shapes = useMemo(
    () => coverInsideArtOf(template, variantId)(artRng(template.id, panel, variantId), REF_PAGE),
    [template, variantId, panel],
  );

  return (
    <div
      className="page-sheet page-sheet--inside"
      style={{ aspectRatio: `${layout.page.w} / ${layout.page.h}` }}
      aria-label={t('editor.insideCover')}
    >
      <ShapeCanvas className="page-sheet__art" shapes={shapes} width={REF_PAGE.w} height={REF_PAGE.h} />
      <span className="inside-note" style={{ color: palette.plaqueInk }}>
        <strong>{t('editor.insideCover')}</strong>
        {t(panel === 'insideFront' ? 'editor.insideCoverFront' : 'editor.insideCoverBack')}
      </span>
    </div>
  );
}
