import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CROP, LANGS, type Page, type Slot } from '../src/types.ts';
import { stickersPerSheet } from '../src/geometry.ts';
import { translator } from '../src/i18n.ts';
import {
  PRINT_PAPER,
  PRINT_PARTS,
  STICKER_PAPER,
  describePart,
  paperText,
  printFileName,
  printShopNote,
  printSheetCounts,
  sheetPaperFor,
} from '../src/printing.ts';

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

const pages = (count: number, slotCount = 9, filled = 0): Page[] =>
  Array.from({ length: count }, (_, i) => page(`p${i}`, i, slotCount, filled));

const t = translator('en');

describe('print paper', () => {
  it('asks for three different papers, cover heaviest', () => {
    const cover = PRINT_PAPER.cover.gsm!;
    const inner = PRINT_PAPER.pages.gsm!;
    assert.ok(cover[0] > inner[1], 'the cover is card, the pages are not');
    // Well above the 80 g/m2 of office paper, or the photo behind shows through.
    assert.ok(inner[0] > 80);
    assert.equal(PRINT_PAPER.stickers.gsm, null, 'sticker paper is named by what it does');
  });

  it('prints the cover and the pages on both sides, the stickers on one', () => {
    assert.equal(PRINT_PAPER.cover.duplex, true);
    assert.equal(PRINT_PAPER.pages.duplex, true);
    assert.equal(PRINT_PAPER.stickers.duplex, false);
  });

  it('keeps sticker sheets at A4 however big the album is', () => {
    assert.equal(sheetPaperFor('stickers', 'a3'), STICKER_PAPER);
    assert.equal(sheetPaperFor('stickers', 'a4'), STICKER_PAPER);
    assert.equal(sheetPaperFor('cover', 'a3'), 'A3');
    assert.equal(sheetPaperFor('pages', 'a4'), 'A4');
  });
});

describe('print sheet counts', () => {
  it('folds four album pages onto one sheet', () => {
    assert.deepEqual(printSheetCounts({ pages: pages(4) }), { cover: 1, pages: 1, stickers: 0 });
  });

  it('counts the filler pages into the sheet it needs', () => {
    // Five pages become eight: two sheets, not one and a quarter.
    assert.equal(printSheetCounts({ pages: pages(5) }).pages, 2);
  });

  it('fills sticker sheets before starting another', () => {
    const perSheet = stickersPerSheet('full');
    assert.equal(printSheetCounts({ pages: pages(1, perSheet, perSheet) }).stickers, 1);
    assert.equal(printSheetCounts({ pages: pages(2, perSheet, perSheet) }).stickers, 2);
    assert.equal(printSheetCounts({ pages: pages(1, perSheet, 1) }).stickers, 1, 'one sticker still needs a sheet');
  });
});

describe('print file names', () => {
  it('carries the album name, transliterated, not dropped', () => {
    // A Cyrillic title used to strip to nothing, so every album downloaded as
    // the same "album-korice.pdf". Now it keeps its shape.
    assert.equal(printFileName('Мој албум', 'cover', 'sr-Cyrl'), 'Moj album - korice.pdf');
    assert.equal(printFileName('Zvezde 2026', 'pages', 'sr-Latn'), 'Zvezde 2026 - strane.pdf');
    assert.notEqual(
      printFileName('Свемир', 'cover', 'sr-Cyrl'),
      printFileName('Дино', 'cover', 'sr-Cyrl'),
      'two Cyrillic titles never collapse onto one filename',
    );
  });

  it('says which of the three PDFs it is, in the album language', () => {
    assert.equal(printFileName('Stars', 'cover', 'en'), 'Stars - cover.pdf');
    assert.equal(printFileName('Stars', 'pages', 'sr-Cyrl'), 'Stars - strane.pdf');
    assert.equal(printFileName('Космос', 'stickers', 'ru'), 'Kosmos - nakleyki.pdf');
  });

  it('falls back to a name when the title has nothing usable', () => {
    assert.equal(printFileName('', 'stickers', 'sr-Cyrl'), 'album - nalepnice.pdf');
    assert.equal(printFileName('!!!', 'stickers', 'en'), 'album - stickers.pdf');
  });

  it('stays ASCII a print shop can read back over the phone', () => {
    for (const lang of LANGS) {
      for (const part of PRINT_PARTS) {
        assert.match(printFileName('Ђорђе & Маша', part, lang), /^[\x20-\x7E]+\.pdf$/, lang);
      }
    }
  });

  it('never lets a title run away with the filename', () => {
    assert.ok(printFileName('x'.repeat(200), 'cover', 'en').length < 60);
  });
});

describe('the note for the print shop', () => {
  const parts = PRINT_PARTS.map((part) =>
    describePart(t, part, { sheet: sheetPaperFor(part, 'a3'), sheets: 3, file: printFileName('Stars', part, 'en') }),
  );

  it('names every file, its paper and how many sheets of it', () => {
    const note = printShopNote(t, parts);
    for (const part of parts) {
      assert.ok(note.includes(part.file), `${part.part}: the filename`);
      assert.ok(note.includes(part.paper), `${part.part}: the paper`);
      assert.ok(note.includes(`3 × ${part.sheet}`), `${part.part}: the sheet count`);
    }
  });

  it('says how to print before it says what to print on', () => {
    const note = printShopNote(t, parts);
    assert.ok(note.indexOf('100%') < note.indexOf(parts[0]!.file), 'the scale comes first');
    assert.match(note, /short edge/, 'the duplex flip the imposition assumes');
    assert.match(note, /saddle stitch|staple/, 'and what to do with the paper afterwards');
  });

  it('is a whole sentence in every language, with nothing left unfilled', () => {
    for (const lang of LANGS) {
      const say = translator(lang);
      const localised = PRINT_PARTS.map((part) =>
        describePart(say, part, { sheet: sheetPaperFor(part, 'a4'), sheets: 2, file: printFileName('Stars', part, lang) }),
      );
      const note = printShopNote(say, localised);
      assert.doesNotMatch(note, /[{}]/, `${lang}: an unfilled placeholder`);
      assert.doesNotMatch(note, /print\.(spec|shop|paper|sheets)/, `${lang}: a missing translation shows the key`);
      for (const part of localised) {
        assert.ok(part.paper.length > 3, `${lang}: ${part.part} names its paper`);
        assert.ok(part.sheetsLine.includes('2'), `${lang}: ${part.part} counts its sheets`);
      }
      // The weight is a number in every language, and only where there is one.
      assert.match(paperText(say, 'cover'), /200/);
      assert.doesNotMatch(paperText(say, 'stickers'), /\d/);
    }
  });
});
