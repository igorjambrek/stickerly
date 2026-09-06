/**
 * Generate sample PDFs from fixture data into ./tmp.
 *
 * This is the print-first workflow: fold and measure a real sample long before
 * the editor exists, because an imposition mistake is invisible on screen and
 * obvious on paper.
 *
 * Usage:
 *   npm run pdf:sample [template] [variant] [size] [perPage] [lang]
 *   npm run pdf:sample covers      -> one page per cover in the whole app
 *
 * Examples:
 *   npm run pdf:sample football champions a3 9
 *   npm run pdf:sample unicorns candy a4 2 en
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import type { AlbumSize, Lang, NumberSide } from '@album/shared';
import {
  DEFAULT_ALBUM_SIZE,
  DEFAULT_NUMBER_SIDE,
  PAPER_NAME,
  REF_PAGE,
  TEMPLATES,
  artRng,
  coverArtOf,
  coverPalette,
  getTemplate,
  isAlbumSize,
  layoutFor,
  mmToPt,
} from '@album/shared';
import { Panel } from '../pdf/canvas.ts';
import { embedFonts } from '../pdf/fonts.ts';
import { buildCoverPdf, buildPagesPdf, buildStickersPdf } from '../pdf/index.ts';
import { fixtureImageLoader, makeFixtureAlbum } from '../testing/fixtures.ts';

const OUT = fileURLToPath(new URL('../../../../tmp', import.meta.url));
const kb = (b: Uint8Array) => `${Math.round(b.length / 1024)} kB`;

await mkdir(OUT, { recursive: true });

/**
 * A contact sheet of every cover in the app, one to a page.
 *
 * Twenty-odd covers are impossible to judge one at a time, and a set that does
 * not hang together is worse than any single cover being weak.
 */
async function renderCoverSheet(): Promise<void> {
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  let count = 0;

  for (const template of TEMPLATES) {
    for (const variant of template.variants) {
      const page = doc.addPage([mmToPt(REF_PAGE.w), mmToPt(REF_PAGE.h)]);
      const panel = new Panel(page, 0, 0, REF_PAGE.w, REF_PAGE.h);
      const palette = coverPalette(template, variant.id);

      panel.shapes(coverArtOf(template, variant.id)(artRng(template.id, 'cover', variant.id), REF_PAGE));

      // A caption on the plaque's own footprint, so it also shows the quiet
      // zone a real title has to sit in.
      panel.shape({ k: 'rect', x: 16, y: 120, w: REF_PAGE.w - 32, h: 26, rx: 6, fill: palette.plaque, opacity: 0.96 });
      panel.shape({ k: 'rect', x: 16, y: 120, w: REF_PAGE.w - 32, h: 26, rx: 6, stroke: palette.plaqueEdge, sw: 1.1 });
      panel.fitText(`${template.name.en} · ${variant.name.en}`, {
        x: REF_PAGE.w / 2,
        y: 131,
        size: 6,
        minSize: 3,
        maxWidth: REF_PAGE.w - 48,
        font: fonts.displayBold,
        color: palette.plaqueInk,
        align: 'center',
      });
      panel.text(`${template.id} / ${variant.id}${variant.photo ? '  (photo cover)' : ''}`, {
        x: REF_PAGE.w / 2,
        y: 141,
        size: 3.4,
        font: fonts.body,
        color: palette.plaqueInk,
        opacity: 0.7,
        align: 'center',
      });
      count++;
    }
  }

  const bytes = await doc.save();
  await writeFile(path.join(OUT, 'covers.pdf'), bytes);
  console.log(`covers   : ${kb(bytes)}  -> tmp/covers.pdf   (${count} covers)`);
}

if (process.argv[2] === 'covers') {
  await renderCoverSheet();
} else {
  const templateId = process.argv[2] ?? 'football';
  if (!TEMPLATES.some((t) => t.id === templateId)) {
    console.error(`Unknown template "${templateId}". Try: ${TEMPLATES.map((t) => t.id).join(', ')}`);
    process.exit(1);
  }
  const template = getTemplate(templateId);

  const variantId = process.argv[3] ?? template.variants[0]!.id;
  if (!template.variants.some((v) => v.id === variantId)) {
    console.error(`Unknown cover "${variantId}". Try: ${template.variants.map((v) => v.id).join(', ')}`);
    process.exit(1);
  }

  const sizeArg = process.argv[4];
  const size: AlbumSize = isAlbumSize(sizeArg) ? sizeArg : DEFAULT_ALBUM_SIZE;
  const layout = layoutFor(size, Number(process.argv[5]));
  const lang = (process.argv[6] ?? 'sr-Cyrl') as Lang;
  // Where the numbers go is a choice at print time, so the sample takes it the
  // same way the dialog does — by name, from anywhere in the line.
  const numbers: NumberSide = process.argv.includes('sticker') ? 'sticker' : DEFAULT_NUMBER_SIDE;

  const album = makeFixtureAlbum({
    templateId,
    coverVariantId: variantId,
    // A photo cover only means anything if there is a photo behind it.
    coverImageId: template.variants.find((v) => v.id === variantId)?.photo ? 'img-cover' : null,
    size,
    slotsPerPage: layout.slotsPerPage,
    lang,
    pages: 5,
    filled: Math.min(30, 5 * layout.slotsPerPage),
  });
  const loadImage = fixtureImageLoader();

  const started = Date.now();
  const cover = await buildCoverPdf({ album, loadImage, numbers });
  const pages = await buildPagesPdf({ album, loadImage, numbers });
  const stickers = await buildStickersPdf({ album, loadImage, numbers });

  await writeFile(path.join(OUT, 'cover.pdf'), cover);
  await writeFile(path.join(OUT, 'pages.pdf'), pages.bytes);
  await writeFile(path.join(OUT, 'stickers.pdf'), stickers.bytes);

  console.log(`album    : ${templateId} / ${variantId} (${lang})`);
  console.log(`format   : ${PAPER_NAME[size]} sheets, ${layout.page.w} x ${layout.page.h} mm pages, ${layout.slotsPerPage} per page`);
  console.log(`cover    : ${kb(cover)}  -> tmp/cover.pdf`);
  console.log(`pages    : ${kb(pages.bytes)}  -> tmp/pages.pdf   (${pages.fillerCount} filler pages added)`);
  const numbersOn = numbers === 'backing' ? 'numbers on the backing' : 'numbers on the picture';
  console.log(
    `stickers : ${kb(stickers.bytes)}  -> tmp/stickers.pdf   (${stickers.stickerCount} stickers on ${stickers.sheetCount} sheets, ${numbersOn})`,
  );
  console.log(`done in ${Date.now() - started} ms`);
}
