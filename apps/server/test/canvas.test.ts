import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { REF_PAGE, STICKER, layoutFor, mmToPt } from '@album/shared';
import { Panel } from '../src/pdf/canvas.ts';

/**
 * The millimetre canvas, and the one thing about it that is easy to get wrong.
 *
 * A page is drawn in two coordinate systems at once: artwork in reference
 * millimetres scaled onto the page, and the sticker grid in real millimetres.
 * If the scaled panel drifts, an A5 cover prints with its artwork in the wrong
 * place — which is invisible on screen and obvious on paper.
 */

const near = (got: number, want: number, what: string) =>
  assert.ok(Math.abs(got - want) < 1e-6, `${what}: ${got} vs ${want}`);

async function sheetPanel(size: 'a4' | 'a3') {
  const layout = layoutFor(size);
  const doc = await PDFDocument.create();
  const page = doc.addPage([mmToPt(layout.sheet.w), mmToPt(layout.sheet.h)]);
  return { layout, panel: new Panel(page, 0, 0, layout.sheet.w, layout.sheet.h) };
}

describe('Panel', () => {
  it('maps millimetres to points with the origin at the top left', async () => {
    const { layout, panel } = await sheetPanel('a3');
    near(panel.ptX(0), 0, 'left edge');
    near(panel.ptX(layout.sheet.w), mmToPt(layout.sheet.w), 'right edge');
    // y is measured downwards, so the panel's top is the page's top.
    near(panel.ptY(0), mmToPt(layout.sheet.h), 'top edge');
    near(panel.ptY(layout.sheet.h), 0, 'bottom edge');
  });

  it('places an inset panel at its offset', async () => {
    const { layout, panel } = await sheetPanel('a3');
    const right = panel.inset(layout.halves.right);
    near(right.ptX(0), mmToPt(layout.page.w), 'right half starts at the fold');
    near(right.ptX(layout.page.w), mmToPt(layout.sheet.w), 'and ends at the paper edge');
  });

  for (const size of ['a4', 'a3'] as const) {
    describe(`${size} album`, () => {
      it('fits the whole reference page onto one half of the sheet', async () => {
        const { layout, panel } = await sheetPanel(size);
        const art = panel.inset(layout.halves.left).scaled(layout.scale);

        // The reference page is exactly as wide as the album page it is drawn on.
        near(art.ptX(0), 0, 'reference left');
        near(art.ptX(REF_PAGE.w), mmToPt(layout.page.w), 'reference right');
        near(art.ptY(0), mmToPt(layout.sheet.h), 'reference top');
        // A5 is very slightly taller in proportion than A4, so the reference
        // page overhangs the foot by a fifth of a millimetre. That is off the
        // media box and clipped; anything more would be a bug.
        const overhang = layout.page.h - REF_PAGE.h * layout.scale;
        assert.ok(overhang <= 0 && overhang > -0.05, `reference bottom overhang: ${overhang} mm`);
      });

      it('reports the reference page as its own size', async () => {
        const { layout, panel } = await sheetPanel(size);
        const art = panel.inset(layout.halves.left).scaled(layout.scale);
        near(art.w, REF_PAGE.w, 'width in reference units');
        assert.ok(Math.abs(art.h - REF_PAGE.h) < 0.1, `height in reference units: ${art.h}`);
      });

      it('leaves the sticker grid at its true physical size', async () => {
        const { layout, panel } = await sheetPanel(size);
        const page = panel.inset(layout.halves.left);
        const slot = layout.slotRect(0);

        // Unscaled, so a 50 mm slot is 50 mm of paper in both albums. This is
        // what lets one sticker sheet serve every size of album.
        near(page.ptX(slot.x + slot.w) - page.ptX(slot.x), mmToPt(STICKER.w), 'slot width');
        near(page.ptY(slot.y) - page.ptY(slot.y + slot.h), mmToPt(STICKER.h), 'slot height');
      });

      it('scales a nested panel with its parent', async () => {
        const { layout, panel } = await sheetPanel(size);
        const art = panel.inset(layout.halves.left).scaled(layout.scale);
        const inner = art.inset({ x: 10, y: 20, w: 30, h: 40 });

        near(inner.ptX(0), mmToPt(10 * layout.scale), 'nested origin x');
        near(inner.ptX(30) - inner.ptX(0), mmToPt(30 * layout.scale), 'nested width');
        assert.equal(inner.scale, art.scale, 'the scale is inherited, not reset');
      });
    });
  }

  it('measures text in its own units, whatever the scale', async () => {
    const { layout, panel } = await sheetPanel('a4');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const art = panel.inset(layout.halves.left).scaled(layout.scale);

    // widthOf answers in the panel's units, so layout code written against the
    // reference page gets the same answer at every album size.
    near(art.widthOf('Hello', font, 10), panel.widthOf('Hello', font, 10), 'width in panel units');
  });
});
