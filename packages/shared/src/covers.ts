/**
 * Every cover in the app.
 *
 * A theme says *what* the album is about; a cover variant says which kind of
 * album this is — the same football theme can be a league, a cup or a photo of
 * the child's own team. Picking one is the second thing a child does, right
 * after picking the theme.
 *
 * All of them are built by `buildCover` from the same four-part composition:
 *
 *   sky      a full-bleed gradient, so no cover is ever a flat colour
 *   wash     big soft shapes — haze, light, weather
 *   texture  small scattered marks that give the paper life up close
 *   ground   a scene along the bottom edge
 *   crest    one bold emblem at the top, the thing you recognise across a room
 *
 * That is also why the set looks like a set: every cover has the same skeleton
 * and only the contents change. The two horizontal bands where the title
 * plaque and the sticker count sit are left deliberately quiet — artwork must
 * never make a title harder to read.
 */

import type { Rng } from './rng.ts';
import type { Size } from './geometry.ts';
import type { PathCmd, Shape } from './shapes.ts';
import type { ArtFn, CoverVariant } from './art.ts';
import { bg, faded, scatterIn } from './art.ts';
import {
  arcPath,
  ballShapes,
  cloudShapes,
  footprintShapes,
  heartPath,
  leafPath,
  pawShapes,
  pencilShapes,
  planetShapes,
  roundedRectPath,
  sparklePath,
  starPath,
  trianglePath,
} from './shapes.ts';
import {
  balloonShapes,
  boneShapes,
  buntingShapes,
  candyShapes,
  checkerBand,
  chequeredFlagShapes,
  colorAt,
  coneShapes,
  crownPath,
  fishShapes,
  flagShapes,
  globeShapes,
  glow,
  glowEllipse,
  gradientBands,
  hillsPath,
  laurelShapes,
  lollipopShapes,
  medalShapes,
  moonShapes,
  mountainsPath,
  shade,
  shieldPath,
  spiralShapes,
  steeringWheelShapes,
  sunburst,
  tint,
  trafficLightShapes,
  trophyShapes,
} from './motifs.ts';
import {
  carShapes,
  catFaceShapes,
  dinoShapes,
  dogFaceShapes,
  palmShapes,
  raceCarShapes,
  rocketShapes,
  rosetteShapes,
  schoolShapes,
  unicornShapes,
  volcanoShapes,
} from './figures.ts';
// ---------------------------------------------------------------------------
// The composition
// ---------------------------------------------------------------------------
export interface CoverRecipe {
  /** Top-to-bottom gradient stops. */
  sky: readonly string[];
  wash?: ArtFn;
  texture?: ArtFn;
  ground?: ArtFn;
  crest?: ArtFn;
}
/** Where the emblem sits, and where the ground scene meets the sky. */
const crestAt = (size: Size) => ({ cx: size.w / 2, cy: size.h * 0.142 });
const horizonOf = (size: Size) => size.h * 0.835;
/** The bands artwork may be bold in, and the whole panel for fine texture. */
const zones = (size: Size) => ({
  top: { x: 8, y: 5, w: size.w - 16, h: size.h * 0.225 },
  bottom: { x: 8, y: size.h * 0.725, w: size.w - 16, h: size.h * 0.25 },
  all: { x: 4, y: 4, w: size.w - 8, h: size.h - 8 },
});
export function buildCover(recipe: CoverRecipe): ArtFn {
  return (rng, size) => {
    const shapes: Shape[] = gradientBands({ x: 0, y: 0, w: size.w, h: size.h }, recipe.sky, 48);
    if (recipe.wash) shapes.push(...recipe.wash(rng, size));
    if (recipe.texture) shapes.push(...recipe.texture(rng, size));
    if (recipe.ground) shapes.push(...recipe.ground(rng, size));
    if (recipe.crest) shapes.push(...recipe.crest(rng, size));
    return shapes;
  };
}
/**
 * The back cover: the same sky and texture, one emblem in the middle, and
 * nothing in the lower two thirds, which is where the "made by" plaque goes.
 */
export function buildBack(recipe: { sky: readonly string[]; texture?: ArtFn; emblem?: ArtFn }): ArtFn {
  return (rng, size) => {
    const shapes: Shape[] = gradientBands({ x: 0, y: 0, w: size.w, h: size.h }, recipe.sky, 48);
    if (recipe.texture) shapes.push(...recipe.texture(rng, size));
    if (recipe.emblem) shapes.push(...recipe.emblem(rng, size));
    return shapes;
  };
}
// ---------------------------------------------------------------------------
// Reusable texture
// ---------------------------------------------------------------------------
const starfield = (count: number, color = '#FFFFFF', maxR = 1.1): ArtFn =>
  (rng, size) =>
    scatterIn(rng, count, zones(size).all, (x, y, r) => ({
      k: 'circle',
      cx: x,
      cy: y,
      r: r.range(0.25, maxR),
      fill: color,
      opacity: r.range(0.25, 0.95),
    }));
const sparkles = (count: number, color: string, box: 'all' | 'top' | 'bottom' = 'all'): ArtFn =>
  (rng, size) =>
    scatterIn(rng, count, zones(size)[box], (x, y, r) => ({
      k: 'path',
      cmds: sparklePath(x, y, r.range(2, 5)),
      fill: color,
      opacity: r.range(0.45, 0.95),
    }));
/** Little marks in both quiet zones, never across the middle of the cover. */
const inBands = (count: number, make: (x: number, y: number, r: Rng) => Shape | Shape[]): ArtFn =>
  (rng, size) => {
    const z = zones(size);
    return [...scatterIn(rng, Math.round(count * 0.45), z.top, make), ...scatterIn(rng, count, z.bottom, make)];
  };
const confetti = (colors: readonly string[], count = 34): ArtFn =>
  inBands(count, (x, y, r) => {
    const s = r.range(1.8, 4.2);
    const fill = r.pick(colors);
    return r.bool(0.5)
      ? { k: 'rect', x, y, w: s * 2, h: s * 0.9, rx: s * 0.3, fill, opacity: 0.85 }
      : { k: 'circle', cx: x, cy: y, r: s * 0.7, fill, opacity: 0.85 };
  });
/** Mown stripes, running up the cover the way a groundsman cuts them. */
const mownStripes = (count: number, opacity = 0.05): ArtFn =>
  (_rng, size) =>
    Array.from({ length: count }, (_, i): Shape | null =>
      i % 2 === 0
        ? { k: 'rect', x: (i * size.w) / count, y: 0, w: size.w / count, h: size.h, fill: '#FFFFFF', opacity }
        : null,
    ).filter((s): s is Shape => s !== null);
/** A pool of light behind the emblem. */
const crestGlow = (color: string, r = 46, strength = 0.24): ArtFn =>
  (_rng, size) => {
    const c = crestAt(size);
    return glow(c.cx, c.cy, r, color, 16, strength);
  };
/** The ground plane, in perspective: wide at the paper's edge, narrow at the horizon. */
const perspectiveFloor = (color: string, opacity: number): ArtFn =>
  (_rng, size) => {
    const y = horizonOf(size);
    return [
      {
        k: 'path',
        cmds: [
          { c: 'M', x: -4, y: size.h + 4 },
          { c: 'L', x: size.w + 4, y: size.h + 4 },
          { c: 'L', x: size.w * 0.76, y },
          { c: 'L', x: size.w * 0.24, y },
          { c: 'Z',
          },
        ],
        fill: color,
        opacity,
      },
    ];
  };
