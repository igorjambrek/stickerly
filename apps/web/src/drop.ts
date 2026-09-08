/**
 * Turning a drop into the best picture it can produce.
 *
 * A dropped picture has two possible sources and they are not equally good.
 * The browser hands over a file, which for a drag out of an image search is the
 * thumbnail that search was displaying — a few hundred pixels, fine on glass
 * and a mosaic on paper. The drag *also* carries the link the thumbnail sat
 * inside, and a search engine writes the original's address into that link.
 *
 * So: ask for the original, and keep the file for when that does not work.
 * Which it often will not — a great many sites refuse a request that did not
 * come from a browser on their own page — and that is why the file is never
 * thrown away until a picture is actually in the album.
 *
 * `betterPictureUrl` in `@album/shared` does the reading and has the tests;
 * this module is the half that needs a DataTransfer and a network.
 */

import { betterPictureUrl } from '@album/shared';
import { api } from './api.ts';

export interface DroppedPicture {
  /** The bytes the browser handed over. The fallback, and usually the answer. */
  file: File | null;
  /** A bigger original the drag named, worth one try first. */
  url: string | null;
}

/** Nothing was dropped that we can do anything with. */
export const isEmptyDrop = (dropped: DroppedPicture): boolean => !dropped.file && !dropped.url;

/** Whatever a file input or a camera hands over, said in the same shape. */
export const asDrop = (file: File | null | undefined): DroppedPicture => ({
  file: file ?? null,
  url: null,
});

export function readDrop(transfer: DataTransfer | null | undefined): DroppedPicture {
  if (!transfer) return { file: null, url: null };
  const file = transfer.files?.[0] ?? null;

  let url: string | null = null;
  try {
    url = betterPictureUrl(transfer.getData('text/uri-list'), transfer.getData('text/html')) ?? null;
  } catch {
    // `getData` is only allowed to answer during the drop itself, and some
    // browsers throw rather than return '' outside it. A drop with no address
    // to improve on is an ordinary drop, not a failed one.
    url = null;
  }

  return { file, url };
}

/**
 * Put a dropped picture into the album, at the best resolution it can be had.
 *
 * The order is the whole point: the named original first, the bytes in hand
 * second. A failure of the first is not worth showing anybody — the child asked
 * for a picture, not for a particular way of getting one — so it is swallowed
 * whenever there is a file behind it, and only spoken about when there is not.
 *
 * Callers guard with `isEmptyDrop` first, so by the fallback there is a file.
 */
export async function uploadDrop(
  token: string,
  dropped: DroppedPicture,
  role: 'sticker' | 'cover' = 'sticker',
): Promise<{ id: string; w: number; h: number }> {
  if (dropped.url) {
    try {
      return await api.addDroppedPicture(token, dropped.url, role);
    } catch (error) {
      if (!dropped.file) throw error;
    }
  }
  return api.uploadImage(token, dropped.file!, role);
}
