import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALBUM_SIZES,
  CALIBRATION,
  DEFAULT_ALBUM_SIZE,
  DEFAULT_ORIENTATION,
  DEFAULT_SLOTS_PER_PAGE,
  PAGE_CHROME,
  REF_PAGE,
  STICKER,
  STICKER_ORIENTATIONS,
  STICKER_SHEET,
  SHEET_LAYOUTS,
  canTurnSlot,
  gridChoices,
  layoutFor,
  normaliseSlotsPerPage,
  otherOrientation,
  slotSpanOf,
  slotsPerPageChoices,
  stickerBackRect,
  stickerSheetRect,
  stickerSize,
  stickersPerSheet,
} from '../src/geometry.ts';
import { mmToPt, ptToMm } from '../src/units.ts';

/** Every album a child can actually make: paper, turn and count together. */
const everyLayout = STICKER_ORIENTATIONS.flatMap((orientation) =>
  ALBUM_SIZES.flatMap((size) =>
    gridChoices(size, orientation).map((choice) => ({
      size,
      orientation,
      choice,
      where: `${size} ${orientation} with ${choice.perPage} per page`,
      layout: layoutFor(size, choice.perPage, orientation),
    })),
  ),
);

describe('paper sizes', () => {
  it('folds each sheet into two pages of the named paper', () => {
    // A4 sheets fold into A5 pages; A3 sheets fold into A4 pages.
    assert.deepEqual(layoutFor('a4').sheet, { w: 297, h: 210 });
    assert.deepEqual(layoutFor('a4').page, { w: 148.5, h: 210 });
    assert.deepEqual(layoutFor('a3').sheet, { w: 420, h: 297 });
    assert.deepEqual(layoutFor('a3').page, { w: 210, h: 297 });
  });

  it('puts two pages on a sheet with nothing left over', () => {
    for (const { layout } of everyLayout) {
      assert.equal(layout.page.w * 2, layout.sheet.w);
      assert.equal(layout.page.h, layout.sheet.h);
    }
  });

  it('uses the classic Panini sticker size in every album', () => {
    assert.deepEqual(STICKER, { w: 50, h: 70 });
    for (const { layout, where } of everyLayout) {
      // The whole point of the size feature: a smaller album gets FEWER
      // stickers, never smaller ones, because a sticker is a physical object.
      // Turning one is not resizing it either — the same rectangle, on its side.
      for (let i = 0; i < layout.slotsPerPage; i++) {
        const slot = layout.slotRect(i);
        assert.deepEqual({ w: slot.w, h: slot.h }, layout.sticker, `${where}: slot ${i}`);
        assert.deepEqual([slot.w, slot.h].sort(), [STICKER.h, STICKER.w].sort(), where);
      }
    }
  });

  it('turns the sticker rather than reshaping it', () => {
    assert.deepEqual(stickerSize('portrait'), { w: 50, h: 70 });
    assert.deepEqual(stickerSize('landscape'), { w: 70, h: 50 });
    // The default is what an album made before the choice existed already had.
    assert.deepEqual(stickerSize(), stickerSize(DEFAULT_ORIENTATION));
  });

  it('scales the big album by one and the small one by the A-series ratio', () => {
    assert.equal(layoutFor('a3').scale, 1);
    assert.ok(Math.abs(layoutFor('a4').scale - 1 / Math.SQRT2) < 0.002);
  });
});

describe('units', () => {
  it('round-trips millimetres through PDF points', () => {
    for (const mm of [0.25, 50, 70, 148.5, 210, 297, 420]) {
      assert.ok(Math.abs(ptToMm(mmToPt(mm)) - mm) < 1e-9);
    }
  });

  it('matches the known point size of A4', () => {
    assert.ok(Math.abs(mmToPt(210) - 595.2755905) < 1e-6);
    assert.ok(Math.abs(mmToPt(297) - 841.8897637) < 1e-6);
  });
});