// ---------------------------------------------------------------------------
// Football
// ---------------------------------------------------------------------------
const pitchLines = (ink: string): ArtFn => (_rng, size) => {
  const y = horizonOf(size);
  return [
    { k: 'line', x1: 0, y1: y, x2: size.w, y2: y, stroke: ink, sw: 1.1, opacity: 0.5 },
    { k: 'ellipse', cx: size.w / 2, cy: y, rx: 36, ry: 9, stroke: ink, sw: 1.1, opacity: 0.45 },
    { k: 'circle', cx: size.w / 2, cy: y, r: 1.8, fill: ink, opacity: 0.5 },
    {
      k: 'path',
      cmds: [
        { c: 'M', x: size.w * 0.09, y: size.h },
        { c: 'L', x: size.w * 0.29, y: y + 16 },
        { c: 'L', x: size.w * 0.71, y: y + 16 },
        { c: 'L', x: size.w * 0.91, y: size.h },
      ],
      stroke: ink,
      sw: 1.1,
      opacity: 0.42,
    },
  ];
};
const footballPitch: CoverVariant = {
  id: 'pitch',
  name: { 'sr-Cyrl': 'На терену', 'sr-Latn': 'Na terenu', en: 'On the pitch', ru: 'На поле' },
  emoji: '⚽',
  coverArt: buildCover({
    sky: ['#04331A', '#0B7038', '#0E8C45', '#075E31'],
    wash: (rng, size) => [
      ...mownStripes(9)(rng, size),
      ...glowEllipse(size.w / 2, 22, size.w * 0.66, 74, '#FFFFFF', 16, 0.2),
    ],
    texture: inBands(16, (x, y, r) => ({
      k: 'path',
      cmds: starPath(x, y, r.range(2, 4.4), 5, 0.45, r.range(0, 360)),
      fill: '#F5C518',
      opacity: r.range(0.35, 0.7),
    })),
    ground: (rng, size) => [
      ...perspectiveFloor('#FFFFFF', 0.08)(rng, size),
      ...pitchLines('#FFFFFF')(rng, size),
      ...ballShapes(size.w - 34, size.h - 26, 15, '#FFFFFF', '#08331C'),
    ],
    crest: (rng, size) => {
      const c = crestAt(size);
      return [
        ...crestGlow('#FFFFFF', 44, 0.22)(rng, size),
        ...ballShapes(c.cx, c.cy, 24, '#FFFFFF', '#08331C'),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#04331A', '#0B7038', '#075E31'],
    texture: inBands(14, (x, y, r) => ({
      k: 'path',
      cmds: starPath(x, y, r.range(2, 4), 5, 0.45, r.range(0, 360)),
      fill: '#F5C518',
      opacity: 0.45,
    })),
    emblem: (_rng, size) => ballShapes(size.w / 2, size.h * 0.16, 19, '#FFFFFF', '#08331C'),
  }),
};
/** A winners' podium: three blocks, the centre one tallest, a star atop it. */
const podiumShapes = (
  cx: number,
  baseY: number,
  blockW: number,
  colors: readonly [string, string, string],
  starColor: string,
): Shape[] => {
  const gap = blockW * 0.14;
  const heights: readonly [number, number, number] = [blockW * 1.9, blockW * 2.7, blockW * 1.3];
  const xs: readonly [number, number, number] = [cx - blockW * 1.5 - gap, cx - blockW / 2, cx + blockW / 2 + gap];
  const out: Shape[] = [];
  for (let i = 0; i < 3; i++) {
    const h = heights[i]!;
    const x = xs[i]!;
    out.push(
      { k: 'rect', x, y: baseY - h, w: blockW, h, fill: colors[i]! },
      { k: 'rect', x, y: baseY - h, w: blockW, h: blockW * 0.18, fill: '#FFFFFF', opacity: 0.3 },
    );
  }
  out.push({
    k: 'path',
    cmds: starPath(xs[1]! + blockW / 2, baseY - heights[1]! - blockW * 0.55, blockW * 0.5, 5, 0.45, -90),
    fill: starColor,
  });
  return out;
};
const footballChampions: CoverVariant = {
  id: 'champions',
  name: { 'sr-Cyrl': 'Лига шампиона', 'sr-Latn': 'Liga šampiona', en: 'Champions', ru: 'Лига чемпионов' },
  emoji: '⭐',
  palette: {
    coverBg: '#0A1746',
    coverAccent: '#C9D6F2',
    plaque: '#FFFFFF',
    plaqueEdge: '#C9D6F2',
    plaqueInk: '#0A1746',
  },
  coverArt: buildCover({
    sky: ['#04081F', '#111F5E', '#1B2F86', '#070E33'],
    wash: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...sunburst(c.cx, c.cy, size.h * 0.62, 18, { fill: '#3252C4', opacity: 0.13 }),
        ...glowEllipse(c.cx, c.cy, size.w * 0.5, 66, '#4E74E8', 16, 0.4),
      ];
    },
    texture: starfield(80),
    ground: (_rng, size) => [
      { k: 'rect', x: 0, y: size.h - 34, w: size.w, h: 34, fill: '#050B26', opacity: 0.75 },
      { k: 'rect', x: 0, y: size.h - 34, w: size.w, h: 1.4, fill: '#C9D6F2', opacity: 0.85 },
      { k: 'path', cmds: arcPath(size.w / 2, size.h - 6, 66), stroke: '#C9D6F2', sw: 0.8, opacity: 0.4 },
      { k: 'path', cmds: arcPath(size.w / 2, size.h - 6, 50), stroke: '#C9D6F2', sw: 0.8, opacity: 0.25 },
      // The medal ceremony: a winners' podium under the stage lights.
      ...podiumShapes(size.w / 2, size.h - 6, 10, ['#93A6D9', '#F5D060', '#5E75BA'], '#FFFFFF'),
    ],
    crest: (_rng, size) => {
      const c = crestAt(size);
      const out: Shape[] = [];
      out.push(...glow(c.cx, c.cy, 42, '#4E74E8', 14, 0.3));
      // A ring of stars, the way a continental competition marks itself.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        out.push({
          k: 'path',
          cmds: starPath(c.cx + Math.cos(a) * 34, c.cy + Math.sin(a) * 34, i % 2 ? 2.6 : 3.8, 5, 0.45, -90),
          fill: '#FFFFFF',
          opacity: 0.92,
        });
      }
      // A laurelled medallion, with the trophy itself at its heart.
      out.push(...laurelShapes(c.cx, c.cy + 4, 23, '#C9D6F2'));
      out.push(
        { k: 'circle', cx: c.cx, cy: c.cy, r: 22, fill: '#0A1746' },
        { k: 'circle', cx: c.cx, cy: c.cy, r: 22, stroke: '#C9D6F2', sw: 1.6 },
        { k: 'circle', cx: c.cx, cy: c.cy, r: 18.6, stroke: '#C9D6F2', sw: 0.6, opacity: 0.55 },
      );
      out.push(...trophyShapes(c.cx, c.cy + 3, 24, '#F5D060', '#8A6300'));
      return out;
    },
  }),
  backArt: buildBack({
    sky: ['#04081F', '#111F5E', '#070E33'],
    texture: starfield(60),
    emblem: (_rng, size) => [
      ...laurelShapes(size.w / 2, size.h * 0.19, 18, '#C9D6F2'),
      ...trophyShapes(size.w / 2, size.h * 0.19, 22, '#F5D060', '#8A6300'),
    ],
  }),
};
const footballPremier: CoverVariant = {
  id: 'premier',
  name: { 'sr-Cyrl': 'Премијер лига', 'sr-Latn': 'Premijer liga', en: 'Premier', ru: 'Премьер-лига' },
  emoji: '👑',
  palette: {
    coverBg: '#380A44',
    coverAccent: '#3DDC97',
    plaque: '#FFFFFF',
    plaqueEdge: '#3DDC97',
    plaqueInk: '#380A44',
  },
  coverArt: buildCover({
    sky: ['#25062E', '#4A0F57', '#2E0838'],
    wash: (rng, size) => [
      ...mownStripes(9, 0.045)(rng, size),
      ...glowEllipse(size.w / 2, crestAt(size).cy, size.w * 0.46, 58, '#3DDC97', 14, 0.24),
    ],
    texture: sparkles(14, '#3DDC97'),
    ground: (rng, size) => [
      ...perspectiveFloor('#3DDC97', 0.07)(rng, size),
      ...pitchLines('#3DDC97')(rng, size),
      ...ballShapes(size.w - 34, size.h - 26, 15, '#FFFFFF', '#380A44'),
    ],
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...glow(c.cx, c.cy + 6, 34, '#3DDC97', 12, 0.22),
        // Laurel branches frame the shield, the way a federation crest is bordered.
        ...laurelShapes(c.cx, c.cy + 25, 34, '#3DDC97'),
        { k: 'path', cmds: shieldPath(c.cx, c.cy + 6, 52, 56), fill: '#FFFFFF' },
        { k: 'path', cmds: shieldPath(c.cx, c.cy + 6, 52, 56), stroke: '#3DDC97', sw: 2 },
        ...ballShapes(c.cx, c.cy + 8, 15, '#FFFFFF', '#380A44'),
        { k: 'path', cmds: crownPath(c.cx, c.cy - 28, 40, 23), fill: '#3DDC97' },
        { k: 'path', cmds: crownPath(c.cx, c.cy - 28, 40, 23), stroke: '#FFFFFF', sw: 1 },
        ...[-1, 0, 1].map((d): Shape => ({
          k: 'circle',
          cx: c.cx + d * 14,
          cy: c.cy - 37 + Math.abs(d) * 4.4,
          r: 3.2,
          fill: '#FFFFFF',
        })),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#25062E', '#4A0F57', '#2E0838'],
    texture: sparkles(16, '#3DDC97'),
    emblem: (_rng, size) => [
      { k: 'path', cmds: shieldPath(size.w / 2, size.h * 0.22, 32, 34), fill: '#3DDC97', opacity: 0.16 },
      { k: 'path', cmds: crownPath(size.w / 2, size.h * 0.15, 36, 20), fill: '#3DDC97' },
    ],
  }),
};
const footballWorldCup: CoverVariant = {
  id: 'worldcup',
  name: { 'sr-Cyrl': 'Светско првенство', 'sr-Latn': 'Svetsko prvenstvo', en: 'World Cup', ru: 'Чемпионат мира' },
  emoji: '🏆',
  palette: {
    coverBg: '#0E2E52',
    coverAccent: '#F2B705',
    plaque: '#FFF9EA',
    plaqueEdge: '#F2B705',
    plaqueInk: '#0E2E52',
  },
  coverArt: buildCover({
    sky: ['#08203C', '#164B7D', '#0B2A4C'],
    wash: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...sunburst(c.cx, c.cy, size.h * 0.7, 22, { fill: '#F2B705', opacity: 0.08 }),
        ...glow(c.cx, c.cy, 44, '#F2B705', 14, 0.22),
      ];
    },
    texture: confetti(['#F2B705', '#FFFFFF', '#6FC3E8', '#EF6A5A'], 30),
    ground: (rng, size) => [
      ...buntingShapes(6, size.h * 0.735, size.w - 6, size.h * 0.735, 10, 9, ['#F2B705', '#FFFFFF', '#EF6A5A', '#6FC3E8'], '#FFFFFF'),
      { k: 'rect', x: 0, y: size.h - 30, w: size.w, h: 30, fill: '#08203C', opacity: 0.6 },
      ...glow(size.w / 2, size.h - 32, 30, '#F2B705', 12, 0.32),
      ...trophyShapes(size.w / 2, size.h - 34, 54, '#F5D060', '#8A6300'),
      ...sparkles(6, '#FFFFFF', 'bottom')(rng, size),
    ],
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...glow(c.cx, c.cy, 40, '#F2B705', 12, 0.26),
        // A laurelled world, ringed with stars — the way a world championship marks itself.
        ...laurelShapes(c.cx, c.cy + 2, 31, '#F2B705'),
        ...globeShapes(c.cx, c.cy, 24, '#2E86C1', '#7BD389'),
        { k: 'circle', cx: c.cx, cy: c.cy, r: 28, stroke: '#F2B705', sw: 1.8 },
        ...Array.from({ length: 8 }, (_, i): Shape => {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          return { k: 'path', cmds: starPath(c.cx + Math.cos(a) * 35, c.cy + Math.sin(a) * 35, 3.2, 5, 0.45, -90), fill: '#F2B705' };
        }),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#08203C', '#164B7D', '#0B2A4C'],
    texture: confetti(['#F2B705', '#FFFFFF', '#6FC3E8'], 26),
    emblem: (_rng, size) => [
      ...laurelShapes(size.w / 2, size.h * 0.17, 21, '#F2B705'),
      ...globeShapes(size.w / 2, size.h * 0.17, 20, '#2E86C1', '#7BD389'),
    ],
  }),
};
const footballMyLeague: CoverVariant = {
  id: 'myleague',
  name: { 'sr-Cyrl': 'Моја лига', 'sr-Latn': 'Moja liga', en: 'My league', ru: 'Моя лига' },
  emoji: '📷',
  photo: true,
  palette: { coverBg: '#08331C', coverAccent: '#F5C518', plaque: '#FFFFFF', plaqueEdge: '#F5C518', plaqueInk: '#08331C' },
};
export const footballVariants: readonly CoverVariant[] = [
  footballPitch,
  footballChampions,
  footballPremier,
  footballWorldCup,
  footballMyLeague,
];
// ---------------------------------------------------------------------------
// Space
// ---------------------------------------------------------------------------
const spaceRocket: CoverVariant = {
  id: 'rocket',
  name: { 'sr-Cyrl': 'Ракета', 'sr-Latn': 'Raketa', en: 'Rocket', ru: 'Ракета' },
  emoji: '🚀',
  coverArt: buildCover({
    sky: ['#04061C', '#141C4E', '#2C1A5C', '#0A0D2C'],
    wash: (_rng, size) => [
      ...glowEllipse(size.w * 0.74, size.h * 0.2, 74, 48, '#5B3AA8', 14, 0.55),
      ...glowEllipse(size.w * 0.22, size.h * 0.78, 66, 44, '#23347F', 14, 0.5),
    ],
    texture: (rng, size) => [...starfield(96)(rng, size), ...sparkles(9, '#FFD166')(rng, size)],
    ground: (_rng, size) => [
      // A planet the album is flying over: a huge disc mostly off the page.
      { k: 'circle', cx: size.w / 2, cy: size.h + 128, r: 176, fill: '#3B2A6B' },
      { k: 'circle', cx: size.w / 2, cy: size.h + 128, r: 176, stroke: '#7C63C8', sw: 1.2, opacity: 0.7 },
      { k: 'ellipse', cx: size.w * 0.3, cy: size.h - 26, rx: 15, ry: 5, fill: '#2C1F52', opacity: 0.8 },
      { k: 'ellipse', cx: size.w * 0.66, cy: size.h - 14, rx: 20, ry: 6, fill: '#2C1F52', opacity: 0.7 },
      ...planetShapes(size.w - 30, size.h * 0.775, 13, '#5BC8FF', '#BFE9FF'),
    ],
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...glow(c.cx, c.cy + 6, 40, '#FFD166', 14, 0.18),
        ...rocketShapes(c.cx, c.cy, 56, '#FFFFFF', '#5BC8FF', '#FF5C5C', ['#FF8A3D', '#FFD166']),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#04061C', '#141C4E', '#0A0D2C'],
    texture: starfield(70),
    emblem: (_rng, size) => planetShapes(size.w / 2, size.h * 0.16, 18, '#9B7BFF', '#D9CCFF'),
  }),
};
const spaceGalaxy: CoverVariant = {
  id: 'galaxy',
  name: { 'sr-Cyrl': 'Галаксија', 'sr-Latn': 'Galaksija', en: 'Galaxy', ru: 'Галактика' },
  emoji: '🌌',
  palette: { coverBg: '#150735', coverAccent: '#FF7AC6', plaque: '#FFFFFF', plaqueEdge: '#FF7AC6', plaqueInk: '#2B1055' },
  coverArt: buildCover({
    sky: ['#03040F', '#1E0B44', '#43105E', '#0C0620'],
    wash: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...glowEllipse(c.cx, c.cy, 78, 46, '#8A2BBE', 16, 0.6),
        ...glowEllipse(size.w * 0.2, size.h * 0.82, 60, 40, '#C0357A', 14, 0.4),
      ];
    },
    texture: (rng, size) => [...starfield(120)(rng, size), ...sparkles(10, '#FF7AC6')(rng, size)],
    ground: (_rng, size) => [
      // A comet, drawn as a fading tail and a bright head.
      ...Array.from({ length: 22 }, (_, i): Shape => ({
        k: 'circle',
        cx: size.w * 0.1 + i * 3.9,
        cy: size.h * 0.93 - i * 1.35,
        r: 0.5 + i * 0.13,
        fill: '#FFFFFF',
        opacity: 0.1 + i * 0.035,
      })),
      { k: 'circle', cx: size.w * 0.1 + 22 * 3.9, cy: size.h * 0.93 - 22 * 1.35, r: 4.2, fill: '#FFFFFF' },
      ...glow(size.w * 0.1 + 22 * 3.9, size.h * 0.93 - 22 * 1.35, 12, '#FF7AC6', 10, 0.55),
      ...planetShapes(size.w * 0.22, size.h * 0.775, 11, '#FF8A5B', '#FFD166'),
    ],
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...spiralShapes(c.cx, c.cy, 36, 2, 26, { fill: '#FFFFFF', opacity: 0.9 }),
        ...spiralShapes(c.cx, c.cy, 33, 2, 20, { fill: '#FF7AC6', opacity: 0.75 }),
        ...glow(c.cx, c.cy, 15, '#FFF3C4', 12, 0.85),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#03040F', '#1E0B44', '#0C0620'],
    texture: starfield(80),
    emblem: (_rng, size) => [
      ...spiralShapes(size.w / 2, size.h * 0.16, 32, 2, 20, { fill: '#FFFFFF', opacity: 0.85 }),
      ...glow(size.w / 2, size.h * 0.16, 11, '#FFF3C4', 10, 0.8),
    ],
  }),
};
const spaceMoon: CoverVariant = {
  id: 'moon',
  name: { 'sr-Cyrl': 'Месец', 'sr-Latn': 'Mesec', en: 'The Moon', ru: 'Луна' },
  emoji: '🌕',
  palette: { coverBg: '#070C1C', coverAccent: '#E6E9F2', plaque: '#FFFFFF', plaqueEdge: '#E6E9F2', plaqueInk: '#131A33' },
  coverArt: buildCover({
    sky: ['#02040E', '#0A1230', '#131F45'],
    texture: starfield(110),
    ground: (_rng, size) => {
      const surfaceY = size.h * 0.8;
      const out: Shape[] = [
        { k: 'circle', cx: size.w / 2, cy: surfaceY + 150, r: 168, fill: '#C9CBD1' },
        { k: 'circle', cx: size.w / 2, cy: surfaceY + 150, r: 168, stroke: '#9EA2AC', sw: 1 },
      ];
      for (const [dx, dy, r] of [[-0.3, 0.05, 9], [0.24, 0.12, 12], [0.02, 0.2, 7], [-0.38, 0.24, 6], [0.42, 0.05, 5]] as const) {
        out.push({ k: 'ellipse', cx: size.w * (0.5 + dx), cy: surfaceY + size.h * dy, rx: r, ry: r * 0.4, fill: '#AFB3BC' });
      }
      out.push(
        ...flagShapes(size.w * 0.72, surfaceY + 12, 34, '#8E939E', '#E24B4B'),
        ...footprintShapes(size.w * 0.3, surfaceY + 22, 11, { fill: '#AFB3BC' }),
        ...footprintShapes(size.w * 0.38, surfaceY + 32, 11, { fill: '#AFB3BC' }),
      );
      return out;
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...glow(c.cx, c.cy, 40, '#4E86D6', 14, 0.3),
        ...globeShapes(c.cx, c.cy, 25, '#2E6FC1', '#6FCB8E'),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#02040E', '#0A1230', '#131F45'],
    texture: starfield(80),
    emblem: (_rng, size) => moonShapes(size.w / 2, size.h * 0.16, 20, '#C9CBD1', '#AFB3BC'),
  }),
};
const spaceMyCrew: CoverVariant = {
  id: 'mycrew',
  name: { 'sr-Cyrl': 'Моја посада', 'sr-Latn': 'Moja posada', en: 'My crew', ru: 'Мой экипаж' },
  emoji: '📷',
  photo: true,
  palette: { coverBg: '#101736', coverAccent: '#FFD166', plaque: '#FFFFFF', plaqueEdge: '#FFD166', plaqueInk: '#1B2352' },
};
export const spaceVariants: readonly CoverVariant[] = [spaceRocket, spaceGalaxy, spaceMoon, spaceMyCrew];
// ---------------------------------------------------------------------------
// Dinosaurs
// ---------------------------------------------------------------------------
const dinosJungle: CoverVariant = {
  id: 'jungle',
  name: { 'sr-Cyrl': 'Прашума', 'sr-Latn': 'Prašuma', en: 'Jungle', ru: 'Джунгли' },
  emoji: '🌴',
  coverArt: buildCover({
    sky: ['#0C3728', '#2E7D5B', '#63B48C', '#A9DCBE'],
    wash: (_rng, size) => [
      ...glow(size.w * 0.5, size.h * 0.15, 62, '#F6E7A8', 16, 0.5),
      { k: 'path', cmds: hillsPath(-10, size.w + 10, size.h * 0.79, [size.h * 0.66, size.h * 0.71, size.h * 0.63]), fill: '#1E5C41', opacity: 0.55 },
    ],
    texture: inBands(12, (x, y, r) => ({
      k: 'path',
      cmds: leafPath(x, y, r.range(11, 19), r.range(3.5, 5.5), r.range(0, 360)),
      fill: '#0F4430',
      opacity: r.range(0.16, 0.32),
    })),
    ground: (_rng, size) => {
      const groundY = size.h * 0.835;
      return [
        { k: 'rect', x: 0, y: groundY, w: size.w, h: size.h - groundY, fill: '#E3CFA0' },
        { k: 'rect', x: 0, y: groundY, w: size.w, h: 2.6, fill: '#C0A87A' },
        ...palmShapes(size.w * 0.12, groundY + 6, 62, '#7A5B33', '#1E5C41', -9),
        ...palmShapes(size.w * 0.9, groundY + 4, 50, '#7A5B33', '#25654A', 7),
        ...dinoShapes(size.w * 0.54, size.h - 30, 46, '#2E7D5B', '#1A4A34'),
        ...footprintShapes(size.w * 0.2, size.h - 12, 13, { fill: '#B99C6B' }),
        ...footprintShapes(size.w * 0.31, size.h - 20, 12, { fill: '#B99C6B', opacity: 0.8 }),
      ];
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        { k: 'circle', cx: c.cx, cy: c.cy, r: 27, fill: '#F6E7A8' },
        { k: 'circle', cx: c.cx, cy: c.cy, r: 31, stroke: '#F6E7A8', sw: 1.4, opacity: 0.6 },
        ...dinoShapes(c.cx, c.cy + 4, 34, '#1E5C41', '#123D2C'),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#0C3728', '#2E7D5B', '#1E5C41'],
    texture: inBands(14, (x, y, r) => ({
      k: 'path',
      cmds: leafPath(x, y, r.range(14, 24), r.range(4, 6), r.range(0, 360)),
      fill: '#0F4430',
      opacity: 0.35,
    })),
    emblem: (_rng, size) => footprintShapes(size.w / 2, size.h * 0.17, 26, { fill: '#E3CFA0' }),
  }),
};
const dinosVolcano: CoverVariant = {
  id: 'volcano',
  name: { 'sr-Cyrl': 'Вулкан', 'sr-Latn': 'Vulkan', en: 'Volcano', ru: 'Вулкан' },
  emoji: '🌋',
  palette: { coverBg: '#3A1010', coverAccent: '#FF8A3D', plaque: '#FFF3E6', plaqueEdge: '#FF8A3D', plaqueInk: '#4A1410' },
  coverArt: buildCover({
    sky: ['#180509', '#4A1218', '#8E2A18', '#D9542A'],
    wash: (_rng, size) => [
      ...glowEllipse(size.w / 2, size.h * 0.8, size.w * 0.6, 74, '#FF7A2F', 16, 0.55),
      ...glow(size.w * 0.5, size.h * 0.15, 48, '#FFC46B', 14, 0.3),
    ],
    texture: inBands(30, (x, y, r) => ({
      k: 'circle',
      cx: x,
      cy: y,
      r: r.range(0.4, 1.5),
      fill: r.bool(0.6) ? '#FFB347' : '#FF6B3D',
      opacity: r.range(0.3, 0.9),
    })),
    ground: (_rng, size) => {
      const groundY = size.h * 0.9;
      return [
        { k: 'path', cmds: mountainsPath(-10, size.w + 10, groundY, [size.h * 0.78, size.h * 0.72, size.h * 0.8]), fill: '#2A0C0E' },
        ...volcanoShapes(size.w * 0.5, groundY, 52, '#38100F', '#FF6B2C'),
        { k: 'rect', x: 0, y: groundY, w: size.w, h: size.h - groundY, fill: '#1C0708' },
        { k: 'rect', x: 0, y: groundY, w: size.w, h: 1.6, fill: '#FF6B2C', opacity: 0.6 },
        ...footprintShapes(size.w * 0.16, size.h - 10, 12, { fill: '#FF8A3D', opacity: 0.4 }),
        ...footprintShapes(size.w * 0.85, size.h - 14, 12, { fill: '#FF8A3D', opacity: 0.3 }),
      ];
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...glow(c.cx, c.cy, 40, '#FFB347', 14, 0.4),
        { k: 'circle', cx: c.cx, cy: c.cy, r: 26, fill: '#FFC46B' },
        ...dinoShapes(c.cx, c.cy + 4, 36, '#2A0C0E', '#180509'),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#180509', '#4A1218', '#2A0C0E'],
    texture: inBands(24, (x, y, r) => ({ k: 'circle', cx: x, cy: y, r: r.range(0.4, 1.4), fill: '#FFB347', opacity: r.range(0.2, 0.7) })),
    emblem: (_rng, size) => volcanoShapes(size.w / 2, size.h * 0.22, 38, '#38100F', '#FF6B2C'),
  }),
};
const dinosFossils: CoverVariant = {
  id: 'fossils',
  name: { 'sr-Cyrl': 'Ископине', 'sr-Latn': 'Iskopine', en: 'Fossils', ru: 'Окаменелости' },
  emoji: '🦴',
  palette: { coverBg: '#E3CFA0', coverAccent: '#8B6B3D', plaque: '#FFFBF0', plaqueEdge: '#8B6B3D', plaqueInk: '#4E3A1E' },
  coverArt: buildCover({
    sky: ['#F6ECD4', '#E8D6AC', '#D6BE8E', '#C0A472'],
    wash: (_rng, size) =>
      // Strata: the deeper you dig, the older the layer.
      [0.42, 0.58, 0.71, 0.84].map((t, i): Shape => ({
        k: 'rect',
        x: 0,
        y: size.h * t,
        w: size.w,
        h: 1.6 + i * 0.5,
        fill: '#A98C5C',
        opacity: 0.35,
      })),
    texture: inBands(26, (x, y, r) => ({
      k: 'circle',
      cx: x,
      cy: y,
      r: r.range(0.5, 1.8),
      fill: '#8B6B3D',
      opacity: r.range(0.12, 0.3),
    })),
    ground: (_rng, size) => [
      { k: 'rect', x: 0, y: size.h * 0.84, w: size.w, h: size.h * 0.16, fill: '#B99C6B', opacity: 0.55 },
      ...boneShapes(size.w * 0.24, size.h * 0.9, 46, -16, { fill: '#FFFBF0' }),
      ...boneShapes(size.w * 0.72, size.h * 0.955, 38, 12, { fill: '#FFFBF0', opacity: 0.9 }),
      ...footprintShapes(size.w * 0.5, size.h * 0.885, 17, { fill: '#8B6B3D', opacity: 0.45 }),
      ...footprintShapes(size.w * 0.9, size.h * 0.87, 13, { fill: '#8B6B3D', opacity: 0.3 }),
    ],
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        { k: 'circle', cx: c.cx, cy: c.cy, r: 30, fill: '#FFFBF0', opacity: 0.92 },
        ...boneShapes(c.cx, c.cy, 58, 36, { fill: '#5A4322' }),
        ...boneShapes(c.cx, c.cy, 58, -36, { fill: '#5A4322' }),
        { k: 'circle', cx: c.cx, cy: c.cy, r: 32, stroke: '#5A4322', sw: 1.6, dash: [3.4, 2.6], opacity: 0.85 },
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#F6ECD4', '#E8D6AC', '#C0A472'],
    texture: inBands(20, (x, y, r) => ({ k: 'circle', cx: x, cy: y, r: r.range(0.6, 2), fill: '#8B6B3D', opacity: 0.18 })),
    emblem: (_rng, size) => [
      ...boneShapes(size.w / 2, size.h * 0.17, 46, 30, { fill: '#FFFBF0' }),
      ...boneShapes(size.w / 2, size.h * 0.17, 46, -30, { fill: '#FFFBF0' }),
    ],
  }),
};
const dinosMyDino: CoverVariant = {
  id: 'mydino',
  name: { 'sr-Cyrl': 'Мој диносаурус', 'sr-Latn': 'Moj dinosaurus', en: 'My dinosaur', ru: 'Мой динозавр' },
  emoji: '📷',
  photo: true,
  palette: { coverBg: '#1E5C41', coverAccent: '#E9C46A', plaque: '#FBF4E4', plaqueEdge: '#E9C46A', plaqueInk: '#1E5C41' },
};
export const dinoVariants: readonly CoverVariant[] = [dinosJungle, dinosVolcano, dinosFossils, dinosMyDino];
// ---------------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------------
/** Streaks of motion, the way a comic book says "fast". */
const speedLines = (count: number, color: string, maxOpacity = 0.14): ArtFn =>
  inBands(count, (x, y, r) => {
    const len = r.range(10, 40);
    return {
      k: 'path',
      cmds: roundedRectPath(x - len / 2, y, len, r.range(0.6, 1.4), 0.7),
      fill: color,
      opacity: r.range(0.04, maxOpacity),
    };
  });
/** Four squares of a chequered flag, small enough to pass for paper texture. */
const chequerMark = (x: number, y: number, s: number, opacity = 0.75): Shape[] => [
  { k: 'rect', x, y, w: s, h: s, fill: '#FFFFFF', opacity },
  { k: 'rect', x: x + s, y, w: s, h: s, fill: '#1B1F26', opacity },
  { k: 'rect', x, y: y + s, w: s, h: s, fill: '#1B1F26', opacity },
  { k: 'rect', x: x + s, y: y + s, w: s, h: s, fill: '#FFFFFF', opacity },
];
/** A stack of worn tyres, the kind that lines a circuit. */
const tyreStack = (cx: number, baseY: number, r: number, count: number): Shape[] => {
  const out: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const cy = baseY - r * 0.55 - i * r * 0.95;
    out.push(
      { k: 'ellipse', cx, cy, rx: r, ry: r * 0.55, fill: '#1B1F26' },
      { k: 'ellipse', cx, cy: cy - r * 0.08, rx: r * 0.44, ry: r * 0.22, fill: '#40464F' },
    );
  }
  return out;
};
/**
 * One puff of dust, as a single path: overlapping translucent circles would
 * show every seam where they cross, and a dust cloud has no seams.
 */
const dustPuff = (x: number, y: number, w: number, h: number, fill: string, opacity: number): Shape => {
  const lobes = 4;
  const step = w / lobes;
  // Tallest where it leaves the wheels, thinning out behind the car.
  const peak = (i: number) => h * (0.55 + (i / (lobes - 1)) * 0.85 + (i % 2) * 0.18);
  const cmds: PathCmd[] = [{ c: 'M', x, y }];
  for (let i = 0; i < lobes; i++) {
    const x0 = x + i * step;
    const x1 = x0 + step;
    const top = y - peak(i);
    // Valleys stay high, so the lobes read as one billow rather than as hills.
    const end = i === lobes - 1 ? y : y - Math.min(peak(i), peak(i + 1)) * 0.62;
    cmds.push(
      { c: 'Q', x1: x0, y1: top, x: x0 + step * 0.5, y: top },
      { c: 'Q', x1: x1, y1: top, x: x1, y: end },
    );
  }
  cmds.push({ c: 'Z' });
  return { k: 'path', cmds, fill, opacity };
};
const carsRace: CoverVariant = {
  id: 'race',
  name: { 'sr-Cyrl': 'Трка', 'sr-Latn': 'Trka', en: 'Race day', ru: 'Гонка' },
  emoji: '🏁',
  coverArt: buildCover({
    sky: ['#1B0710', '#5E101F', '#A8182B', '#3C0912'],
    wash: (rng, size) => {
      const c = crestAt(size);
      return [
        ...sunburst(c.cx, c.cy, size.h * 0.66, 20, { fill: '#F2C230', opacity: 0.07 }),
        ...glowEllipse(c.cx, c.cy + 4, size.w * 0.5, 62, '#F2C230', 16, 0.22),
        ...speedLines(15, '#FFFFFF')(rng, size),
      ];
    },
    texture: inBands(9, (x, y, r) => chequerMark(x, y, r.range(1.6, 2.6), 0.85)),
    ground: (rng, size) => {
      const y = horizonOf(size);
      return [
        // Beyond the track: the dark of a circuit under floodlights.
        { k: 'rect', x: 0, y: y - 16, w: size.w, h: size.h - y + 16, fill: '#20101A' },
        ...checkerBand({ x: 0, y: y - 14, w: size.w, h: 7 }, 7, '#F2F4F8', '#1B1F26'),
        { k: 'rect', x: 0, y: y - 7, w: size.w, h: 2, fill: '#C21F30' },
        ...perspectiveFloor('#343A47', 1)(rng, size),
        { k: 'line', x1: size.w * 0.24, y1: y, x2: -4, y2: size.h + 4, stroke: '#F2F4F8', sw: 1, opacity: 0.45 },
        { k: 'line', x1: size.w * 0.76, y1: y, x2: size.w + 4, y2: size.h + 4, stroke: '#F2F4F8', sw: 1, opacity: 0.45 },
        ...tyreStack(size.w * 0.11, y + 9, 7, 3),
        ...tyreStack(size.w * 0.89, y + 9, 7, 3),
        ...raceCarShapes(size.w / 2, size.h - 30, 104, '#F2F4F8', '#C21F30'),
      ];
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      // Two flags crossed on their staffs, the way a circuit says "finish".
      const staff = (dx: number): Shape => ({
        k: 'line',
        x1: c.cx + dx * 2,
        y1: c.cy - 30,
        x2: c.cx - dx * 22,
        y2: c.cy + 30,
        stroke: '#E8E2D8',
        sw: 2.4,
        round: true,
      });
      return [
        ...glow(c.cx, c.cy, 48, '#F2C230', 14, 0.3),
        staff(-1),
        staff(1),
        ...chequeredFlagShapes(c.cx - 2, c.cy - 30, -44, 26, -12),
        ...chequeredFlagShapes(c.cx + 2, c.cy - 30, 44, 26, 12),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#1B0710', '#5E101F', '#3C0912'],
    texture: (rng, size) => [
      ...speedLines(14, '#FFFFFF')(rng, size),
      ...inBands(7, (x, y, r) => chequerMark(x, y, r.range(1.6, 2.4), 0.8))(rng, size),
    ],
    emblem: (_rng, size) => [
      ...glow(size.w / 2, size.h * 0.16, 34, '#F2C230', 12, 0.26),
      { k: 'line', x1: size.w / 2 - 26, y1: size.h * 0.16 - 16, x2: size.w / 2 - 30, y2: size.h * 0.16 + 24, stroke: '#E8E2D8', sw: 2.2, round: true },
      ...chequeredFlagShapes(size.w / 2 - 26, size.h * 0.16 - 15, 52, 28, 8),
    ],
  }),
};
const carsRally: CoverVariant = {
  id: 'rally',
  name: { 'sr-Cyrl': 'Рели', 'sr-Latn': 'Reli', en: 'Rally', ru: 'Ралли' },
  emoji: '🚙',
  palette: {
    coverBg: '#8A3E1E',
    coverAccent: '#F5C86A',
    plaque: '#FFF6E6',
    plaqueEdge: '#C4622C',
    plaqueInk: '#4A2313',
  },
  coverArt: buildCover({
    sky: ['#2E1B3E', '#7A3A50', '#C9663F', '#EFA85C'],
    wash: (_rng, size) => [
      ...glowEllipse(size.w / 2, size.h * 0.8, size.w * 0.7, 58, '#F7C56E', 16, 0.4),
      ...glow(crestAt(size).cx, crestAt(size).cy, 54, '#F7C56E', 14, 0.2),
    ],
    texture: inBands(30, (x, y, r) => ({
      k: 'circle',
      cx: x,
      cy: y,
      r: r.range(0.4, 1.7),
      fill: '#F7D9A8',
      opacity: r.range(0.2, 0.6),
    })),
    ground: (rng, size) => {
      const y = horizonOf(size);
      return [
        { k: 'path', cmds: mountainsPath(-4, size.w + 4, y + 1, [y - 24, y - 36, y - 18, y - 31, y - 21]), fill: '#5E3355' },
        { k: 'path', cmds: hillsPath(-4, size.w + 4, y + 3, [y - 12, y - 17, y - 9]), fill: '#4A2740' },
        { k: 'rect', x: 0, y: y + 2, w: size.w, h: size.h - y, fill: '#D9A063' },
        ...perspectiveFloor('#9E7042', 1)(rng, size),
        // Two ruts worn into the gravel, spreading as the road nears.
        ...[-1, 1].map((s): Shape => ({
          k: 'line',
          x1: size.w / 2 + s * 9,
          y1: y + 2,
          x2: size.w / 2 + s * 52,
          y2: size.h,
          stroke: '#C08A52',
          sw: 2.6,
          opacity: 0.7,
        })),
        ...coneShapes(size.w * 0.16, size.h - 22, 17, '#EF6A3A'),
        ...coneShapes(size.w * 0.87, size.h - 10, 21, '#EF6A3A'),
        ...[0.3, 0.62, 0.78].map((t, i): Shape => ({
          k: 'ellipse',
          cx: size.w * t,
          cy: y + 8 + i * 5,
          rx: 4 + i,
          ry: 1.8 + i * 0.5,
          fill: '#7A4E2E',
          opacity: 0.8,
        })),
      ];
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        // Dust thrown up behind the car, thinning as it falls back.
        dustPuff(c.cx - 88, c.cy + 18, 76, 22, '#E8CFAA', 0.75),
        dustPuff(c.cx - 62, c.cy + 18, 52, 15, '#FBEEDA', 0.85),
        // …and the streaks a comic would draw behind anything going fast.
        ...[0, 1, 2].map((i): Shape => ({
          k: 'path',
          cmds: roundedRectPath(c.cx - 84 + (i % 2) * 12, c.cy - 20 + i * 9, 32 - i * 4, 2.4, 1.2),
          fill: '#FFE9C4',
          opacity: 0.5 - i * 0.08,
        })),
        { k: 'ellipse', cx: c.cx + 6, cy: c.cy + 16.5, rx: 48, ry: 4, fill: '#2E1B3E', opacity: 0.35 },
        ...carShapes(c.cx + 6, c.cy, 96, '#F2F4F8', { glass: '#BFE3F7' }),
        // A stripe down the flank and a bar of lamps over the roof.
        { k: 'path', cmds: roundedRectPath(c.cx - 37, c.cy - 2, 53, 3.4, 1.7), fill: '#C21F30' },
        { k: 'path', cmds: roundedRectPath(c.cx - 17.5, c.cy - 22.6, 26, 2.6, 1.3), fill: '#3B4250' },
        ...[0, 1, 2, 3].map((i): Shape => ({
          k: 'circle',
          cx: c.cx - 14 + i * 6,
          cy: c.cy - 24.4,
          r: 2.6,
          fill: '#FFF3C4',
        })),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#2E1B3E', '#7A3A50', '#C9663F'],
    texture: inBands(24, (x, y, r) => ({
      k: 'circle',
      cx: x,
      cy: y,
      r: r.range(0.4, 1.6),
      fill: '#F7D9A8',
      opacity: r.range(0.2, 0.55),
    })),
    emblem: (_rng, size) => {
      const cy = size.h * 0.17;
      return [
        { k: 'circle', cx: size.w / 2, cy, r: 24, fill: '#F7E3C0' },
        { k: 'circle', cx: size.w / 2, cy: cy - 5, r: 8, fill: '#EF8A4E' },
        { k: 'path', cmds: mountainsPath(size.w / 2 - 20, size.w / 2 + 20, cy + 10, [cy - 4, cy - 12, cy - 1]), fill: '#8A4A34' },
        { k: 'circle', cx: size.w / 2, cy, r: 24, stroke: '#C4622C', sw: 1.8 },
      ];
    },
  }),
};
/** A row of flat-topped buildings with windows, some of them lit. */
const skyline = (rng: Rng, size: Size, baseY: number, colors: readonly string[]): Shape[] => {
  const out: Shape[] = [];
  let x = -6;
  while (x < size.w + 6) {
    const w = rng.range(16, 28);
    const h = rng.range(22, 52);
    out.push(
      { k: 'rect', x, y: baseY - h, w, h, fill: rng.pick(colors) },
      { k: 'rect', x, y: baseY - h, w, h: 2, fill: '#FFFFFF', opacity: 0.2 },
    );
    for (let wy = baseY - h + 6; wy < baseY - 7; wy += 8) {
      for (let wx = x + 3.5; wx < x + w - 5; wx += 7) {
        out.push({
          k: 'rect',
          x: wx,
          y: wy,
          w: 3.4,
          h: 4.2,
          rx: 0.6,
          fill: rng.bool(0.4) ? '#FFE9A8' : '#9FC4E0',
          opacity: 0.75,
        });
      }
    }
    x += w + rng.range(1.5, 5);
  }
  return out;
};
const carsCity: CoverVariant = {
  id: 'city',
  name: { 'sr-Cyrl': 'У граду', 'sr-Latn': 'U gradu', en: 'In town', ru: 'В городе' },
  emoji: '🚦',
  palette: {
    coverBg: '#1E5FA8',
    coverAccent: '#FFD166',
    plaque: '#FFFFFF',
    plaqueEdge: '#1E5FA8',
    plaqueInk: '#12395F',
  },
  coverArt: buildCover({
    sky: ['#1B5C9E', '#3E8ACB', '#89C2EA', '#CFE6F5'],
    wash: (_rng, size) => [
      ...glow(size.w * 0.8, size.h * 0.08, 46, '#FFF3C4', 14, 0.5),
      ...cloudShapes(size.w * 0.22, size.h * 0.07, 42, { fill: '#FFFFFF' }),
      ...cloudShapes(size.w * 0.66, size.h * 0.21, 30, { fill: '#DCEBF7' }),
    ],
    texture: inBands(5, (x, y, r) => ({
      k: 'path',
      cmds: [
        { c: 'M', x: x - r.range(3, 5), y },
        { c: 'Q', x1: x - 1.5, y1: y - 2.2, x, y },
        { c: 'Q', x1: x + 1.5, y1: y - 2.2, x: x + r.range(3, 5), y },
      ],
      stroke: '#FFFFFF',
      sw: 0.7,
      opacity: 0.6,
    })),
    ground: (rng, size) => {
      const kerb = size.h - 40;
      const road = size.h - 34;
      return [
        ...skyline(rng, size, kerb, ['#2E5E8C', '#3E7AA8', '#27506F', '#4A87B5']),
        { k: 'rect', x: 0, y: kerb, w: size.w, h: road - kerb, fill: '#C9CFD8' },
        { k: 'rect', x: 0, y: road, w: size.w, h: size.h - road, fill: '#3B4250' },
        { k: 'rect', x: 0, y: road, w: size.w, h: 1.4, fill: '#E8EDF2' },
        // A crossing under the lights, then the traffic itself.
        ...Array.from({ length: 5 }, (_, i): Shape => ({
          k: 'rect',
          x: 10 + i * 9,
          y: road + 3,
          w: 5,
          h: size.h - road - 6,
          fill: '#E8EDF2',
          opacity: 0.9,
        })),
        ...Array.from({ length: 6 }, (_, i): Shape => ({
          k: 'rect',
          x: 62 + i * 26,
          y: size.h - 15,
          w: 12,
          h: 1.8,
          fill: '#E8EDF2',
          opacity: 0.85,
        })),
        ...trafficLightShapes(size.w * 0.13, kerb, 46, '#5A6270', '#2E3440'),
        ...carShapes(size.w * 0.72, size.h - 24, 48, '#4FA3D9', { glass: '#DDF0FB', facing: -1 }),
        ...carShapes(size.w * 0.42, size.h - 11, 64, '#E8503A'),
      ];
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      // A round road sign: white ring, blue field, one white car.
      return [
        ...glow(c.cx, c.cy, 40, '#FFFFFF', 12, 0.3),
        { k: 'circle', cx: c.cx, cy: c.cy, r: 30, fill: '#FFFFFF' },
        { k: 'circle', cx: c.cx, cy: c.cy, r: 26.5, fill: '#1E5FA8' },
        ...carShapes(c.cx, c.cy + 3, 44, '#FFFFFF', { glass: '#1E5FA8', tyre: '#12395F', rim: '#FFFFFF' }),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#1B5C9E', '#3E8ACB', '#89C2EA'],
    texture: (rng, size) => [
      ...cloudShapes(size.w * 0.24, size.h * 0.42, 40, { fill: '#FFFFFF' }),
      ...cloudShapes(size.w * 0.74, size.h * 0.32, 30, { fill: '#DCEBF7' }),
      ...inBands(4, (x, y, r) => ({ k: 'circle', cx: x, cy: y, r: r.range(0.6, 1.4), fill: '#FFFFFF', opacity: 0.4 }))(rng, size),
    ],
    emblem: (_rng, size) => [
      { k: 'circle', cx: size.w / 2, cy: size.h * 0.16, r: 24, fill: '#FFFFFF' },
      { k: 'circle', cx: size.w / 2, cy: size.h * 0.16, r: 21, fill: '#1E5FA8' },
      ...carShapes(size.w / 2, size.h * 0.16 + 2, 32, '#FFFFFF', { glass: '#1E5FA8', tyre: '#12395F', rim: '#FFFFFF' }),
    ],
  }),
};
/**
 * A big low sun, banded the way a poster from the seventies draws one. The
 * slits are painted in the sky's own colour, so the sun reads as cut into
 * rather than covered over.
 */
const retroSun = (cx: number, cy: number, r: number, stops: readonly string[], slit: string): Shape[] => {
  const out: Shape[] = Array.from({ length: 16 }, (_, i): Shape => ({
    k: 'circle',
    cx,
    cy,
    r: r * (1 - i / 16),
    fill: colorAt(stops, i / 15),
  }));
  for (let i = 0; i < 6; i++) {
    const dy = r * (0.14 + i * 0.14);
    const h = r * (0.03 + i * 0.012);
    const hw = Math.sqrt(Math.max(0, r * r - (dy + h) * (dy + h)));
    out.push({ k: 'rect', x: cx - hw, y: cy + dy, w: hw * 2, h, fill: slit });
  }
  return out;
};
const carsClassics: CoverVariant = {
  id: 'classics',
  name: { 'sr-Cyrl': 'Олдтајмери', 'sr-Latn': 'Oldtajmeri', en: 'Classics', ru: 'Ретро' },
  emoji: '🚕',
  palette: {
    coverBg: '#3A2059',
    coverAccent: '#F7C56E',
    plaque: '#FFF6E8',
    plaqueEdge: '#F7C56E',
    plaqueInk: '#4A1F3A',
  },
  coverArt: buildCover({
    sky: ['#2A1B4E', '#6E2F6B', '#C9515F', '#F0925A', '#F7C56E'],
    wash: (_rng, size) => glowEllipse(size.w / 2, size.h * 0.14, size.w * 0.6, 70, '#F7C56E', 16, 0.3),
    texture: (rng, size) => [
      ...sparkles(7, '#FFE9A8', 'top')(rng, size),
      ...inBands(16, (x, y, r) => ({
        k: 'circle',
        cx: x,
        cy: y,
        r: r.range(0.4, 1.2),
        fill: '#FFE9A8',
        opacity: r.range(0.3, 0.7),
      }))(rng, size),
    ],
    ground: (_rng, size) => {
      const y = horizonOf(size);
      const road = size.h - 34;
      return [
        { k: 'path', cmds: hillsPath(-4, size.w + 4, y + 4, [y - 16, y - 26, y - 12]), fill: '#4A2740' },
        ...palmShapes(24, road + 2, 54, '#3A2340', '#5A2E58', 10),
        ...palmShapes(size.w - 20, road + 2, 44, '#3A2340', '#5A2E58', -8),
        { k: 'rect', x: 0, y: road, w: size.w, h: size.h - road, fill: '#2E2438' },
        { k: 'rect', x: 0, y: road, w: size.w, h: 1.6, fill: '#F0925A', opacity: 0.7 },
        ...Array.from({ length: 6 }, (_, i): Shape => ({
          k: 'rect',
          x: 8 + i * 36,
          y: size.h - 9,
          w: 16,
          h: 1.8,
          fill: '#F7C56E',
          opacity: 0.6,
        })),
        { k: 'ellipse', cx: size.w / 2, cy: size.h - 4, rx: 54, ry: 5, fill: '#1B1226', opacity: 0.45 },
        ...carShapes(size.w / 2, size.h - 20, 100, '#F2E4C8', { glass: '#F7D9A8' }),
      ];
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...retroSun(c.cx, c.cy, 40, ['#FFF3C4', '#F7B85C', '#EF6F5C'], '#4E2760'),
        ...carShapes(c.cx, c.cy + 15, 86, '#2E1832', { glass: '#2E1832', tyre: '#241028', rim: '#4A2D50' }),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#2A1B4E', '#6E2F6B', '#C9515F'],
    texture: sparkles(10, '#FFE9A8'),
    emblem: (_rng, size) => [
      ...glow(size.w / 2, size.h * 0.16, 34, '#F7C56E', 12, 0.3),
      ...steeringWheelShapes(size.w / 2, size.h * 0.16, 22, '#F7EFE0', '#C9515F'),
    ],
  }),
};
const carsMine: CoverVariant = {
  id: 'mycar',
  name: { 'sr-Cyrl': 'Моја вожња', 'sr-Latn': 'Moja vožnja', en: 'My ride', ru: 'Моя машина' },
  emoji: '📷',
  photo: true,
  palette: {
    coverBg: '#2E3440',
    coverAccent: '#F2C230',
    plaque: '#FFFFFF',
    plaqueEdge: '#F2C230',
    plaqueInk: '#23262E',
  },
};
export const carsVariants: readonly CoverVariant[] = [carsRace, carsRally, carsCity, carsClassics, carsMine];
// ---------------------------------------------------------------------------
// Unicorns
// ---------------------------------------------------------------------------
const RAINBOW = ['#FF6B8B', '#FF9E6B', '#FFD166', '#7ED9A0', '#6BC5FF', '#B08BFF'] as const;
const unicornsRainbow: CoverVariant = {
  id: 'rainbow',
  name: { 'sr-Cyrl': 'Дуга', 'sr-Latn': 'Duga', en: 'Rainbow', ru: 'Радуга' },
  emoji: '🌈',
  coverArt: buildCover({
    sky: ['#FFF7FC', '#FDE7F3', '#FBD3E8', '#F9C2DF'],
    wash: (_rng, size) => [
      ...glow(size.w / 2, size.h * 0.14, 58, '#FFFFFF', 14, 0.55),
      ...cloudShapes(size.w * 0.86, size.h * 0.26, 42, { fill: '#FFFFFF', opacity: 0.9 }),
      ...cloudShapes(size.w * 0.14, size.h * 0.08, 34, { fill: '#FFFFFF', opacity: 0.8 }),
    ],
    texture: (rng, size) => [
      ...inBands(12, (x, y, r) => ({ k: 'path', cmds: heartPath(x, y, r.range(3.5, 7)), fill: '#FF8FBC', opacity: r.range(0.35, 0.7) }))(rng, size),
      ...sparkles(14, '#F06CA8')(rng, size),
    ],
    ground: (_rng, size) => {
      const base = size.h - 22;
      return [
        ...RAINBOW.map((c, i): Shape => ({ k: 'path', cmds: arcPath(size.w / 2, base, 92 - i * 9), stroke: c, sw: 8.4, opacity: 0.92 })),
        ...cloudShapes(size.w / 2 - 92, base, 44, { fill: '#FFFFFF' }),
        ...cloudShapes(size.w / 2 + 92, base, 44, { fill: '#FFFFFF' }),
        ...cloudShapes(size.w / 2, base + 12, 56, { fill: '#FFFFFF' }),
      ];
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...glow(c.cx, c.cy, 36, '#FFFFFF', 12, 0.5),
        ...unicornShapes(c.cx, c.cy - 1, 54, '#FFFFFF', '#FFD166', ['#FF6B8B', '#FFD166', '#6BC5FF', '#B08BFF']),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#FFF7FC', '#FDE7F3', '#F9C2DF'],
    texture: (rng, size) => [
      ...inBands(14, (x, y, r) => ({ k: 'path', cmds: heartPath(x, y, r.range(4, 8)), fill: '#FF8FBC', opacity: 0.55 }))(rng, size),
      ...sparkles(12, '#F06CA8')(rng, size),
    ],
    emblem: (_rng, size) => cloudShapes(size.w / 2, size.h * 0.16, 54, { fill: '#FFFFFF' }),
  }),
};
const unicornsNight: CoverVariant = {
  id: 'night',
  name: { 'sr-Cyrl': 'Звездана ноћ', 'sr-Latn': 'Zvezdana noć', en: 'Starry night', ru: 'Звёздная ночь' },
  emoji: '🌙',
  palette: { coverBg: '#2B1054', coverAccent: '#FFD6F5', plaque: '#FFFFFF', plaqueEdge: '#FFD6F5', plaqueInk: '#3A1A6B' },
  coverArt: buildCover({
    sky: ['#140832', '#33176B', '#6B2E86', '#B4529A'],
    wash: (_rng, size) => [
      ...glowEllipse(size.w / 2, size.h * 0.14, 70, 52, '#FFE8FA', 16, 0.35),
      ...glowEllipse(size.w * 0.2, size.h * 0.86, 66, 40, '#FF7AC6', 14, 0.35),
    ],
    texture: (rng, size) => [...starfield(90)(rng, size), ...sparkles(12, '#FFD6F5')(rng, size)],
    ground: (_rng, size) => [
      { k: 'path', cmds: hillsPath(-10, size.w + 10, size.h + 6, [size.h * 0.86, size.h * 0.9, size.h * 0.84]), fill: '#2A1258', opacity: 0.95 },
      ...faded(RAINBOW.map((c, i): Shape => ({ k: 'path', cmds: arcPath(size.w / 2, size.h - 4, 78 - i * 7), stroke: c, sw: 6.6 })), 0.34),
      ...cloudShapes(size.w * 0.16, size.h * 0.79, 34, { fill: '#4A2280', opacity: 0.85 }),
      ...cloudShapes(size.w * 0.84, size.h * 0.75, 30, { fill: '#4A2280', opacity: 0.7 }),
    ],
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...moonShapes(c.cx + 17, c.cy - 12, 22, '#FFF3D6', '#EAD9B4'),
        ...unicornShapes(c.cx - 4, c.cy + 1, 52, '#FFF6FB', '#FFD166', ['#FF7AC6', '#B08BFF', '#6BC5FF']),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#140832', '#33176B', '#2A1258'],
    texture: (rng, size) => [...starfield(70)(rng, size), ...sparkles(10, '#FFD6F5')(rng, size)],
    emblem: (_rng, size) => moonShapes(size.w / 2, size.h * 0.16, 21, '#FFF3D6', '#EAD9B4'),
  }),
};
const unicornsCandy: CoverVariant = {
  id: 'candy',
  name: { 'sr-Cyrl': 'Слаткиши', 'sr-Latn': 'Slatkiši', en: 'Candy', ru: 'Сладости' },
  emoji: '🍭',
  palette: { coverBg: '#FFE3F0', coverAccent: '#FF6FAE', plaque: '#FFFFFF', plaqueEdge: '#FF6FAE', plaqueInk: '#8A2E60' },
  coverArt: buildCover({
    sky: ['#FFFBFD', '#FFEAF4', '#FFD3E7', '#FFB8D8'],
    wash: (_rng, size) =>
      // Candy stripes, running on the diagonal.
      Array.from({ length: 16 }, (_, i): Shape => ({
        k: 'path',
        cmds: [
          { c: 'M', x: -60 + i * 26, y: size.h + 10 },
          { c: 'L', x: -60 + i * 26 + 12, y: size.h + 10 },
          { c: 'L', x: -60 + i * 26 + 12 + size.h * 0.55, y: -10 },
          { c: 'L', x: -60 + i * 26 + size.h * 0.55, y: -10 },
          { c: 'Z' },
        ],
        fill: '#FFFFFF',
        opacity: 0.5,
      })),
    texture: (rng, size) => [
      ...inBands(10, (x, y, r) => ({ k: 'path', cmds: heartPath(x, y, r.range(3.5, 6.5)), fill: '#FF6FAE', opacity: r.range(0.3, 0.6) }))(rng, size),
      ...sparkles(10, '#FFFFFF')(rng, size),
    ],
    ground: (_rng, size) => {
      const y = size.h - 8;
      return [
        // A scalloped band of icing along the foot.
        { k: 'rect', x: 0, y: size.h - 30, w: size.w, h: 30, fill: '#FF6FAE' },
        ...Array.from({ length: 11 }, (_, i): Shape => ({
          k: 'circle',
          cx: (i * size.w) / 10,
          cy: size.h - 30,
          r: 11,
          fill: '#FF6FAE',
        })),
        ...lollipopShapes(size.w * 0.2, size.h * 0.79, 21, '#FF4F9C', '#FFFFFF'),
        ...lollipopShapes(size.w * 0.8, size.h * 0.81, 17, '#7ED9A0', '#FFFFFF'),
        ...candyShapes(size.w * 0.5, y - 8, 9, '#FFD166', '#FF9E6B'),
        ...candyShapes(size.w * 0.36, y - 4, 6.5, '#6BC5FF', '#B08BFF'),
        ...candyShapes(size.w * 0.64, y - 3, 6, '#B08BFF', '#FF6B8B'),
      ];
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...glow(c.cx, c.cy, 36, '#FFFFFF', 12, 0.55),
        ...lollipopShapes(c.cx, c.cy - 6, 27, '#FF4F9C', '#FFFFFF'),
        ...candyShapes(c.cx - 34, c.cy + 16, 8, '#FFD166', '#FF9E6B'),
        ...candyShapes(c.cx + 34, c.cy + 14, 7, '#6BC5FF', '#B08BFF'),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#FFFBFD', '#FFEAF4', '#FFB8D8'],
    texture: (rng, size) => inBands(16, (x, y, r) => candyShapes(x, y, r.range(4, 7), r.pick(['#FFD166', '#6BC5FF', '#FF6B8B']), '#FFFFFF'))(rng, size),
    emblem: (_rng, size) => lollipopShapes(size.w / 2, size.h * 0.15, 24, '#FF4F9C', '#FFFFFF'),
  }),
};
const unicornsMine: CoverVariant = {
  id: 'myunicorn',
  name: { 'sr-Cyrl': 'Мој једнорог', 'sr-Latn': 'Moj jednorog', en: 'My unicorn', ru: 'Мой единорог' },
  emoji: '📷',
  photo: true,
  palette: { coverBg: '#F06CA8', coverAccent: '#FFD166', plaque: '#FFFFFF', plaqueEdge: '#F06CA8', plaqueInk: '#7A2E5C' },
};
export const unicornVariants: readonly CoverVariant[] = [
  unicornsRainbow,
  unicornsNight,
  unicornsCandy,
  unicornsMine,
];
// ---------------------------------------------------------------------------
// Pets
// ---------------------------------------------------------------------------
const petsPaws: CoverVariant = {
  id: 'paws',
  name: { 'sr-Cyrl': 'Шапице', 'sr-Latn': 'Šapice', en: 'Paws', ru: 'Лапки' },
  emoji: '🐾',
  coverArt: buildCover({
    sky: ['#FFF7EC', '#FFE7D0', '#FFD3B3', '#FFC49B'],
    wash: (_rng, size) => glow(size.w / 2, size.h * 0.15, 62, '#FFFFFF', 14, 0.6),
    texture: (rng, size) => [
      ...inBands(11, (x, y, r) => ({ k: 'path', cmds: heartPath(x, y, r.range(3.5, 6.5)), fill: '#F4795B', opacity: r.range(0.25, 0.5) }))(rng, size),
    ],
    ground: (_rng, size) => {
      const out: Shape[] = [];
      // A trail of paws wandering off toward the horizon.
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        out.push(
          ...pawShapes(
            size.w * (0.12 + t * 0.78) + Math.sin(t * 5) * 6,
            size.h * (0.96 - t * 0.17),
            17 - t * 7,
            { fill: '#F4795B', opacity: 0.55 - t * 0.18 },
          ),
        );
      }
      out.push(
        { k: 'circle', cx: size.w * 0.16, cy: size.h - 24, r: 15, fill: '#8ECFD8' },
        { k: 'path', cmds: arcPath(size.w * 0.16, size.h - 20, 10), stroke: '#5FA9B3', sw: 1.1 },
        { k: 'path', cmds: arcPath(size.w * 0.16, size.h - 14, 12), stroke: '#5FA9B3', sw: 1.1 },
        ...boneShapes(size.w * 0.82, size.h - 16, 34, -14, { fill: '#FFFBF0' }),
      );
      return out;
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        { k: 'circle', cx: c.cx, cy: c.cy, r: 32, fill: '#FFFFFF', opacity: 0.75 },
        ...pawShapes(c.cx, c.cy + 2, 44, { fill: '#F4795B' }),
        { k: 'path', cmds: heartPath(c.cx, c.cy + 7, 12), fill: '#FFFFFF', opacity: 0.85 },
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#FFF7EC', '#FFE7D0', '#FFC49B'],
    texture: inBands(14, (x, y, r) => pawShapes(x, y, r.range(10, 16), { fill: '#F4795B', opacity: 0.32 })),
    emblem: (_rng, size) => pawShapes(size.w / 2, size.h * 0.16, 34, { fill: '#F4795B', opacity: 0.85 }),
  }),
};
const petsDogs: CoverVariant = {
  id: 'dogs',
  name: { 'sr-Cyrl': 'Пси', 'sr-Latn': 'Psi', en: 'Dogs', ru: 'Собаки' },
  emoji: '🐶',
  palette: { coverBg: '#CFE6FB', coverAccent: '#2F80ED', plaque: '#FFFFFF', plaqueEdge: '#2F80ED', plaqueInk: '#16436E' },
  coverArt: buildCover({
    sky: ['#F2F9FF', '#D8EBFC', '#B6D9F7', '#93C6F2'],
    wash: (_rng, size) => [
      ...glow(size.w / 2, size.h * 0.15, 60, '#FFFFFF', 14, 0.65),
      ...cloudShapes(size.w * 0.85, size.h * 0.25, 38, { fill: '#FFFFFF', opacity: 0.85 }),
      ...cloudShapes(size.w * 0.13, size.h * 0.07, 30, { fill: '#FFFFFF', opacity: 0.7 }),
    ],
    texture: inBands(12, (x, y, r) => boneShapes(x, y, r.range(11, 18), r.range(-40, 40), { fill: '#FFFFFF', opacity: 0.65 })),
    ground: (_rng, size) => {
      const groundY = size.h * 0.86;
      const out: Shape[] = [
        { k: 'rect', x: 0, y: groundY, w: size.w, h: size.h - groundY, fill: '#7EC08A' },
        { k: 'path', cmds: hillsPath(-10, size.w + 10, groundY + 3, [groundY - 9, groundY - 5, groundY - 11]), fill: '#93CE9E' },
      ];
      for (let i = 0; i < 14; i++) {
        const x = 6 + i * ((size.w - 12) / 13);
        out.push({ k: 'path', cmds: trianglePath(x - 1.6, groundY + 2, x + 1.6, groundY + 2, x, groundY - 6), fill: '#5FA872', opacity: 0.8 });
      }
      out.push(
        ...boneShapes(size.w * 0.2, size.h - 12, 36, -12, { fill: '#FFFBF0' }),
        { k: 'circle', cx: size.w * 0.8, cy: size.h - 15, r: 11, fill: '#EF6A5A' },
        { k: 'path', cmds: arcPath(size.w * 0.8, size.h - 11, 8), stroke: '#FFFFFF', sw: 1.4, opacity: 0.85 },
      );
      return out;
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        { k: 'circle', cx: c.cx, cy: c.cy, r: 33, fill: '#FFFFFF', opacity: 0.85 },
        ...dogFaceShapes(c.cx, c.cy, 25, '#C98B4E', '#8E5B2C'),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#F2F9FF', '#D8EBFC', '#93C6F2'],
    texture: inBands(16, (x, y, r) => boneShapes(x, y, r.range(12, 20), r.range(-40, 40), { fill: '#FFFFFF', opacity: 0.7 })),
    emblem: (_rng, size) => dogFaceShapes(size.w / 2, size.h * 0.17, 22, '#C98B4E', '#8E5B2C'),
  }),
};
const petsCats: CoverVariant = {
  id: 'cats',
  name: { 'sr-Cyrl': 'Мачке', 'sr-Latn': 'Mačke', en: 'Cats', ru: 'Кошки' },
  emoji: '🐱',
  palette: { coverBg: '#D6F0E4', coverAccent: '#2FA37C', plaque: '#FFFFFF', plaqueEdge: '#2FA37C', plaqueInk: '#1B5C46' },
  coverArt: buildCover({
    sky: ['#F4FCF8', '#DCF2E9', '#BFE6D6', '#A2D9C3'],
    wash: (_rng, size) => glow(size.w / 2, size.h * 0.15, 60, '#FFFFFF', 14, 0.6),
    texture: inBands(13, (x, y, r) => fishShapes(x, y, r.range(9, 15), r.range(-25, 25), { fill: '#2FA37C', opacity: r.range(0.2, 0.4) })),
    ground: (_rng, size) => {
      const out: Shape[] = [
        { k: 'rect', x: 0, y: size.h - 26, w: size.w, h: 26, fill: '#2FA37C', opacity: 0.18 },
      ];
      for (const [cx, r, a, b] of [[0.2, 15, '#F4A0BD', '#D97C9C'], [0.5, 11, '#FFD166', '#E0AE3E'], [0.8, 13, '#8ECFD8', '#5FA9B3']] as const) {
        out.push(
          { k: 'circle', cx: size.w * cx, cy: size.h - 22, r, fill: a },
          { k: 'path', cmds: arcPath(size.w * cx, size.h - 18, r * 0.66), stroke: b, sw: 1.1 },
          { k: 'path', cmds: arcPath(size.w * cx, size.h - 13, r * 0.8), stroke: b, sw: 1.1 },
        );
      }
      out.push(...fishShapes(size.w * 0.35, size.h - 34, 20, -12, { fill: '#F4A0BD' }));
      out.push(...fishShapes(size.w * 0.66, size.h - 38, 16, 14, { fill: '#8ECFD8' }));
      return out;
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        { k: 'circle', cx: c.cx, cy: c.cy, r: 33, fill: '#FFFFFF', opacity: 0.85 },
        ...catFaceShapes(c.cx, c.cy + 3, 23, '#6B7A8F', '#F4A0BD'),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#F4FCF8', '#DCF2E9', '#A2D9C3'],
    texture: inBands(16, (x, y, r) => pawShapes(x, y, r.range(9, 15), { fill: '#2FA37C', opacity: 0.28 })),
    emblem: (_rng, size) => catFaceShapes(size.w / 2, size.h * 0.17, 21, '#6B7A8F', '#F4A0BD'),
  }),
};
const petsMine: CoverVariant = {
  id: 'mypet',
  name: { 'sr-Cyrl': 'Мој љубимац', 'sr-Latn': 'Moj ljubimac', en: 'My pet', ru: 'Мой питомец' },
  emoji: '📷',
  photo: true,
  palette: { coverBg: '#F4795B', coverAccent: '#FFD166', plaque: '#FFFFFF', plaqueEdge: '#F4795B', plaqueInk: '#7A3B2E' },
};
export const petVariants: readonly CoverVariant[] = [petsPaws, petsDogs, petsCats, petsMine];
// ---------------------------------------------------------------------------
// My class
// ---------------------------------------------------------------------------
const CONFETTI = ['#3A86FF', '#FF6B6B', '#FFD166', '#06D6A0', '#B08BFF', '#FF9E6B'] as const;
const classSchool: CoverVariant = {
  id: 'school',
  name: { 'sr-Cyrl': 'Школа', 'sr-Latn': 'Škola', en: 'School', ru: 'Школа' },
  emoji: '🎒',
  coverArt: buildCover({
    sky: ['#FFFFFF', '#EEF4FF', '#DCE9FF', '#C4DAFF'],
    wash: (_rng, size) => [
      ...glow(size.w / 2, size.h * 0.15, 58, '#FFFFFF', 14, 0.7),
      ...cloudShapes(size.w * 0.86, size.h * 0.24, 36, { fill: '#FFFFFF', opacity: 0.9 }),
      ...cloudShapes(size.w * 0.12, size.h * 0.07, 28, { fill: '#FFFFFF', opacity: 0.75 }),
    ],
    texture: confetti(CONFETTI, 32),
    ground: (_rng, size) => {
      const groundY = size.h * 0.925;
      return [
        ...buntingShapes(4, size.h * 0.755, size.w - 4, size.h * 0.755, 9, 9, CONFETTI, '#8FA6C8'),
        { k: 'rect', x: 0, y: groundY, w: size.w, h: size.h - groundY, fill: '#7EC08A' },
        ...schoolShapes(size.w / 2, groundY, 62, '#FFE3B0', '#E4685C', '#8FD3F4'),
        ...pencilShapes(size.w * 0.12, size.h - 16, 40, -24, '#FFD166', '#F0D8B0', '#4A4A4A'),
        ...pencilShapes(size.w * 0.88, size.h - 14, 36, 20, '#FF6B6B', '#F0D8B0', '#4A4A4A'),
      ];
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...pencilShapes(c.cx, c.cy, 96, -34, '#FFD166', '#F0D8B0', '#4A4A4A'),
        ...pencilShapes(c.cx, c.cy, 96, 34, '#FF6B6B', '#F0D8B0', '#4A4A4A'),
        ...rosetteShapes(c.cx, c.cy, 21, '#3A86FF', '#FFFFFF', '#FFD166'),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#FFFFFF', '#EEF4FF', '#C4DAFF'],
    texture: confetti(CONFETTI, 34),
    emblem: (_rng, size) => rosetteShapes(size.w / 2, size.h * 0.16, 20, '#3A86FF', '#FFFFFF', '#FFD166'),
  }),
};
const classParty: CoverVariant = {
  id: 'party',
  name: { 'sr-Cyrl': 'Журка', 'sr-Latn': 'Žurka', en: 'Party', ru: 'Вечеринка' },
  emoji: '🎈',
  palette: { coverBg: '#FFF3DC', coverAccent: '#FF4D6D', plaque: '#FFFFFF', plaqueEdge: '#FF4D6D', plaqueInk: '#8A2438' },
  coverArt: buildCover({
    sky: ['#FFFDF6', '#FFF2DE', '#FFE2C4', '#FFD0AE'],
    wash: (_rng, size) => [
      ...sunburst(size.w / 2, size.h * 0.14, size.h * 0.55, 20, { fill: '#FFB86B', opacity: 0.14 }),
      ...glow(size.w / 2, size.h * 0.14, 50, '#FFFFFF', 14, 0.6),
    ],
    texture: confetti(['#FF4D6D', '#3A86FF', '#FFD166', '#06D6A0', '#B08BFF'], 46),
    ground: (_rng, size) => [
      ...buntingShapes(4, size.h * 0.745, size.w - 4, size.h * 0.775, 12, 10, ['#FF4D6D', '#FFD166', '#06D6A0', '#3A86FF'], '#C99A6B'),
      ...balloonShapes(size.w * 0.16, size.h * 0.855, 13, '#FF4D6D'),
      ...balloonShapes(size.w * 0.32, size.h * 0.9, 10, '#FFD166'),
      ...balloonShapes(size.w * 0.72, size.h * 0.88, 11, '#3A86FF'),
      ...balloonShapes(size.w * 0.87, size.h * 0.845, 14, '#06D6A0'),
    ],
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...balloonShapes(c.cx - 21, c.cy - 4, 15, '#FF4D6D'),
        ...balloonShapes(c.cx + 21, c.cy - 2, 14, '#3A86FF'),
        ...balloonShapes(c.cx, c.cy - 12, 18, '#FFD166'),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#FFFDF6', '#FFF2DE', '#FFD0AE'],
    texture: confetti(['#FF4D6D', '#3A86FF', '#FFD166', '#06D6A0', '#B08BFF'], 44),
    emblem: (_rng, size) => balloonShapes(size.w / 2, size.h * 0.13, 17, '#FF4D6D'),
  }),
};
const classSports: CoverVariant = {
  id: 'sports',
  name: { 'sr-Cyrl': 'Спортски дан', 'sr-Latn': 'Sportski dan', en: 'Sports day', ru: 'Спортивный день' },
  emoji: '🏅',
  palette: { coverBg: '#DCEFFF', coverAccent: '#06A77D', plaque: '#FFFFFF', plaqueEdge: '#06A77D', plaqueInk: '#0B4B3A' },
  coverArt: buildCover({
    sky: ['#F5FAFF', '#DEEEFF', '#C2E0FA', '#A6D2F5'],
    wash: (_rng, size) => glow(size.w / 2, size.h * 0.14, 56, '#FFFFFF', 14, 0.65),
    texture: confetti(['#06A77D', '#FFD166', '#EF6A5A', '#3A86FF'], 26),
    ground: (_rng, size) => {
      const trackTop = size.h * 0.76;
      const out: Shape[] = [
        { k: 'rect', x: 0, y: trackTop, w: size.w, h: size.h - trackTop, fill: '#E0724F' },
      ];
      for (let i = 1; i < 5; i++) {
        out.push({
          k: 'line',
          x1: 0,
          y1: trackTop + (i * (size.h - trackTop)) / 5,
          x2: size.w,
          y2: trackTop + (i * (size.h - trackTop)) / 5,
          stroke: '#FFFFFF',
          sw: 0.9,
          opacity: 0.7,
        });
      }
      out.push(...checkerBand({ x: 0, y: trackTop - 7, w: size.w, h: 7 }, 7, '#FFFFFF', '#2B3542'));
      out.push(...medalShapes(size.w * 0.16, size.h - 16, 11, '#EF6A5A', '#FFD166', '#8A6300'));
      out.push(...medalShapes(size.w * 0.85, size.h - 18, 9, '#3A86FF', '#E6E9F2', '#6B7280'));
      return out;
    },
    crest: (_rng, size) => {
      const c = crestAt(size);
      return [
        ...glow(c.cx, c.cy, 34, '#FFFFFF', 12, 0.6),
        ...rosetteShapes(c.cx, c.cy - 2, 24, '#06A77D', '#FFFFFF', '#FFD166'),
      ];
    },
  }),
  backArt: buildBack({
    sky: ['#F5FAFF', '#DEEEFF', '#A6D2F5'],
    texture: confetti(['#06A77D', '#FFD166', '#EF6A5A', '#3A86FF'], 30),
    emblem: (_rng, size) => medalShapes(size.w / 2, size.h * 0.17, 18, '#EF6A5A', '#FFD166', '#8A6300'),
  }),
};
const classMine: CoverVariant = {
  id: 'myclass',
  name: { 'sr-Cyrl': 'Наша слика', 'sr-Latn': 'Naša slika', en: 'Our photo', ru: 'Наше фото' },
  emoji: '📷',
  photo: true,
  palette: { coverBg: '#3A86FF', coverAccent: '#FFD166', plaque: '#FFFFFF', plaqueEdge: '#3A86FF', plaqueInk: '#22314E' },
};
export const classVariants: readonly CoverVariant[] = [classSchool, classParty, classSports, classMine];
// ---------------------------------------------------------------------------
// Shared inside-cover artwork
//
// The inside of a cover is a backdrop for text, so it stays calm whatever the
// front looks like: the theme's own colour, two bands, and a faint motif.
// ---------------------------------------------------------------------------
export const insideArtOf = (bandColor: string, motif: (rng: Rng, size: Size) => Shape[]): ArtFn =>
  (rng, size) => [
    bg(size, tint(bandColor, 0.93)),
    { k: 'rect', x: 0, y: 0, w: size.w, h: 14, fill: bandColor },
    { k: 'rect', x: 0, y: size.h - 14, w: size.w, h: 14, fill: bandColor },
    { k: 'rect', x: 0, y: 14, w: size.w, h: 1.2, fill: shade(bandColor, 0.2), opacity: 0.5 },
    { k: 'rect', x: 0, y: size.h - 15.2, w: size.w, h: 1.2, fill: shade(bandColor, 0.2), opacity: 0.5 },
    ...faded(motif(rng, size), 0.12),
  ];
/** Exported so the sample script and tests can walk every cover in the app. */
export const ALL_VARIANTS: readonly CoverVariant[] = [
  ...footballVariants,
  ...spaceVariants,
  ...dinoVariants,
  ...carsVariants,
  ...unicornVariants,
  ...petVariants,
  ...classVariants,
];
