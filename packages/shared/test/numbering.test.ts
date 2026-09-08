import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CROP, type Page, type Slot } from '../src/types.ts';
import { countEmpty, countFilled, numbersAreContiguous, renumber } from '../src/numbering.ts';
import {
  MIN_PRINT_DPI,
  coverPlacement,
  panCrop,
  photoPlacement,
  printDpi,
  printsSharply,
  quarterTurn,
  turnCrop,
} from '../src/imaging.ts';
import { STICKER_INSET, stickerSize, stickerWindow } from '../src/geometry.ts';
import { MM_PER_INCH } from '../src/units.ts';

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
      orientation: 'portrait' as const,
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
      { x: 0, y: 0, scale: 1, rotate: 0 },
      { x: 1, y: 1, scale: 1, rotate: 0 },
      { x: 0.5, y: 0, scale: 3, rotate: 0 },
    ]) {
      const p = coverPlacement(box, 4000, 3000, crop);
      assert.ok(p.x <= box.x + 1e-9, `left edge for ${JSON.stringify(crop)}`);
      assert.ok(p.y <= box.y + 1e-9, 'top edge');
      assert.ok(p.x + p.w >= box.x + box.w - 1e-9, 'right edge');
      assert.ok(p.y + p.h >= box.y + box.h - 1e-9, 'bottom edge');
    }
  });

  it('treats zoom below 1 as no zoom, so a photo can never shrink inside its window', () => {
    const normal = coverPlacement(box, 3000, 4000, { x: 0.5, y: 0.5, scale: 1, rotate: 0 });
    const shrunk = coverPlacement(box, 3000, 4000, { x: 0.5, y: 0.5, scale: 0.2, rotate: 0 });
    assert.deepEqual(shrunk, normal);
  });
});

describe('turning a photo', () => {
  const sticker = { x: 0, y: 0, w: 50, h: 70 };
  const turned = (rotate: number) => ({ ...DEFAULT_CROP, rotate });

  it('snaps anything to a quarter turn, so a sticker stays full of picture', () => {
    assert.equal(quarterTurn(0), 0);
    assert.equal(quarterTurn(90), 90);
    assert.equal(quarterTurn(450), 90);
    assert.equal(quarterTurn(-90), 270);
    assert.equal(quarterTurn(44), 0);
    assert.equal(quarterTurn('sideways'), 0);
    assert.equal(quarterTurn(undefined), 0);
  });

  it('comes back to where it started after four presses', () => {
    let crop = DEFAULT_CROP;
    const seen = [crop.rotate];
    for (let i = 0; i < 4; i++) {
      crop = turnCrop(crop);
      seen.push(crop.rotate);
    }
    assert.deepEqual(seen, [0, 90, 180, 270, 0]);
  });

  it('leaves an unturned photo exactly where it always was', () => {
    const plain = photoPlacement(sticker, 4000, 3000, DEFAULT_CROP);
    assert.equal(plain.rotate, 0);
    assert.deepEqual(plain.frame, sticker);
    assert.deepEqual(plain.image, coverPlacement(sticker, 4000, 3000, DEFAULT_CROP));
  });

  it('fits a quarter-turned photo to the window lying on its side', () => {
    const { frame, image, rotate } = photoPlacement(sticker, 4000, 3000, turned(90));
    assert.equal(rotate, 90);
    // Same middle as the window, so turning it lands back on the window.
    assert.equal(frame.x + frame.w / 2, sticker.x + sticker.w / 2);
    assert.equal(frame.y + frame.h / 2, sticker.y + sticker.h / 2);
    assert.deepEqual({ w: frame.w, h: frame.h }, { w: sticker.h, h: sticker.w });
    // And the picture still covers that frame with no gap to show.
    assert.ok(image.x <= frame.x + 1e-9 && image.y <= frame.y + 1e-9);
    assert.ok(image.x + image.w >= frame.x + frame.w - 1e-9);
    assert.ok(image.y + image.h >= frame.y + frame.h - 1e-9);
  });

  it('is a picture of a wide photo left whole, which is the point of turning one', () => {
    // A 4:3 photo in a 5:7 window is cropped to a sliver of its width; turned,
    // the window is 7:5 and far more of the picture survives.
    const upright = photoPlacement(sticker, 4000, 3000, DEFAULT_CROP);
    const sideways = photoPlacement(sticker, 4000, 3000, turned(90));
    const shown = (p: { frame: { w: number; h: number }; image: { w: number; h: number } }) =>
      (p.frame.w / p.image.w) * (p.frame.h / p.image.h);
    assert.ok(shown(sideways) > shown(upright), 'a turned window shows more of a wide photo');
  });

  it('turns twice to the same window, and four times back to the first', () => {
    const half = photoPlacement(sticker, 4000, 3000, turned(180));
    assert.deepEqual(half.frame, sticker);
    assert.deepEqual(photoPlacement(sticker, 4000, 3000, turned(360)), photoPlacement(sticker, 4000, 3000, DEFAULT_CROP));
    assert.deepEqual(
      photoPlacement(sticker, 4000, 3000, turned(270)).frame,
      photoPlacement(sticker, 4000, 3000, turned(90)).frame,
    );
  });

  it('follows the finger on a turned photo instead of moving sideways to it', () => {
    // Dragging right on the glass moves the picture right on the glass, which
    // on a quarter-turned photo is a move along its own vertical axis.
    const zoomed = { ...DEFAULT_CROP, scale: 2 };
    const right = panCrop({ ...zoomed, rotate: 90 }, sticker, 4000, 3000, 5, 0);
    assert.equal(right.x, zoomed.x, 'the picture does not slide across its own width');
    assert.ok(right.y > zoomed.y, 'it travels along the axis the turn put under the finger');

    // And at 270 the same drag goes the other way, as the mirror image should.
    const other = panCrop({ ...zoomed, rotate: 270 }, sticker, 4000, 3000, 5, 0);
    assert.ok(other.y < zoomed.y);
  });

  it('keeps the turn through a pan, because a drag is not a turn', () => {
    assert.equal(panCrop(turned(90), sticker, 4000, 3000, 3, 3).rotate, 90);
  });
});

