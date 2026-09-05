import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALBUM_SIZES,
  CALIBRATION,
  DEFAULT_ALBUM_SIZE,
  DEFAULT_SLOTS_PER_PAGE,
  GRID_CHOICES,
  PAGE_CHROME,
  REF_PAGE,
  SHEET_LAYOUTS,
  STICKER,
  STICKER_SHEET,
  layoutFor,
  normaliseSlotsPerPage,
  slotsPerPageChoices,
  stickerSheetRect,
  stickersPerSheet,
} from '../src/geometry.ts';
import { mmToPt, ptToMm } from '../src/units.ts';

/** Every album a child can actually make. */
const everyLayout = ALBUM_SIZES.flatMap((size) =>
  GRID_CHOICES[size].map((choice) => ({ size, choice, layout: layoutFor(size, choice.perPage) })),
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
    for (const { layout } of everyLayout) {
      // The whole point of the size feature: a smaller album gets FEWER
      // stickers, never smaller ones, because a sticker is a physical object.
      for (let i = 0; i < layout.slotsPerPage; i++) {
        const slot = layout.slotRect(i);
        assert.deepEqual({ w: slot.w, h: slot.h }, STICKER);
      }
    }
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

  it('starts a new album on the fullest page its paper allows', () => {
    for (const size of ALBUM_SIZES) {
      const choices = slotsPerPageChoices(size);
      assert.equal(DEFAULT_SLOTS_PER_PAGE[size], Math.max(...choices));
    }
  });

  it('snaps a count this paper cannot print onto one it can', () => {
    // Nine stickers do not fit an A5 page at 50 x 70 mm, so asking for nine
    // gets the busiest A5 page instead of a broken one.
    assert.equal(normaliseSlotsPerPage('a4', 9), 4);
    assert.equal(normaliseSlotsPerPage('a4', 3), 4);
    assert.equal(normaliseSlotsPerPage('a3', 6), 6);
  });

  it('opens an album carrying nonsense rather than refusing to', () => {
    assert.equal(layoutFor('quarto', 17).size, DEFAULT_ALBUM_SIZE);
    assert.equal(layoutFor(undefined, undefined).slotsPerPage, DEFAULT_SLOTS_PER_PAGE[DEFAULT_ALBUM_SIZE]);
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
    for (const { size, choice, layout } of everyLayout) {
      const first = layout.slotRect(0);
      const last = layout.slotRect(choice.cols - 1);
      assert.equal(
        first.x,
        layout.page.w - (last.x + last.w),
        `${size} with ${choice.perPage} per page`,
      );
    }
  });

  it('spaces slots by exactly one sticker plus the gap', () => {
    for (const { choice, layout } of everyLayout) {
      if (choice.cols > 1) {
        assert.equal(layout.slotRect(1).x - layout.slotRect(0).x, STICKER.w + layout.grid.gapX);
      }
      if (choice.rows > 1) {
        assert.equal(
          layout.slotRect(choice.cols).y - layout.slotRect(0).y,
          STICKER.h + layout.grid.labelH + layout.grid.gapY,
        );
      }
    }
  });

  it('keeps every slot and its name strip on the page, clear of the chrome', () => {
    for (const { size, choice, layout } of everyLayout) {
      const where = `${size} with ${choice.perPage} per page`;
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
});

describe('sticker sheet', () => {
  it('is A4 whatever size the album is, because sticker paper is A4', () => {
    assert.deepEqual(STICKER_SHEET, { w: 210, h: 297 });
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
