import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import type { AlbumSize, PrintPart } from '@album/shared';
import {
  ALBUM_SIZES,
  GRID_CHOICES,
  STICKER_SHEET,
  TEMPLATES,
  layoutFor,
  mmToPt,
  printFileName,
  sheetPaperFor,
  stickersPerSheet,
} from '@album/shared';
import { buildCoverPdf, buildPagesPdf, buildStickersPdf } from '../src/pdf/index.ts';
import { fixtureImageLoader, makeFixtureAlbum } from '../src/testing/fixtures.ts';

const loadImage = fixtureImageLoader();
const TOLERANCE = 0.01; // points

const subjectOf = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getSubject() ?? '';

async function sizesOf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => ({ w: p.getWidth(), h: p.getHeight() }));
}

const assertSize = (got: { w: number; h: number }, wMm: number, hMm: number, what: string) => {
  assert.ok(Math.abs(got.w - mmToPt(wMm)) < TOLERANCE, `${what} width: ${got.w} vs ${mmToPt(wMm)}`);
  assert.ok(Math.abs(got.h - mmToPt(hMm)) < TOLERANCE, `${what} height: ${got.h} vs ${mmToPt(hMm)}`);
};

describe('cover pdf', () => {
  it('is a single landscape sheet with two printed sides', async () => {
    for (const size of ALBUM_SIZES) {
      const album = makeFixtureAlbum({ size, pages: 3, filled: 5 });
      const sheet = layoutFor(size, album.slotsPerPage).sheet;
      const sizes = await sizesOf(await buildCoverPdf({ album, loadImage }));
      assert.equal(sizes.length, 2, `${size}: outside and inside`);
      for (const s of sizes) assertSize(s, sheet.w, sheet.h, `${size} cover sheet`);
    }
  });

  it('prints a photo cover when the child chose one', async () => {
    const album = makeFixtureAlbum({
      templateId: 'football',
      coverVariantId: 'myleague',
      coverImageId: 'img-cover',
      pages: 2,
      filled: 2,
    });
    const bytes = await buildCoverPdf({ album, loadImage });
    assert.ok(bytes.length > 0);
  });

  it('falls back to the theme artwork when a photo cover has no photo yet', async () => {
    const withPhoto = await buildCoverPdf({
      album: makeFixtureAlbum({ coverVariantId: 'myleague', coverImageId: 'img-cover', pages: 2, filled: 0 }),
      loadImage,
    });
    const without = await buildCoverPdf({
      album: makeFixtureAlbum({ coverVariantId: 'myleague', coverImageId: null, pages: 2, filled: 0 }),
      loadImage,
    });
    // Both print; the one without a photo is the drawn cover, so it is smaller.
    assert.ok(without.length > 0);
    assert.ok(withPhoto.length > without.length, 'the photo cover embeds an image');
  });

  it('still prints when the cover photo has gone missing from storage', async () => {
    const album = makeFixtureAlbum({ coverVariantId: 'myleague', coverImageId: 'img-cover', pages: 2, filled: 0 });
    const bytes = await buildCoverPdf({ album, loadImage: async () => null });
    assert.ok(bytes.length > 0);
  });
});

describe('pages pdf', () => {
  it('pads an awkward page count up to a whole folded sheet', async () => {
    const album = makeFixtureAlbum({ pages: 5, filled: 10 });
    const result = await buildPagesPdf({ album, loadImage });
    assert.equal(result.fillerCount, 3, '5 pages needs 3 fillers to reach 8');
    // 8 album pages -> 2 sheets -> 4 printed sides.
    assert.equal((await sizesOf(result.bytes)).length, 4);
  });

  it('adds nothing when the count already folds cleanly', async () => {
    const album = makeFixtureAlbum({ pages: 8, filled: 0 });
    const result = await buildPagesPdf({ album, loadImage });
    assert.equal(result.fillerCount, 0);
    assert.equal((await sizesOf(result.bytes)).length, 4);
  });

  it('prints every side on the paper the album was made for', async () => {
    for (const size of ALBUM_SIZES) {
      for (const choice of GRID_CHOICES[size]) {
        const album = makeFixtureAlbum({ size, slotsPerPage: choice.perPage, pages: 4, filled: 4 });
        const sheet = layoutFor(size, choice.perPage).sheet;
        const result = await buildPagesPdf({ album, loadImage });
        for (const s of await sizesOf(result.bytes)) {
          assertSize(s, sheet.w, sheet.h, `${size} / ${choice.perPage} page sheet`);
        }
      }
    }
  });

  it('always produces at least one sheet, even for a brand new album', async () => {
    const album = makeFixtureAlbum({ pages: 1, filled: 0 });
    const result = await buildPagesPdf({ album, loadImage });
    assert.equal(result.fillerCount, 3, 'one page is padded up to a single folded sheet');
    // 4 album pages fit on ONE sheet, which is two printed sides.
    assert.equal((await sizesOf(result.bytes)).length, 2);
  });
});

