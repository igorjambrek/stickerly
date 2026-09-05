/**
 * Fixture albums and photos.
 *
 * Used by the sample-PDF script and by the tests, so the thing you print on
 * paper is built by the same code the tests assert against.
 */

import sharp from 'sharp';
import type { Album, AlbumSize, Lang, Page, Slot } from '@album/shared';
import { DEFAULT_CROP, DEFAULT_ALBUM_SIZE, getTemplate, layoutFor, renumber } from '@album/shared';

const NAMES = [
  'Марко',
  'Ана',
  'Лука',
  'Мила',
  'Вук',
  'Софија',
  'Петар',
  'Дуња',
  'Никола',
  'Теодора',
  'Стефан',
  'Маша',
  'Филип',
  'Лена',
  'Урош',
  'Ива',
  'Огњен',
  'Хана',
];

export interface FixtureOptions {
  pages?: number;
  /** How many slots, in reading order, get a photo. */
  filled?: number;
  templateId?: string;
  coverVariantId?: string;
  /** Set to give the fixture a photo cover; the loader fabricates the picture. */
  coverImageId?: string | null;
  size?: AlbumSize;
  slotsPerPage?: number;
  lang?: Lang;
  title?: string;
  ownerName?: string;
}

export function makeFixtureAlbum(o: FixtureOptions = {}): Album {
  const pageCount = o.pages ?? 5;
  const filled = o.filled ?? 30;
  const templateId = o.templateId ?? 'football';
  const size = o.size ?? DEFAULT_ALBUM_SIZE;
  const layout = layoutFor(size, o.slotsPerPage);

  let n = 0;
  const pages: Page[] = Array.from({ length: pageCount }, (_, p) => ({
    id: `page-${p}`,
    position: p,
    kind: 'sticker' as const,
    title: p === 0 ? 'Моја екипа' : '',
    slots: Array.from({ length: layout.slotsPerPage }, (_, s): Slot => {
      const index = n++;
      return {
        id: `slot-${index}`,
        pageId: `page-${p}`,
        position: s,
        number: index + 1,
        label: index < filled ? NAMES[index % NAMES.length]! : '',
        imageId: index < filled ? `img-${index}` : null,
        filledBy: null,
        crop: { ...DEFAULT_CROP },
      };
    }),
  }));

  const coverImageId = o.coverImageId ?? null;
  return {
    id: 'fixture',
    title: o.title ?? 'Мој супер албум',
    templateId,
    coverVariantId: o.coverVariantId ?? getTemplate(templateId).variants[0]!.id,
    coverImageId,
    coverCrop: { ...DEFAULT_CROP },
    size,
    slotsPerPage: layout.slotsPerPage,
    lang: o.lang ?? 'sr-Cyrl',
    ownerName: o.ownerName ?? 'Милица',
    createdAt: new Date('2026-01-01').toISOString(),
    updatedAt: new Date('2026-01-01').toISOString(),
    pages: renumber(pages),
    images: [
      ...pages.flatMap((p) => p.slots.filter((s) => s.imageId).map((s) => ({ id: s.imageId!, w: 600, h: 840 }))),
      ...(coverImageId ? [{ id: coverImageId, w: 1400, h: 1980 }] : []),
    ],
    ownerPersonId: null,
    members: [],
  };
}

const PALETTES: [number, number, number][][] = [
  [[255, 107, 107], [255, 209, 102]],
  [[58, 134, 255], [6, 214, 160]],
  [[176, 139, 255], [255, 158, 107]],
  [[11, 122, 59], [245, 197, 24]],
  [[240, 108, 168], [255, 247, 251]],
];

/**
 * A stand-in photo: a two-colour diagonal wash with a bright disc, distinct
 * enough per index that a mis-ordered sticker is obvious on paper.
 */
export async function makeFixturePhoto(index: number, w = 600, h = 840): Promise<Buffer> {
  const [from, to] = PALETTES[index % PALETTES.length]!;
  const raw = Buffer.alloc(w * h * 3);
  const cx = w * 0.5;
  const cy = h * 0.42;
  const r = Math.min(w, h) * 0.28;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2;
      const inDisc = (x - cx) ** 2 + (y - cy) ** 2 < r * r;
      const i = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        const base = from![c]! * (1 - t) + to![c]! * t;
        raw[i + c] = inDisc ? Math.min(255, base * 0.45 + 140) : base;
      }
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 82 }).toBuffer();
}

/** A loader that fabricates photos on demand, matching the PrintInput contract. */
export function fixtureImageLoader(): (id: string) => Promise<Buffer | null> {
  const cache = new Map<string, Buffer>();
  return async (id: string) => {
    if (!cache.has(id)) {
      const index = Number.parseInt(id.replace(/\D+/g, ''), 10) || 0;
      cache.set(id, await makeFixturePhoto(index));
    }
    return cache.get(id)!;
  };
}
