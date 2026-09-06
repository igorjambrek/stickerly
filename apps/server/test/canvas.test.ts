import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inflateSync } from 'node:zlib';
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

/**
 * A sticker lying on its side, printed in an upright cell.
 *
 * The sticker sheet has one grid with one cut pitch: a lying sticker is drawn
 * turned inside the same 50 x 70 cell as everything else, and whoever cuts it
 * out turns it. That turn is a transformation pushed onto the PDF itself, so
 * the only honest way to check it is to read the operators back out and put a
 * point through them — which is what this does.
 */
describe('Panel.turned', () => {
  /** Every content stream in a saved PDF, as text. pdf-lib deflates them. */
  function operators(pdf: Buffer): string {
    const text = pdf.toString('latin1');
    const out: string[] = [];
    for (const m of text.matchAll(/stream\r?\n/g)) {
      const start = m.index + m[0].length;
      const end = text.indexOf('endstream', start);
      if (end < 0) continue;
      try {
        out.push(inflateSync(pdf.subarray(start, end)).toString('latin1'));
      } catch {
        // Not a deflated stream; some other object's bytes.
      }
    }
    return out.join('\n');
  }

  /** The `cm` matrix the turn pushed, read out of the page's own content stream. */
  async function matrixOf(draw: (panel: Panel) => void, cell: { x: number; y: number; w: number; h: number }) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([mmToPt(210), mmToPt(297)]);
    const sheet = new Panel(page, 0, 0, 210, 297);
    sheet.turned(cell, draw);

    const found = /([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm/.exec(
      operators(Buffer.from(await doc.save())),
    );
    assert.ok(found, 'the turn should push a transformation matrix');
    const [a, b, c, d, e, f] = found.slice(1).map(Number) as [number, number, number, number, number, number];
    return (x: number, y: number): [number, number] => [a * x + c * y + e, b * x + d * y + f];
  }

  it('lands a lying sticker exactly on the upright cell reserved for it', async () => {
    const cell = { x: 5, y: 6, w: STICKER.w, h: STICKER.h };
    let panel: Panel | undefined;
    const through = await matrixOf((p) => (panel = p), cell);
    assert.ok(panel, 'the callback is handed a panel to draw into');

    // The panel it draws into is the cell lying down: 70 across, 50 down.
    near(panel!.w, STICKER.h, 'the turned panel is as wide as the sticker is tall');
    near(panel!.h, STICKER.w, 'and as tall as the sticker is wide');

    // Every corner of what it draws has to land on the cell the grid reserved.
    const corners: [number, number][] = [
      [0, 0],
      [panel!.w, 0],
      [panel!.w, panel!.h],
      [0, panel!.h],
    ];
    const points = corners.map(([x, y]) => through(panel!.ptX(x), panel!.ptY(y)));
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);

    near(Math.min(...xs), mmToPt(cell.x), 'left edge of the cell');
    near(Math.max(...xs), mmToPt(cell.x + cell.w), 'right edge of the cell');
    near(Math.min(...ys), mmToPt(297 - (cell.y + cell.h)), 'bottom edge of the cell');
    near(Math.max(...ys), mmToPt(297 - cell.y), 'top edge of the cell');
  });

  it('turns clockwise, so the sticker top ends up on the right of the cell', async () => {
    const cell = { x: 5, y: 6, w: STICKER.w, h: STICKER.h };
    let panel: Panel | undefined;
    const through = await matrixOf((p) => (panel = p), cell);

    // The top-left of the lying sticker comes out at the top-right of the
    // upright cell that was reserved for it.
    const [x, y] = through(panel!.ptX(0), panel!.ptY(0));
    near(x, mmToPt(cell.x + cell.w), 'the badge corner moves to the right edge');
    near(y, mmToPt(297 - cell.y), 'and stays at the top');
  });
});
