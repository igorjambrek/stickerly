/**
 * Photo storage.
 *
 * Uploads are normalised the moment they arrive: rotated upright from their
 * EXIF orientation, stripped of metadata (a phone photo carries GPS
 * coordinates, and this is a children's app), resized to something a printer
 * can use, and re-encoded as JPEG. Nothing downstream has to think about
 * formats or orientation again.
 */

import { mkdir, readFile, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config, imagesDir } from './config.ts';

/** Ids are generated as base64url, so anything else is an attempt at a path. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;

function assertSafe(...ids: string[]): void {
  for (const id of ids) {
    if (!SAFE_ID.test(id)) throw new Error(`unsafe storage id: ${id}`);
  }
}

const albumDir = (albumId: string): string => path.join(imagesDir(), albumId);

export const printPath = (albumId: string, imageId: string): string => {
  assertSafe(albumId, imageId);
  return path.join(albumDir(albumId), `${imageId}.jpg`);
};

export const thumbPath = (albumId: string, imageId: string): string => {
  assertSafe(albumId, imageId);
  return path.join(albumDir(albumId), `${imageId}.thumb.jpg`);
};

/**
 * What an upload is for.
 *
 * A sticker is 50 x 70 mm, so 1400 px is already more than a printer can use.
 * A cover photo has to fill a whole A4 panel, so it gets a bigger derivative —
 * still one file, still stripped and re-encoded the same way.
 */
export type ImageRole = 'sticker' | 'cover';

export interface StoredImage {
  /** Size of the print derivative, which is what the crop maths works against. */
  w: number;
  h: number;
}

export class UnreadableImage extends Error {}

/**
 * Write the print and thumbnail derivatives for one upload.
 * Throws UnreadableImage if the bytes are not a picture we can handle.
 */
export async function storeImage(
  albumId: string,
  imageId: string,
  input: Buffer,
  role: ImageRole = 'sticker',
): Promise<StoredImage> {
  assertSafe(albumId, imageId);
  await mkdir(albumDir(albumId), { recursive: true });

  const base = sharp(input, { failOn: 'none' }).rotate();
  const maxDimension = role === 'cover' ? config.maxCoverDimension : config.maxImageDimension;

  let printed;
  try {
    printed = await base
      .clone()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: config.jpegQuality, mozjpeg: true })
      .toFile(printPath(albumId, imageId));
  } catch (cause) {
    throw new UnreadableImage('not a readable image', { cause });
  }

  await base
    .clone()
    .resize({ width: config.thumbDimension, height: config.thumbDimension, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toFile(thumbPath(albumId, imageId));

  return { w: printed.width, h: printed.height };
}

async function readOrNull(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

/** Print-resolution bytes, or null if the file has gone missing. */
export const readPrintImage = (albumId: string, imageId: string): Promise<Buffer | null> =>
  readOrNull(printPath(albumId, imageId));

export const readThumb = (albumId: string, imageId: string): Promise<Buffer | null> =>
  readOrNull(thumbPath(albumId, imageId));

/** Best-effort cleanup; a leftover file is not worth failing a request over. */
export async function deleteImage(albumId: string, imageId: string): Promise<void> {
  await Promise.allSettled([unlink(printPath(albumId, imageId)), unlink(thumbPath(albumId, imageId))]);
}

/** Deleting the album takes every photo it ever held with it. */
export async function deleteAlbumStorage(albumId: string): Promise<void> {
  assertSafe(albumId);
  await rm(albumDir(albumId), { recursive: true, force: true });
}