describe('printDpi', () => {
  const window = stickerWindow('portrait');

  it('measures the picture window inside the peel border, not the sticker', () => {
    const sticker = stickerSize('portrait');
    assert.deepEqual(window, {
      w: sticker.w - 2 * STICKER_INSET,
      h: sticker.h - 2 * STICKER_INSET,
    });
  });

  it('is the pixels spread over the millimetres they are printed across', () => {
    // A photo the exact shape of the window is not cropped at all, so every
    // one of its pixels lands on paper: 800 across 46.8 mm is 434 dpi.
    const dpi = printDpi(window, 800, Math.round(800 * (window.h / window.w)), DEFAULT_CROP);
    assert.equal(Math.round(dpi), Math.round((800 / window.w) * MM_PER_INCH));
  });

  it('counts only the pixels that survive the crop', () => {
    // A wide photo in an upright window keeps its height and loses its width,
    // so it prints from its short side however many pixels the long one has.
    const wide = printDpi(window, 4000, 1000, DEFAULT_CROP);
    const shorter = printDpi(window, 1200, 1000, DEFAULT_CROP);
    assert.ok(Math.abs(wide - shorter) < 1e-9, 'extra width that is cropped away buys nothing');
  });

  it('falls with the zoom, because zoom spends pixels on less of the picture', () => {
    const whole = printDpi(window, 1400, 1050, DEFAULT_CROP);
    const closer = printDpi(window, 1400, 1050, { ...DEFAULT_CROP, scale: 2 });
    assert.ok(Math.abs(closer - whole / 2) < 1e-9);
  });

  it('is unchanged by turning the photo, which moves no pixels', () => {
    // The turn swaps which side covers which, so a square photo must read the
    // same at every quarter and a rectangular one must read the same at 180.
    const square = [0, 90, 180, 270].map((rotate) =>
      printDpi(window, 1000, 1000, { ...DEFAULT_CROP, rotate }),
    );
    assert.ok(square.every((d) => Math.abs(d - square[0]!) < 1e-9));
    assert.ok(
      Math.abs(
        printDpi(window, 1400, 1050, { ...DEFAULT_CROP, rotate: 180 }) -
          printDpi(window, 1400, 1050, DEFAULT_CROP),
      ) < 1e-9,
    );
  });

  it('says nothing rather than Infinity about an image of no size', () => {
    assert.equal(printDpi(window, 0, 0, DEFAULT_CROP), 0);
    assert.equal(printsSharply(window, 0, 0, DEFAULT_CROP), false);
  });

  it('passes what the upload cap actually produces, at every ordinary shape', () => {
    // `maxImageDimension` is 1400 on the long side. Nothing that comes out of
    // it may trip the warning unzoomed, or the warning is about our own
    // downsampling rather than about the child's photo.
    for (const [w, h] of [
      [1400, 1400],
      [1400, 1050],
      [1050, 1400],
      [1400, 787],
      [787, 1400],
    ] as const) {
      assert.ok(
        printsSharply(window, w, h, DEFAULT_CROP),
        `${w}x${h} from the upload cap should print sharply`,
      );
    }
  });

  it('catches a picture too small to print, of the size a search hit really is', () => {
    assert.equal(printsSharply(window, 400, 300, DEFAULT_CROP), false);
  });

  it('turns over exactly at the floor it names', () => {
    // Derived the other way round from `printDpi`: a square photo whose side
    // covers the window's long side at exactly MIN_PRINT_DPI.
    const px = Math.ceil((window.h / MM_PER_INCH) * MIN_PRINT_DPI);
    assert.ok(printsSharply(window, px, px, DEFAULT_CROP));
    assert.equal(printsSharply(window, px - 2, px - 2, DEFAULT_CROP), false);
  });
});
