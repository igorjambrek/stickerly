/**
 * The print pipeline: an album in, three PDFs out.
 *
 * Storage is injected as `loadImage` so this module knows nothing about where
 * photos live, which keeps it testable from fixtures.
 */

import { PDFDocument, type PDFImage } from 'pdf-lib';
import type { Album, PrintPart, SheetLayoutName } from '@album/shared';
import {
  coverArtOf,
  coverBackArtOf,
  coverInsideArtOf,
  coverPalette,
  coverWantsPhoto,
  describeAlbumPart,
  filledSlots,
  getTemplate,
  layoutFor,
  renumber,
  translator,
} from '@album/shared';
import { embedFonts } from './fonts.ts';
import type { PrintContext } from './common.ts';
import { renderCover } from './cover.ts';
import { paddingPages, renderPages } from './pages.ts';
import { renderStickers } from './stickers.ts';

export interface PrintInput {
  album: Album;
  /** Print-resolution bytes for an image id, or null if it has gone missing. */
  loadImage: (imageId: string) => Promise<Buffer | null>;
  layout?: SheetLayoutName;
}

const isPng = (b: Buffer) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

const embed = (doc: PDFDocument, bytes: Buffer): Promise<PDFImage> =>
  isPng(bytes) ? doc.embedPng(bytes) : doc.embedJpg(bytes);

/**
 * Prepare a document with fonts and only the images this PDF actually needs.
 * A photo that has gone missing is skipped rather than failing the print.
 */
async function makeContext(
  doc: PDFDocument,
  input: PrintInput,
  part: PrintPart,
  want: { stickerPhotos?: boolean; coverPhoto?: boolean },
): Promise<PrintContext> {
  // Numbering is derived, never trusted from storage.
  const album: Album = { ...input.album, pages: renumber(input.album.pages) };
  const template = getTemplate(album.templateId);
  const fonts = await embedFonts(doc);
  const t = translator(album.lang);
  const images = new Map<string, PDFImage>();

  if (want.stickerPhotos) {
    const ids = [...new Set(filledSlots(album).map((s) => s.imageId!))];
    for (const id of ids) {
      const bytes = await input.loadImage(id);
      if (!bytes) continue;
      images.set(id, await embed(doc, bytes));
    }
  }

  let coverImage: PDFImage | undefined;
  if (want.coverPhoto && album.coverImageId && coverWantsPhoto(template, album.coverVariantId)) {
    const bytes = await input.loadImage(album.coverImageId);
    if (bytes) coverImage = await embed(doc, bytes);
  }

  doc.setTitle(album.title);
  doc.setCreator('Nalepko');
  doc.setProducer('Nalepko');
  // A print shop is handed the file and not the dialog that explained it, so
  // the paper, the sheet count and the duplex setting ride along in the
  // document's own properties, where any PDF viewer will show them.
  doc.setSubject(describeAlbumPart(t, part, album).specLine);

  return {
    album,
    template,
    layout: layoutFor(album.size, album.slotsPerPage),
    palette: template.palette,
    cover: {
      palette: coverPalette(template, album.coverVariantId),
      front: coverArtOf(template, album.coverVariantId),
      back: coverBackArtOf(template, album.coverVariantId),
      inside: coverInsideArtOf(template, album.coverVariantId),
      image: coverImage,
    },
    fonts,
    t,
    images,
  };
}

export async function buildCoverPdf(input: PrintInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx = await makeContext(doc, input, 'cover', { coverPhoto: true });
  renderCover(doc, ctx);
  return doc.save();
}

export interface PagesResult {
  bytes: Uint8Array;
  /** How many blank pages had to be added to complete the fold. */
  fillerCount: number;
}

export async function buildPagesPdf(input: PrintInput): Promise<PagesResult> {
  const doc = await PDFDocument.create();
  const ctx = await makeContext(doc, input, 'pages', { stickerPhotos: true });
  const fillerCount = renderPages(doc, ctx);
  return { bytes: await doc.save(), fillerCount };
}

export interface StickersResult {
  bytes: Uint8Array;
  sheetCount: number;
  stickerCount: number;
}

export async function buildStickersPdf(input: PrintInput): Promise<StickersResult> {
  const doc = await PDFDocument.create();
  const ctx = await makeContext(doc, input, 'stickers', { stickerPhotos: true });
  const sheetCount = renderStickers(doc, ctx, input.layout ?? 'full');
  return { bytes: await doc.save(), sheetCount, stickerCount: filledSlots(ctx.album).length };
}

export { paddingPages };
export type { PrintContext };