describe('choosing how many stickers fit on a page', () => {
  it('offers more choices on bigger paper', () => {
    assert.deepEqual(slotsPerPageChoices('a4'), [2, 4]);
    assert.deepEqual(slotsPerPageChoices('a3'), [4, 6, 9]);
  });

  it('offers fewer choices once the sticker is turned', () => {
    // Two 70 mm stickers side by side are wider than half an A4 sheet, so the
    // small album has a single landscape grid: one column, two rows.
    assert.deepEqual(slotsPerPageChoices('a4', 'landscape'), [2]);
    assert.deepEqual(slotsPerPageChoices('a3', 'landscape'), [4, 6, 8]);
  });

  it('starts a new album on the fullest page its paper allows', () => {
    for (const orientation of STICKER_ORIENTATIONS) {
      for (const size of ALBUM_SIZES) {
        const choices = slotsPerPageChoices(size, orientation);
        assert.equal(DEFAULT_SLOTS_PER_PAGE[orientation][size], Math.max(...choices));
      }
    }
  });

  it('snaps a count this paper cannot print onto one it can', () => {
    // Nine stickers do not fit an A5 page at 50 x 70 mm, so asking for nine
    // gets the busiest A5 page instead of a broken one.
    assert.equal(normaliseSlotsPerPage('a4', 9), 4);
    assert.equal(normaliseSlotsPerPage('a4', 3), 4);
    assert.equal(normaliseSlotsPerPage('a3', 6), 6);
    // Nine standing stickers is a grid; nine lying ones never was.
    assert.equal(normaliseSlotsPerPage('a3', 9, 'landscape'), 8);
    assert.equal(normaliseSlotsPerPage('a4', 4, 'landscape'), 2);
  });

  it('opens an album carrying nonsense rather than refusing to', () => {
    assert.equal(layoutFor('quarto', 17).size, DEFAULT_ALBUM_SIZE);
    assert.equal(layoutFor('a3', 9, 'sideways').orientation, DEFAULT_ORIENTATION);
    assert.equal(
      layoutFor(undefined, undefined, undefined).slotsPerPage,
      DEFAULT_SLOTS_PER_PAGE[DEFAULT_ORIENTATION][DEFAULT_ALBUM_SIZE],
    );
  });

  it('gives every choice the grid it promises', () => {
    for (const { choice, layout } of everyLayout) {
      assert.equal(layout.slotsPerPage, choice.perPage);
      assert.equal(choice.cols * choice.rows, choice.perPage);
    }
  });
});

