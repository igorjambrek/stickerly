import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PAGES_PER_SHEET,
  fillerPagesNeeded,
  impose,
  padToSignature,
  spreadOfPage,
  spreads,
} from '../src/imposition.ts';

describe('padToSignature', () => {
  it('rounds up to a whole folded sheet', () => {
    assert.equal(padToSignature(1), 4);
    assert.equal(padToSignature(4), 4);
    assert.equal(padToSignature(5), 8);
    assert.equal(padToSignature(9), 12);
    assert.equal(padToSignature(20), 20);
  });

  it('never returns less than one sheet', () => {
    assert.equal(padToSignature(0), PAGES_PER_SHEET);
  });

  it('reports how many blank pages the child never asked for', () => {
    assert.equal(fillerPagesNeeded(5), 3);
    assert.equal(fillerPagesNeeded(8), 0);
  });
});

describe('impose', () => {
  it('rejects counts that cannot be folded', () => {
    assert.throws(() => impose(6), RangeError);
    assert.throws(() => impose(0), RangeError);
  });

  for (const n of [4, 8, 12, 20, 40]) {
    describe(`${n} pages`, () => {
      const sides = impose(n);

      it('produces two sides per sheet', () => {
        assert.equal(sides.length, (n / PAGES_PER_SHEET) * 2);
      });

      it('prints every page exactly once', () => {
        const printed = sides.flatMap((s) => [s.left, s.right]).sort((a, b) => a - b);
        assert.deepEqual(printed, Array.from({ length: n }, (_, i) => i + 1));
      });

      it('pairs each page with its saddle-stitch partner', () => {
        // The two halves of any sheet side always sum to N + 1. This is the
        // property that makes a nested stack read in order once folded.
        for (const side of sides) {
          assert.equal(side.left + side.right, n + 1, `${side.side} of sheet ${side.sheet}`);
        }
      });

      it('puts each page directly behind its own leaf', () => {
        // Flipping on the SHORT edge mirrors the sheet left-to-right, so the
        // back of the right half carries the next page, and the back of the
        // left half carries the previous one. Get this wrong and the album
        // reads correctly on screen but out of order on paper.
        for (let s = 0; s < n / PAGES_PER_SHEET; s++) {
          const front = sides.find((x) => x.sheet === s && x.side === 'front')!;
          const back = sides.find((x) => x.sheet === s && x.side === 'back')!;
          assert.equal(back.left, front.right + 1);
          assert.equal(back.right, front.left - 1);
        }
      });

      it('starts on the outermost sheet and works inwards', () => {
        const first = sides[0]!;
        assert.equal(first.right, 1, 'page 1 is on the outermost sheet');
        assert.equal(first.left, n, 'and shares it with the last page');
      });
    });
  }
});

describe('spreads', () => {
  it('opens on page 1 alone, faced by the inside of the cover', () => {
    assert.deepEqual(spreads(4)[0], { index: 0, left: null, right: 1 });
  });

  it('pairs even pages on the left with odd pages on the right', () => {
    assert.deepEqual(spreads(8)[2], { index: 2, left: 4, right: 5 });
  });

  it('leaves the last page alone when nothing follows it', () => {
    assert.deepEqual(spreads(4).at(-1), { index: 2, left: 4, right: null });
    assert.deepEqual(spreads(1), [{ index: 0, left: null, right: 1 }]);
  });

  it('shows every page exactly once, in reading order', () => {
    for (const n of [1, 2, 3, 4, 5, 8, 9, 20]) {
      const seen = spreads(n).flatMap((s) => [s.left, s.right]).filter((p) => p !== null);
      assert.deepEqual(seen, Array.from({ length: n }, (_, i) => i + 1), `${n} pages`);
    }
  });

  it('has no spreads at all in an album with no pages', () => {
    assert.deepEqual(spreads(0), []);
  });

  it('agrees with spreadOfPage about where a page is seen', () => {
    const all = spreads(9);
    for (let page = 1; page <= 9; page++) {
      const spread = all[spreadOfPage(page)]!;
      assert.ok(spread.left === page || spread.right === page, `page ${page}`);
    }
  });
});
