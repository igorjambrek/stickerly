/**
 * Automatic sticker numbering.
 *
 * The child never types a number. A slot's number is simply its position in
 * reading order across the whole album, so adding a page, deleting a page or
 * dragging a sticker somewhere else renumbers everything for free. Both the
 * server and the editor call this, so the number on screen is always the
 * number that will be printed.
 */

import type { Album, Page, Slot } from './types.ts';

/** Assign 1..N in reading order. Returns new page objects; the input is untouched. */
export function renumber(pages: Page[]): Page[] {
  let next = 1;
  return [...pages]
    .sort((a, b) => a.position - b.position)
    .map((page, pageIndex) => ({
      ...page,
      position: pageIndex,
      slots: [...page.slots]
        .sort((a, b) => a.position - b.position)
        .map((slot, slotIndex) => ({ ...slot, position: slotIndex, number: next++ })),
    }));
}

export const allSlots = (album: Pick<Album, 'pages'>): Slot[] => album.pages.flatMap((p) => p.slots);

/** Only slots holding a photo become printed stickers. */
export const filledSlots = (album: Pick<Album, 'pages'>): Slot[] =>
  allSlots(album).filter((s) => s.imageId !== null);

export const countFilled = (album: Pick<Album, 'pages'>): number => filledSlots(album).length;

export const countEmpty = (album: Pick<Album, 'pages'>): number =>
  allSlots(album).length - countFilled(album);

/** True when every slot number is 1..N with no gaps or repeats. */
export function numbersAreContiguous(pages: Page[]): boolean {
  const numbers = pages.flatMap((p) => p.slots.map((s) => s.number)).sort((a, b) => a - b);
  return numbers.every((v, i) => v === i + 1);
}