describe('album page grid', () => {
  it('is horizontally centred on its page', () => {
    for (const { choice, layout, where } of everyLayout) {
      const first = layout.slotRect(0);
      const last = layout.slotRect(choice.cols - 1);
      assert.equal(first.x, layout.page.w - (last.x + last.w), where);
    }
  });

  it('spaces slots by exactly one sticker plus the gap', () => {
    // To a ten-thousandth of a millimetre: the two renderers share this
    // function, so what matters is the pitch, not the last bit of a double.
    const near = (a: number, b: number, what: string) =>
      assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} vs ${b}`);

    for (const { choice, layout, where } of everyLayout) {
      if (choice.cols > 1) {
        near(layout.slotRect(1).x - layout.slotRect(0).x, layout.sticker.w + layout.grid.gapX, where);
      }
      if (choice.rows > 1) {
        near(
          layout.slotRect(choice.cols).y - layout.slotRect(0).y,
          layout.sticker.h + layout.grid.labelH + layout.grid.gapY,
          where,
        );
      }
    }
  });

  it('keeps every slot and its name strip on the page, clear of the chrome', () => {
    for (const { layout, where } of everyLayout) {
      // The header band and the page-number pill are drawn in reference
      // millimetres, so they land here once scaled onto the real page.
      const headerBottom = (PAGE_CHROME.headerTop + PAGE_CHROME.headerH) * layout.scale;
      const footerTop = PAGE_CHROME.footerTop * layout.scale;

      for (let i = 0; i < layout.slotsPerPage; i++) {
        const slot = layout.slotRect(i);
        const label = layout.slotLabelRect(i);
        assert.ok(slot.x >= 0 && slot.x + slot.w <= layout.page.w, `${where}: slot ${i} horizontally`);
        assert.ok(slot.y > headerBottom, `${where}: slot ${i} clears the title band`);
        assert.ok(label.y + label.h < footerTop, `${where}: slot ${i} clears the page number`);
      }
    }
  });

  it('rejects out-of-range slots rather than drawing off the page', () => {
    for (const { layout } of everyLayout) {
      assert.throws(() => layout.slotRect(-1), RangeError);
      assert.throws(() => layout.slotRect(layout.slotsPerPage), RangeError);
    }
  });

  it('keeps the page chrome inside the reference page it is drawn on', () => {
    assert.ok(PAGE_CHROME.headerTop + PAGE_CHROME.headerH < PAGE_CHROME.footerTop);
    assert.ok(PAGE_CHROME.footerY < REF_PAGE.h);
  });

  it('leaves a printable margin at both edges of the page', () => {
    // The reason the small album has only one landscape column: two of them
    // would clear the paper by a quarter of a millimetre, which no printer can
    // honour and no pair of scissors can rescue.
    for (const { layout, where } of everyLayout) {
      assert.ok(layout.grid.marginX >= 5, `${where}: side margin is ${layout.grid.marginX} mm`);
    }
  });
});


describe('turning one sticker on a page', () => {
  it('gives a turned sticker the room of two, and the sticker its true size', () => {
    for (const { layout, where } of everyLayout) {
      const turned = otherOrientation(layout.orientation);
      for (let cell = 0; cell < layout.slotsPerPage; cell++) {
        const span = slotSpanOf(layout, cell, turned);
        if (!span) continue;
        assert.equal(span.cells.length, 2, `${where}: cell ${cell} takes two`);
        assert.deepEqual({ w: span.rect.w, h: span.rect.h }, stickerSize(turned), `${where}: cell ${cell}`);
        assert.ok(span.cells.includes(cell), 'it keeps the cell it was in');
      }
    }
  });

  it('leaves an unturned sticker exactly on its own cell', () => {
    for (const { layout, where } of everyLayout) {
      for (let cell = 0; cell < layout.slotsPerPage; cell++) {
        const span = slotSpanOf(layout, cell, layout.orientation)!;
        assert.deepEqual(span.cells, [cell], where);
        assert.deepEqual(span.rect, layout.slotRect(cell), `${where}: cell ${cell}`);
        assert.deepEqual(span.label, layout.slotLabelRect(cell), `${where}: cell ${cell} label`);
      }
    }
  });

  it('keeps a turned sticker inside the two cells it took', () => {
    for (const { layout, where } of everyLayout) {
      const turned = otherOrientation(layout.orientation);
      for (let cell = 0; cell < layout.slotsPerPage; cell++) {
        const span = slotSpanOf(layout, cell, turned);
        if (!span) continue;
        const a = layout.slotRect(span.cells[0]!);
        const b = layout.slotRect(span.cells[1]!);
        const hole = { x: a.x, y: a.y, right: b.x + b.w, bottom: b.y + b.h };
        assert.ok(span.rect.x >= hole.x - 1e-9, `${where}: cell ${cell} left`);
        assert.ok(span.rect.y >= hole.y - 1e-9, `${where}: cell ${cell} top`);
        assert.ok(span.rect.x + span.rect.w <= hole.right + 1e-9, `${where}: cell ${cell} right`);
        assert.ok(span.label.y + span.label.h <= hole.bottom + 1e-9, `${where}: cell ${cell} bottom`);
      }
    }
  });

  it('takes the cell behind it when it is at the end of the run', () => {
    // A3 standing, three across: the sticker in the last column turns by
    // swallowing the one to its left rather than refusing.
    const layout = layoutFor('a3', 9);
    assert.deepEqual(slotSpanOf(layout, 0, 'landscape')!.cells, [0, 1]);
    assert.deepEqual(slotSpanOf(layout, 2, 'landscape')!.cells, [1, 2]);
    assert.equal(slotSpanOf(layout, 2, 'landscape')!.start, 1);
  });

  it('refuses where the grid has no second cell to give', () => {
    // One column of standing stickers: nothing beside it, either way.
    const single = layoutFor('a4', 2);
    assert.equal(single.grid.cols, 1);
    for (let cell = 0; cell < single.slotsPerPage; cell++) {
      assert.equal(slotSpanOf(single, cell, 'landscape'), null);
      assert.equal(canTurnSlot(single, cell), false);
    }
    assert.equal(slotSpanOf(layoutFor('a3', 9), 99, 'landscape'), null, 'a cell off the grid');
  });

  it('turns down the column in an album of lying stickers', () => {
    // The mirror image: a standing sticker in a lying album needs the cell
    // below it, not the one beside it.
    const layout = layoutFor('a3', 8, 'landscape');
    assert.equal(layout.grid.cols, 2);
    assert.deepEqual(slotSpanOf(layout, 0, 'portrait')!.cells, [0, 2]);
    assert.deepEqual(slotSpanOf(layout, 6, 'portrait')!.cells, [4, 6]);
  });
});

describe('sticker sheet', () => {
  it('is A4 whatever size the album is, because sticker paper is A4', () => {
    assert.deepEqual(STICKER_SHEET, { w: 210, h: 297 });
  });

  it('reserves the same upright cell whichever way a sticker stands', () => {
    // A lying sticker is printed lying inside one of these, and turned once it
    // has been cut out — so the grid, the pitch and the count never change.
    for (let i = 0; i < stickersPerSheet('full'); i++) {
      const cell = stickerSheetRect(i, 'full');
      assert.deepEqual({ w: cell.w, h: cell.h }, STICKER);
      assert.ok(cell.w >= stickerSize('landscape').h && cell.h >= stickerSize('landscape').w);
    }
  });

  it('puts every number behind the sticker it belongs to', () => {
    // The number is printed on the backing paper, so the sheet goes through
    // the printer twice. The flip is on the short edge, which on upright paper
    // keeps left where it is and swaps top for bottom — so a back cell is its
    // own front cell mirrored about the middle of the sheet, and nothing else.
    for (const layout of ['full', 'safe'] as const) {
      for (let i = 0; i < stickersPerSheet(layout); i++) {
        const front = stickerSheetRect(i, layout);
        const back = stickerBackRect(i, layout);
        const where = `${layout} cell ${i}`;
        assert.deepEqual({ w: back.w, h: back.h }, { w: front.w, h: front.h }, `${where}: same cell`);
        assert.equal(back.x, front.x, `${where}: the flip moves nothing sideways`);
        assert.equal(back.y + back.h, STICKER_SHEET.h - front.y, `${where}: top for bottom`);
        assert.ok(back.y >= 0 && back.y + back.h <= STICKER_SHEET.h, `${where}: stays on the paper`);
      }
    }
  });

  for (const layout of ['full', 'safe'] as const) {
    describe(layout, () => {
      const L = SHEET_LAYOUTS[layout];

      it('fits on A4', () => {
        const last = stickerSheetRect(stickersPerSheet(layout) - 1, layout);
        assert.ok(last.x + last.w <= STICKER_SHEET.w, 'width');
        assert.ok(last.y + last.h <= STICKER_SHEET.h, 'height');
      });

      it('is horizontally centred', () => {
        const last = stickerSheetRect(stickersPerSheet(layout) - 1, layout);
        assert.equal(stickerSheetRect(0, layout).x, STICKER_SHEET.w - (last.x + last.w));
      });

      it('packs stickers edge to edge, so the cut pitch is exactly one sticker', () => {
        if (L.cols > 1) assert.equal(stickerSheetRect(1, layout).x - stickerSheetRect(0, layout).x, STICKER.w);
        assert.equal(stickerSheetRect(L.cols, layout).y - stickerSheetRect(0, layout).y, STICKER.h);
      });

      it('leaves the bottom margin free for the calibration ruler', () => {
        const last = stickerSheetRect(stickersPerSheet(layout) - 1, layout);
        assert.ok(last.y + last.h <= CALIBRATION.y, 'stickers must not overlap the ruler');
      });
    });
  }

  it('measures 50 mm, which is what makes the ruler a valid scale check', () => {
    assert.equal(CALIBRATION.length, STICKER.w);
    assert.ok(CALIBRATION.x > 0 && CALIBRATION.x + CALIBRATION.length < STICKER_SHEET.w);
  });
});
