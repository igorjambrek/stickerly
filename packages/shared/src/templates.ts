/**
 * The six album themes.
 *
 * A theme owns its colours, its album-page look and its list of covers. The
 * covers themselves live in `covers.ts`, because there are twenty-odd of them
 * and they are the part a child actually chooses between.
 *
 * Album pages are deliberately quieter than covers: a page is a backdrop for
 * nine photographs and a child's handwriting, so it gets a soft ground, a trim
 * at top and bottom, and one motif in the outer corner. Loud pages make a
 * finished album look worse, not better.
 */

import type { Rng } from './rng.ts';
import { rngFrom } from './rng.ts';
import type { Size } from './geometry.ts';
import type { Shape } from './shapes.ts';
import type { ArtFn, Palette, Template } from './art.ts';
import { faded, scatter } from './art.ts';
import {
  ballShapes,
  footprintShapes,
  heartPath,
  leafPath,
  pawShapes,
  pencilShapes,
  planetShapes,
  sparklePath,
  starPath,
} from './shapes.ts';
import { gradientBands, tint } from './motifs.ts';
import {
  classVariants,
  dinoVariants,
  footballVariants,
  insideArtOf,
  petVariants,
  spaceVariants,
  unicornVariants,
} from './covers.ts';

/**
 * The album page look, shared by every theme so the set stays coherent.
 *
 * `trim` is the coloured rule at the top and bottom of a page; `corner` is one
 * motif tucked into the outer margin, mirrored on facing pages so a spread
 * reads as a spread.
 */
function pageArtFor(
  palette: Palette,
  corner: (x: number, y: number, mirrored: boolean) => Shape[],
  dust?: (rng: Rng, size: Size) => Shape[],
): Template['pageArt'] {
  return (rng, size, pageNumber) => {
    const mirrored = pageNumber % 2 === 0;
    const outerX = mirrored ? 16 : size.w - 16;
    return [
      ...gradientBands({ x: 0, y: 0, w: size.w, h: size.h }, [palette.pageBg, tint(palette.pageBg, 0.35), palette.pageBg], 20),
      { k: 'rect', x: 0, y: 0, w: size.w, h: 5.5, fill: palette.frame },
      { k: 'rect', x: 0, y: 5.5, w: size.w, h: 1.2, fill: palette.badge, opacity: 0.45 },
      { k: 'rect', x: 0, y: size.h - 5.5, w: size.w, h: 5.5, fill: palette.frame },
      { k: 'rect', x: 0, y: size.h - 6.7, w: size.w, h: 1.2, fill: palette.badge, opacity: 0.45 },
      ...(dust ? faded(dust(rng, size), 0.28) : []),
      ...faded(corner(outerX, size.h - 21, mirrored), 0.42),
    ];
  };
}

// ---------------------------------------------------------------------------
// Фудбал / Football
// ---------------------------------------------------------------------------

const footballPalette: Palette = {
  coverBg: '#0B7A3B',
  coverAccent: '#F5C518',
  insideBg: '#F2F8F2',
  plaque: '#FFFFFF',
  plaqueEdge: '#F5C518',
  plaqueInk: '#08472A',
  pageBg: '#F3FAF5',
  pageInk: '#0A5228',
  frame: '#0B7A3B',
  badge: '#0B7A3B',
  badgeInk: '#FFFFFF',
  label: '#0A5228',
};

const football: Template = {
  id: 'football',
  group: 'action',
  name: { 'sr-Cyrl': 'Фудбал', 'sr-Latn': 'Fudbal', en: 'Football', ru: 'Футбол' },
  emoji: '⚽',
  palette: footballPalette,
  coverArt: footballVariants[0]!.coverArt!,
  backArt: footballVariants[0]!.backArt!,
  insideArt: insideArtOf('#0B7A3B', (rng, size) =>
    scatter(rng, 9, size, 30, (x, y, r) => ballShapes(x, y, r.range(5, 8), '#FFFFFF', '#0B7A3B')),
  ),
  pageArt: pageArtFor(
    footballPalette,
    (x, y) => ballShapes(x, y, 7, '#FFFFFF', '#0B7A3B'),
    (rng, size) =>
      scatter(rng, 7, size, 18, (x, y, r) => ({
        k: 'path',
        cmds: starPath(x, y, r.range(2, 3.4), 5, 0.45, r.range(0, 360)),
        fill: '#0B7A3B',
      })),
  ),
  variants: footballVariants,
};

// ---------------------------------------------------------------------------
// Свемир / Space
// ---------------------------------------------------------------------------

const spacePalette: Palette = {
  coverBg: '#141B3D',
  coverAccent: '#FFD166',
  insideBg: '#F4F5FC',
  plaque: '#FFFFFF',
  plaqueEdge: '#FFD166',
  plaqueInk: '#232C63',
  pageBg: '#F6F7FD',
  pageInk: '#2B3573',
  frame: '#4A57A8',
  badge: '#4A57A8',
  badgeInk: '#FFFFFF',
  label: '#2B3573',
};

