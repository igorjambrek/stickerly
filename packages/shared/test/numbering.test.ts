import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CROP, type Page, type Slot } from '../src/types.ts';
import { countEmpty, countFilled, numbersAreContiguous, renumber } from '../src/numbering.ts';
import { coverPlacement } from '../src/imaging.ts';

const page = (id: string, position: number, slotCount: number, filled = 0): Page => ({
  id,
  position,
  kind: 'sticker',
  title: '',
  slots: Array.from(
    { length: slotCount },
    (_, i): Slot => ({
      id: `${id}-${i}`,
      pageId: id,
      position: i,
      number: 0,
      label: '',
      imageId: i < filled ? `img-${id}-${i}` : null,
      filledBy: null,
      crop: { ...DEFAULT_CROP },
    }),
  ),
});

describe('renumber', () => {
  it('numbers slots 1..N in reading order across pages', () => {
    const pages = renumber([page('a', 0, 3), page('b', 1, 3)]);
    assert.deepEqual(
      pages.flatMap((p) => p.slots.map((s) => s.number)),
      [1, 2, 3, 4, 5, 6],
    );
    assert.ok(numbersAreContiguous(pages));
  });

  it('sorts by position rather than trusting array order', () => {
    const pages = renumber([page('b', 1, 2), page('a', 0, 2)]);
    assert.deepEqual(pages.map((p) => p.id), ['a', 'b']);
    assert.equal(pages[0]!.slots[0]!.number, 1);
  });

  it('closes gaps after a page is deleted', () => {
    const before = renumber([page('a', 0, 3), page('b', 1, 3), page('c', 2, 3)]);
    const after = renumber(before.filter((p) => p.id !== 'b'));
    assert.ok(numbersAreContiguous(after));
    assert.deepEqual(after.map((p) => p.position), [0, 1]);
    // Page c's stickers move up to fill the hole left by b.
    assert.deepEqual(after[1]!.slots.map((s) => s.number), [4, 5, 6]);
  });

  it('renumbers when pages are reordered', () => {
    const pages = renumber([{ ...page('a', 1, 2) }, { ...page('b', 0, 2) }]);
    assert.deepEqual(pages.map((p) => p.id), ['b', 'a']);
    assert.deepEqual(pages[0]!.slots.map((s) => s.number), [1, 2]);
  });

  it('leaves the input untouched', () => {
    const original = [page('a', 0, 2)];
    renumber(original);
    assert.equal(original[0]!.slots[0]!.number, 0);
  });
});

describe('counting', () => {
  it('separates placed photos from empty spots', () => {
    const album = { pages: renumber([page('a', 0, 9, 4), page('b', 1, 9, 2)]) };
    assert.equal(countFilled(album), 6);
    assert.equal(countEmpty(album), 12);
  });
});

describe('coverPlacement', () => {
  const box = { x: 0, y: 0, w: 50, h: 70 };

  it('covers the box completely for a landscape photo', () => {
    const p = coverPlacement(box, 4000, 3000, DEFAULT_CROP);
    assert.ok(p.w >= box.w - 1e-9 && p.h >= box.h - 1e-9);
    assert.ok(Math.abs(p.w / p.h - 4000 / 3000) < 1e-9, 'aspect ratio preserved');
  });

  it('covers the box completely for a portrait photo', () => {
    const p = coverPlacement(box, 3000, 4000, DEFAULT_CROP);
    assert.ok(p.w >= box.w - 1e-9 && p.h >= box.h - 1e-9);
  });

  it('never lets the child drag a gap into view', () => {
    for (const crop of [
      { x: 0, y: 0, scale: 1 },
      { x: 1, y: 1, scale: 1 },
      { x: 0.5, y: 0, scale: 3 },
    ]) {
      const p = coverPlacement(box, 4000, 3000, crop);
      assert.ok(p.x <= box.x + 1e-9, `left edge for ${JSON.stringify(crop)}`);
      assert.ok(p.y <= box.y + 1e-9, 'top edge');
      assert.ok(p.x + p.w >= box.x + box.w - 1e-9, 'right edge');
      assert.ok(p.y + p.h >= box.y + box.h - 1e-9, 'bottom edge');
    }
  });

  it('treats zoom below 1 as no zoom, so a photo can never shrink inside its window', () => {
    const normal = coverPlacement(box, 3000, 4000, { x: 0.5, y: 0.5, scale: 1 });
    const shrunk = coverPlacement(box, 3000, 4000, { x: 0.5, y: 0.5, scale: 0.2 });
    assert.deepEqual(shrunk, normal);
  });
});