describe('stickers pdf', () => {
  it('prints only the slots that actually hold a photo', async () => {
    const album = makeFixtureAlbum({ pages: 5, filled: 30 });
    const result = await buildStickersPdf({ album, loadImage });
    assert.equal(result.stickerCount, 30);
    assert.equal(result.sheetCount, Math.ceil(30 / stickersPerSheet('full')));
  });

  it('is A4 portrait for every album size, so it fits ordinary sticker paper', async () => {
    for (const size of ALBUM_SIZES) {
      const album = makeFixtureAlbum({ size, pages: 2, filled: 3 });
      const result = await buildStickersPdf({ album, loadImage });
      for (const s of await sizesOf(result.bytes)) {
        assertSize(s, STICKER_SHEET.w, STICKER_SHEET.h, `${size} sticker sheet`);
      }
    }
  });

  it('produces no sheets at all when nothing has been added yet', async () => {
    const album = makeFixtureAlbum({ pages: 3, filled: 0 });
    const result = await buildStickersPdf({ album, loadImage });
    assert.equal(result.sheetCount, 0);
    assert.equal(result.stickerCount, 0);
  });

  it('honours the printer-safe fallback layout', async () => {
    const album = makeFixtureAlbum({ pages: 5, filled: 30 });
    const result = await buildStickersPdf({ album, loadImage, layout: 'safe' });
    assert.equal(result.sheetCount, Math.ceil(30 / stickersPerSheet('safe')));
  });
});

describe('resilience', () => {
  it('still prints when a photo has gone missing from storage', async () => {
    const album = makeFixtureAlbum({ pages: 2, filled: 6 });
    const result = await buildStickersPdf({ album, loadImage: async () => null });
    assert.equal(result.stickerCount, 6, 'the numbered stickers are still printed');
    assert.ok(result.bytes.length > 0);
  });

  it('renders every cover in the app without blowing up', async () => {
    for (const template of TEMPLATES) {
      for (const variant of template.variants) {
        const album = makeFixtureAlbum({
          templateId: template.id,
          coverVariantId: variant.id,
          pages: 2,
          filled: 2,
        });
        const cover = await buildCoverPdf({ album, loadImage });
        assert.ok(cover.length > 0, `${template.id}/${variant.id}`);
      }
    }
  });

  it('renders every language without blowing up', async () => {
    for (const lang of ['sr-Cyrl', 'sr-Latn', 'en', 'ru'] as const) {
      assert.ok((await buildCoverPdf({ album: makeFixtureAlbum({ lang, pages: 2, filled: 2 }), loadImage })).length > 0, lang);
    }
  });

  it('prints an album whose stored slot count its paper cannot fit', async () => {
    // A row that predates a layout change, or one edited by hand: the album
    // opens on the nearest printable grid rather than throwing mid-print.
    const album = { ...makeFixtureAlbum({ size: 'a4' as AlbumSize, pages: 2, filled: 2 }), slotsPerPage: 99 };
    const result = await buildPagesPdf({ album, loadImage });
    assert.ok(result.bytes.length > 0);
  });
});

describe('album page geometry', () => {
  it('places two pages on one sheet with nothing left over', () => {
    for (const size of ALBUM_SIZES) {
      const layout = layoutFor(size);
      assert.equal(layout.page.w * 2, layout.sheet.w);
      assert.equal(layout.page.h, layout.sheet.h);
    }
  });
});

describe('what a print shop is handed', () => {
  /**
   * The three files leave the app on their own — a shop gets the PDFs and not
   * the dialog that explained them — so each one has to say which paper it
   * wants in metadata a viewer will show.
   */
  it('carries its own paper, sheet count and sides in the PDF metadata', async () => {
    const album = makeFixtureAlbum({ size: 'a3', pages: 4, filled: 3 });
    const subjects: Record<string, string> = {
      cover: await subjectOf(await buildCoverPdf({ album, loadImage })),
      pages: await subjectOf((await buildPagesPdf({ album, loadImage })).bytes),
      stickers: await subjectOf((await buildStickersPdf({ album, loadImage })).bytes),
    };

    for (const [part, subject] of Object.entries(subjects)) {
      assert.ok(subject.includes(printFileName(album.title, part as PrintPart)), `${part}: names its own file`);
      assert.ok(subject.includes(sheetPaperFor(part as PrintPart, 'a3')), `${part}: names its paper size`);
    }

    assert.match(subjects.cover!, /200–250/, 'the cover asks for card');
    assert.match(subjects.pages!, /120–160/, 'the pages ask for something heavier than office paper');
    assert.doesNotMatch(subjects.stickers!, /\d+–\d+/, 'sticker paper comes in one weight');
    assert.notEqual(subjects.cover, subjects.pages, 'the same sheet, printed differently');
  });

  it('says A4 for the sticker sheets even in a big album', async () => {
    const album = makeFixtureAlbum({ size: 'a3', pages: 4, filled: 3 });
    assert.match(await subjectOf((await buildStickersPdf({ album, loadImage })).bytes), /A4/);
  });
});