const space: Template = {
  id: 'space',
  group: 'action',
  name: { 'sr-Cyrl': 'Свемир', 'sr-Latn': 'Svemir', en: 'Space', ru: 'Космос' },
  emoji: '🚀',
  palette: spacePalette,
  coverArt: spaceVariants[0]!.coverArt!,
  backArt: spaceVariants[0]!.backArt!,
  insideArt: insideArtOf('#141B3D', (rng, size) =>
    scatter(rng, 20, size, 30, (x, y, r) => ({
      k: 'path',
      cmds: starPath(x, y, r.range(2, 4), 5, 0.45, r.range(0, 360)),
      fill: '#4A57A8',
    })),
  ),
  pageArt: pageArtFor(
    spacePalette,
    (x, y) => planetShapes(x, y, 7, '#9B7BFF', '#C9BAFF'),
    (rng, size) =>
      scatter(rng, 22, size, 14, (x, y, r) => ({ k: 'circle', cx: x, cy: y, r: r.range(0.5, 1.4), fill: '#4A57A8' })),
  ),
  variants: spaceVariants,
};

// ---------------------------------------------------------------------------
// Диносауруси / Dinosaurs
// ---------------------------------------------------------------------------

const dinoPalette: Palette = {
  coverBg: '#2E7D5B',
  coverAccent: '#E9C46A',
  insideBg: '#FBF4E4',
  plaque: '#FBF4E4',
  plaqueEdge: '#2E7D5B',
  plaqueInk: '#1E5C41',
  pageBg: '#FBF7EC',
  pageInk: '#1E5C41',
  frame: '#2E7D5B',
  badge: '#E07A3F',
  badgeInk: '#FFFFFF',
  label: '#1E5C41',
};

const dinos: Template = {
  id: 'dinos',
  group: 'action',
  name: { 'sr-Cyrl': 'Диносауруси', 'sr-Latn': 'Dinosaurusi', en: 'Dinosaurs', ru: 'Динозавры' },
  emoji: '🦖',
  palette: dinoPalette,
  coverArt: dinoVariants[0]!.coverArt!,
  backArt: dinoVariants[0]!.backArt!,
  insideArt: insideArtOf('#2E7D5B', (rng, size) =>
    scatter(rng, 9, size, 30, (x, y, r) => footprintShapes(x, y, r.range(10, 15), { fill: '#2E7D5B' })),
  ),
  pageArt: pageArtFor(
    dinoPalette,
    (x, y, mirrored) => [
      ...footprintShapes(x, y, 13, { fill: '#2E7D5B' }),
      { k: 'path', cmds: leafPath(x, y - 26, 20, 5.5, mirrored ? -25 : 25), fill: '#2E7D5B', opacity: 0.7 },
    ],
    (rng, size) =>
      scatter(rng, 8, size, 18, (x, y, r) => ({
        k: 'path',
        cmds: leafPath(x, y, r.range(9, 15), r.range(2.5, 4), r.range(0, 360)),
        fill: '#2E7D5B',
      })),
  ),
  variants: dinoVariants,
};

// ---------------------------------------------------------------------------
// Једнорози / Unicorns
// ---------------------------------------------------------------------------

const unicornPalette: Palette = {
  coverBg: '#FCE3F1',
  coverAccent: '#F06CA8',
  insideBg: '#FFF7FB',
  plaque: '#FFFFFF',
  plaqueEdge: '#F06CA8',
  plaqueInk: '#7A2E5C',
  pageBg: '#FFF9FC',
  pageInk: '#7A2E5C',
  frame: '#E78AB8',
  badge: '#F06CA8',
  badgeInk: '#FFFFFF',
  label: '#7A2E5C',
};

const unicorns: Template = {
  id: 'unicorns',
  group: 'friends',
  name: { 'sr-Cyrl': 'Једнорози', 'sr-Latn': 'Jednorozi', en: 'Unicorns', ru: 'Единороги' },
  emoji: '🦄',
  palette: unicornPalette,
  coverArt: unicornVariants[0]!.coverArt!,
  backArt: unicornVariants[0]!.backArt!,
  insideArt: insideArtOf('#F06CA8', (rng, size) =>
    scatter(rng, 14, size, 30, (x, y, r) => ({ k: 'path', cmds: heartPath(x, y, r.range(5, 9)), fill: '#F06CA8' })),
  ),
  pageArt: pageArtFor(
    unicornPalette,
    (x, y) => [{ k: 'path', cmds: heartPath(x, y + 1, 11), fill: '#F06CA8' }],
    (rng, size) =>
      scatter(rng, 12, size, 14, (x, y, r) => ({ k: 'path', cmds: sparklePath(x, y, r.range(1.6, 3)), fill: '#F06CA8' })),
  ),
  variants: unicornVariants,
};

// ---------------------------------------------------------------------------
// Љубимци / Pets
// ---------------------------------------------------------------------------

