/**
 * The vocabulary a theme is written in.
 *
 * A theme is pure data plus deterministic artwork generators. It never touches
 * SVG or PDF APIs, so the editor preview and the printed page are produced
 * from exactly the same description. This module holds the shape of that
 * description and the few helpers every theme reaches for; the themes
 * themselves live in `templates.ts` and their covers in `covers.ts`.
 */

import type { Rng } from './rng.ts';
import type { Size } from './geometry.ts';
import type { Lang } from './types.ts';
import type { Shape } from './shapes.ts';

export interface Palette {
  /** Front and back cover background. */
  coverBg: string;
  coverAccent: string;
  /** Inside-cover background. */
  insideBg: string;
  /** The opaque plaque the cover title sits on, so artwork never hurts legibility. */
  plaque: string;
  plaqueEdge: string;
  plaqueInk: string;
  /** Album page background and its ink. */
  pageBg: string;
  pageInk: string;
  /** Empty sticker outline on an album page. */
  frame: string;
  /** The auto-numbering badge. */
  badge: string;
  badgeInk: string;
  /** The name strip under each slot. */
  label: string;
}

export type ArtFn = (rng: Rng, size: Size) => Shape[];
export type PageArtFn = (rng: Rng, size: Size, pageNumber: number) => Shape[];

/**
 * One look within a theme.
 *
 * Picking a theme says "football"; picking a variant says which kind of
 * football album this is. A variant repaints the cover and may replace its
 * artwork outright; the album pages keep the theme's own palette, the way a
 * real album has a loud cover and calm pages.
 */
export interface CoverVariant {
  id: string;
  name: Record<Lang, string>;
  emoji: string;
  /** Merged over the theme palette, for the four cover panels only. */
  palette?: Partial<Palette>;
  coverArt?: ArtFn;
  backArt?: ArtFn;
  insideArt?: ArtFn;
  /** True for "my own": the cover is a photo the child uploads. */
  photo?: boolean;
}

export interface Template {
  id: string;
  group: 'action' | 'friends';
  name: Record<Lang, string>;
  emoji: string;
  palette: Palette;
  coverArt: ArtFn;
  backArt: ArtFn;
  insideArt: ArtFn;
  pageArt: PageArtFn;
  /** The first entry is the theme's own cover, and the default. */
  variants: readonly CoverVariant[];
}

/** Scatter `count` motifs across a panel, keeping clear of the edges. */
export function scatter(
  rng: Rng,
  count: number,
  size: Size,
  margin: number,
  make: (x: number, y: number, rng: Rng) => Shape | Shape[],
): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const x = rng.range(margin, size.w - margin);
    const y = rng.range(margin, size.h - margin);
    const made = make(x, y, rng);
    out.push(...(Array.isArray(made) ? made : [made]));
  }
  return out;
}

/**
 * Scatter into a band of the panel only.
 *
 * Covers have two quiet zones — behind the title plaque and behind the sticker
 * count — so most decoration wants to land above or below them rather than
 * everywhere.
 */
export function scatterIn(
  rng: Rng,
  count: number,
  box: { x: number; y: number; w: number; h: number },
  make: (x: number, y: number, rng: Rng) => Shape | Shape[],
): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const made = make(rng.range(box.x, box.x + box.w), rng.range(box.y, box.y + box.h), rng);
    out.push(...(Array.isArray(made) ? made : [made]));
  }
  return out;
}

/** A band of colour across the full width of a panel. */
export const band = (size: Size, y: number, h: number, fill: string, opacity?: number): Shape => ({
  k: 'rect',
  x: 0,
  y,
  w: size.w,
  h,
  fill,
  opacity,
});

export const bg = (size: Size, fill: string): Shape => ({ k: 'rect', x: 0, y: 0, w: size.w, h: size.h, fill });

/** Re-paint a run of shapes, e.g. to fade a motif into the background. */
export const faded = (shapes: Shape[], opacity: number): Shape[] =>
  shapes.map((s) => ({ ...s, opacity: (s.opacity ?? 1) * opacity }));