const petPalette: Palette = {
  coverBg: '#FFEBD6',
  coverAccent: '#F4795B',
  insideBg: '#FFF7EF',
  plaque: '#FFFFFF',
  plaqueEdge: '#F4795B',
  plaqueInk: '#7A3B2E',
  pageBg: '#FFFAF4',
  pageInk: '#7A3B2E',
  frame: '#E3906F',
  badge: '#F4795B',
  badgeInk: '#FFFFFF',
  label: '#7A3B2E',
};

const pets: Template = {
  id: 'pets',
  group: 'friends',
  name: { 'sr-Cyrl': 'Љубимци', 'sr-Latn': 'Ljubimci', en: 'Pets', ru: 'Питомцы' },
  emoji: '🐶',
  palette: petPalette,
  coverArt: petVariants[0]!.coverArt!,
  backArt: petVariants[0]!.backArt!,
  insideArt: insideArtOf('#F4795B', (rng, size) =>
    scatter(rng, 10, size, 30, (x, y, r) => pawShapes(x, y, r.range(11, 16), { fill: '#F4795B' })),
  ),
  pageArt: pageArtFor(
    petPalette,
    (x, y) => pawShapes(x, y + 1, 14, { fill: '#F4795B' }),
    (rng, size) =>
      scatter(rng, 7, size, 16, (x, y, r) => ({ k: 'path', cmds: heartPath(x, y, r.range(3, 5)), fill: '#F4795B' })),
  ),
  variants: petVariants,
};

// ---------------------------------------------------------------------------
// Мој разред / My class
// ---------------------------------------------------------------------------

const CONFETTI = ['#3A86FF', '#FF6B6B', '#FFD166', '#06D6A0', '#B08BFF', '#FF9E6B'];

const classPalette: Palette = {
  coverBg: '#FFFFFF',
  coverAccent: '#3A86FF',
  insideBg: '#F7F9FF',
  plaque: '#FFFFFF',
  plaqueEdge: '#3A86FF',
  plaqueInk: '#22314E',
  pageBg: '#FBFCFF',
  pageInk: '#22314E',
  frame: '#3A86FF',
  badge: '#3A86FF',
  badgeInk: '#FFFFFF',
  label: '#22314E',
};

const myClass: Template = {
  id: 'class',
  group: 'friends',
  name: { 'sr-Cyrl': 'Мој разред', 'sr-Latn': 'Moj razred', en: 'My class', ru: 'Мой класс' },
  emoji: '🎒',
  palette: classPalette,
  coverArt: classVariants[0]!.coverArt!,
  backArt: classVariants[0]!.backArt!,
  insideArt: insideArtOf('#3A86FF', (rng, size) =>
    scatter(rng, 20, size, 30, (x, y, r) => ({ k: 'circle', cx: x, cy: y, r: r.range(1.5, 3), fill: r.pick(CONFETTI) })),
  ),
  pageArt: pageArtFor(
    classPalette,
    (x, y, mirrored) => pencilShapes(x, y + 1, 26, mirrored ? -20 : 20, '#FFD166', '#F0D8B0', '#4A4A4A'),
    (rng, size) =>
      scatter(rng, 16, size, 14, (x, y, r) => ({ k: 'circle', cx: x, cy: y, r: r.range(1.2, 2.6), fill: r.pick(CONFETTI) })),
  ),
  variants: classVariants,
};

// ---------------------------------------------------------------------------

export const TEMPLATES: readonly Template[] = [football, space, dinos, unicorns, pets, myClass];

export const DEFAULT_TEMPLATE_ID = 'football';

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID)!;
}

/** The child's chosen cover, or the theme's own if the id means nothing here. */
export function getVariant(template: Template, variantId: string | null | undefined) {
  return template.variants.find((v) => v.id === variantId) ?? template.variants[0]!;
}

/** The palette the four cover panels are painted with: theme colours, variant on top. */
export function coverPalette(template: Template, variantId: string | null | undefined): Palette {
  return { ...template.palette, ...getVariant(template, variantId).palette };
}

/** A variant may replace any of the cover panels; anything it leaves out comes from the theme. */
export const coverArtOf = (template: Template, variantId: string | null | undefined): ArtFn =>
  getVariant(template, variantId).coverArt ?? template.coverArt;

export const coverBackArtOf = (template: Template, variantId: string | null | undefined): ArtFn =>
  getVariant(template, variantId).backArt ?? template.backArt;

export const coverInsideArtOf = (template: Template, variantId: string | null | undefined): ArtFn =>
  getVariant(template, variantId).insideArt ?? template.insideArt;

/** True when this cover is a photograph rather than drawn artwork. */
export const coverWantsPhoto = (template: Template, variantId: string | null | undefined): boolean =>
  getVariant(template, variantId).photo === true;

/** Seeded so a given panel of a given album always draws the same artwork. */
export const artRng = (templateId: string, panel: string, extra: string | number = ''): Rng =>
  rngFrom(templateId, panel, extra);
