/**
 * The richer half of the drawing vocabulary: colour maths, soft fills and the
 * composite motifs the cover themes are built from.
 *
 * `shapes.ts` holds the primitives. Everything here is made of those, so a
 * theme is still pure data and the browser and the PDF still draw the same
 * picture. In particular there are no gradients in the primitive set — pdf-lib
 * has none — so a gradient is a stack of thin bands, which both renderers can
 * draw and which is indistinguishable from a real one at print resolution.
 *
 * Coordinates are millimetres, y-down, relative to the shape's container.
 */

import type { Rect } from './geometry.ts';
import type { Paint, PathCmd, Shape } from './shapes.ts';
import { arcPath, ellipsePath, leafPath, rotatePath, roundedRectPath, starPath, trianglePath } from './shapes.ts';

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

const parseHex = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const v = Number.parseInt(m[1]!, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((c) => clampByte(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Blend two colours. `t` of 0 is all `a`, 1 is all `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const k = Math.max(0, Math.min(1, t));
  return toHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

/** Toward black. */
export const shade = (hex: string, t: number): string => mixHex(hex, '#000000', t);

/** Toward white. */
export const tint = (hex: string, t: number): string => mixHex(hex, '#FFFFFF', t);

/** The colour `t` of the way along a list of stops. */
export function colorAt(stops: readonly string[], t: number): string {
  if (stops.length === 0) return '#000000';
  if (stops.length === 1) return stops[0]!;
  const p = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(p));
  return mixHex(stops[i]!, stops[i + 1]!, p - i);
}

// ---------------------------------------------------------------------------
// Soft fills
// ---------------------------------------------------------------------------

/**
 * A gradient, as a stack of bands.
 *
 * Each band runs from where it starts all the way to the far edge, and they
 * are painted in order, so a band is always laid over the whole of the one
 * before it. Two bands that merely abut would show a hairline seam wherever
 * the renderer antialiases their shared edge — visible as banding across a
 * full-bleed cover in both SVG and PDF — and overlapping them completely is
 * the only way to be sure that can never happen.
 */
export function gradientBands(
  rect: Rect,
  stops: readonly string[],
  steps = 40,
  direction: 'v' | 'h' = 'v',
): Shape[] {
  const out: Shape[] = [];
  const span = direction === 'v' ? rect.h : rect.w;
  for (let i = 0; i < steps; i++) {
    const fill = colorAt(stops, steps === 1 ? 0 : i / (steps - 1));
    const start = (i * span) / steps;
    out.push(
      direction === 'v'
        ? { k: 'rect', x: rect.x, y: rect.y + start, w: rect.w, h: rect.h - start, fill }
        : { k: 'rect', x: rect.x + start, y: rect.y, w: rect.w - start, h: rect.h, fill },
    );
  }
  return out;
}

/**
 * A soft radial glow: concentric discs whose opacities compound toward the
 * centre. Cheap, and the only way to get a halo without a real gradient.
 */
export function glow(cx: number, cy: number, r: number, color: string, steps = 16, strength = 0.5): Shape[] {
  const each = 1 - (1 - Math.max(0, Math.min(1, strength))) ** (1 / steps);
  return Array.from({ length: steps }, (_, i): Shape => ({
    k: 'circle',
    cx,
    cy,
    r: r * (1 - i / steps),
    fill: color,
    opacity: each,
  }));
}

/** The same idea, squashed: a horizon haze or a pool of light. */
export function glowEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  steps = 16,
  strength = 0.5,
): Shape[] {
  const each = 1 - (1 - Math.max(0, Math.min(1, strength))) ** (1 / steps);
  return Array.from({ length: steps }, (_, i): Shape => {
    const k = 1 - i / steps;
    return { k: 'ellipse', cx, cy, rx: rx * k, ry: ry * k, fill: color, opacity: each };
  });
}

/** Rays fanning out from a point, the way a stadium light or a sun behaves. */
export function sunburst(cx: number, cy: number, r: number, count: number, paint: Paint): Shape[] {
  const half = (Math.PI / count) * 0.42;
  return Array.from({ length: count }, (_, i): Shape => {
    const a = (i / count) * Math.PI * 2;
    return {
      k: 'path',
      cmds: trianglePath(
        cx,
        cy,
        cx + Math.cos(a - half) * r,
        cy + Math.sin(a - half) * r,
        cx + Math.cos(a + half) * r,
        cy + Math.sin(a + half) * r,
      ),
      ...paint,
    };
  });
}

/** A checkerboard strip — a finish line, or a racing trim. */
export function checkerBand(rect: Rect, cell: number, a: string, b: string): Shape[] {
  const out: Shape[] = [{ k: 'rect', ...rect, fill: a }];
  const cols = Math.ceil(rect.w / cell);
  const rows = Math.max(1, Math.round(rect.h / cell));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0) continue;
      out.push({
        k: 'rect',
        x: rect.x + c * cell,
        y: rect.y + (r * rect.h) / rows,
        w: Math.min(cell, rect.x + rect.w - (rect.x + c * cell)),
        h: rect.h / rows,
        fill: b,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Landscape
// ---------------------------------------------------------------------------

/** A jagged skyline. `peaks` are absolute y values, evenly spaced across the span. */
export function mountainsPath(x0: number, x1: number, baseY: number, peaks: readonly number[]): PathCmd[] {
  const cmds: PathCmd[] = [{ c: 'M', x: x0, y: baseY }];
  peaks.forEach((y, i) => {
    const step = (x1 - x0) / peaks.length;
    cmds.push({ c: 'L', x: x0 + step * (i + 0.5), y });
    cmds.push({ c: 'L', x: x0 + step * (i + 1), y: baseY - (baseY - y) * 0.08 });
  });
  cmds.push({ c: 'L', x: x1, y: baseY }, { c: 'Z' });
  return cmds;
}

/** The same, rounded off into hills. */
export function hillsPath(x0: number, x1: number, baseY: number, peaks: readonly number[]): PathCmd[] {
  const step = (x1 - x0) / peaks.length;
  const cmds: PathCmd[] = [{ c: 'M', x: x0, y: baseY }];
  peaks.forEach((y, i) => {
    cmds.push({ c: 'Q', x1: x0 + step * (i + 0.5), y1: y, x: x0 + step * (i + 1), y: baseY });
  });
  cmds.push({ c: 'L', x: x1, y: baseY }, { c: 'Z' });
  return cmds;
}

// ---------------------------------------------------------------------------
// Emblems
// ---------------------------------------------------------------------------

/** A three-pointed crown standing on its band. */
export function crownPath(cx: number, cy: number, w: number, h: number): PathCmd[] {
  const left = cx - w / 2;
  const right = cx + w / 2;
  const bottom = cy + h / 2;
  const top = cy - h / 2;
  return [
    { c: 'M', x: left, y: bottom },
    { c: 'L', x: left, y: top + h * 0.28 },
    { c: 'L', x: cx - w * 0.19, y: cy + h * 0.08 },
    { c: 'L', x: cx, y: top },
    { c: 'L', x: cx + w * 0.19, y: cy + h * 0.08 },
    { c: 'L', x: right, y: top + h * 0.28 },
    { c: 'L', x: right, y: bottom },
    { c: 'Z' },
  ];
}

/** A heraldic shield, pointed at the foot. */
export function shieldPath(cx: number, cy: number, w: number, h: number): PathCmd[] {
  const half = w / 2;
  const waist = cy + h * 0.08;
  return [
    { c: 'M', x: cx - half, y: cy - h / 2 },
    { c: 'L', x: cx + half, y: cy - h / 2 },
    { c: 'L', x: cx + half, y: waist },
    { c: 'C', x1: cx + half, y1: cy + h * 0.42, x2: cx + half * 0.55, y2: cy + h * 0.34, x: cx, y: cy + h / 2 },
    { c: 'C', x1: cx - half * 0.55, y1: cy + h * 0.34, x2: cx - half, y2: cy + h * 0.42, x: cx - half, y: waist },
    { c: 'Z' },
  ];
}

/** A trophy: bowl, handles, stem and plinth. `h` is the whole height. */
export function trophyShapes(cx: number, cy: number, h: number, gold: string, shadeColor: string): Shape[] {
  const w = h * 0.62;
  const top = cy - h / 2;
  const bowlH = h * 0.52;
  return [
    // Handles first, so the bowl covers where they meet it.
    { k: 'ellipse', cx: cx - w * 0.52, cy: top + bowlH * 0.36, rx: w * 0.2, ry: bowlH * 0.3, stroke: gold, sw: h * 0.05 },
    { k: 'ellipse', cx: cx + w * 0.52, cy: top + bowlH * 0.36, rx: w * 0.2, ry: bowlH * 0.3, stroke: gold, sw: h * 0.05 },
    {
      k: 'path',
      cmds: [
        { c: 'M', x: cx - w / 2, y: top },
        { c: 'L', x: cx + w / 2, y: top },
        { c: 'Q', x1: cx + w / 2, y1: top + bowlH * 0.9, x: cx, y: top + bowlH },
        { c: 'Q', x1: cx - w / 2, y1: top + bowlH * 0.9, x: cx - w / 2, y: top },
        { c: 'Z' },
      ],
      fill: gold,
    },
    { k: 'path', cmds: [
      { c: 'M', x: cx - w * 0.3, y: top + bowlH * 0.1 },
      { c: 'Q', x1: cx - w * 0.3, y1: top + bowlH * 0.6, x: cx - w * 0.08, y: top + bowlH * 0.78 },
      { c: 'Q', x1: cx - w * 0.42, y1: top + bowlH * 0.5, x: cx - w * 0.42, y: top + bowlH * 0.1 },
      { c: 'Z' },
    ], fill: shadeColor, opacity: 0.5 },
    { k: 'rect', x: cx - w * 0.09, y: top + bowlH, w: w * 0.18, h: h * 0.19, fill: gold },
    { k: 'path', cmds: roundedRectPath(cx - w * 0.3, top + h * 0.74, w * 0.6, h * 0.08, h * 0.02), fill: gold },
    { k: 'path', cmds: roundedRectPath(cx - w * 0.45, top + h * 0.84, w * 0.9, h * 0.16, h * 0.03), fill: gold },
    { k: 'rect', x: cx - w * 0.45, y: top + h * 0.84, w: w * 0.9, h: h * 0.05, fill: shadeColor, opacity: 0.28 },
  ];
}

/** A medal hanging from a folded ribbon. */
export function medalShapes(cx: number, cy: number, r: number, ribbon: string, disc: string, ink: string): Shape[] {
  return [
    { k: 'path', cmds: trianglePath(cx - r * 0.95, cy - r * 2.5, cx - r * 0.1, cy - r * 2.5, cx - r * 0.2, cy - r * 0.2), fill: ribbon },
    { k: 'path', cmds: trianglePath(cx + r * 0.95, cy - r * 2.5, cx + r * 0.1, cy - r * 2.5, cx + r * 0.2, cy - r * 0.2), fill: shade(ribbon, 0.2) },
    { k: 'circle', cx, cy, r, fill: disc },
    { k: 'circle', cx, cy, r: r * 0.78, stroke: ink, sw: r * 0.1, opacity: 0.4 },
    { k: 'path', cmds: starPath(cx, cy, r * 0.5, 5, 0.45, -90), fill: ink, opacity: 0.75 },
  ];
}

/**
 * A laurel wreath: two mirrored fans of leaves sweeping up from the base and
 * left open at the top, the way a medal or a federation crest frames its
 * emblem.
 */
export function laurelShapes(cx: number, cy: number, r: number, color: string, leaves = 7): Shape[] {
  const out: Shape[] = [];
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < leaves; i++) {
      const t = i / (leaves - 1);
      const deg = -95 + t * 170;
      const a = (deg * Math.PI) / 180;
      const lx = cx + side * Math.cos(a) * r;
      const ly = cy - Math.sin(a) * r;
      const len = r * (0.28 + (1 - t) * 0.2);
      out.push({
        k: 'path',
        cmds: leafPath(lx, ly, len, len * 0.36, side * (90 - deg)),
        fill: color,
        opacity: 0.98 - t * 0.15,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Worlds
// ---------------------------------------------------------------------------

/** A globe: ocean, two land masses, and the meridian and equator. */
export function globeShapes(cx: number, cy: number, r: number, sea: string, land: string): Shape[] {
  return [
    { k: 'circle', cx, cy, r, fill: sea },
    { k: 'path', cmds: [
      { c: 'M', x: cx - r * 0.62, y: cy - r * 0.28 },
      { c: 'Q', x1: cx - r * 0.2, y1: cy - r * 0.75, x: cx + r * 0.1, y: cy - r * 0.4 },
      { c: 'Q', x1: cx + r * 0.3, y1: cy - r * 0.1, x: cx - r * 0.1, y: cy - r * 0.05 },
      { c: 'Q', x1: cx - r * 0.45, y1: cy, x: cx - r * 0.62, y: cy - r * 0.28 },
      { c: 'Z' },
    ], fill: land },
    { k: 'path', cmds: [
      { c: 'M', x: cx - r * 0.15, y: cy + r * 0.18 },
      { c: 'Q', x1: cx + r * 0.35, y1: cy + r * 0.1, x: cx + r * 0.55, y: cy + r * 0.5 },
      { c: 'Q', x1: cx + r * 0.1, y1: cy + r * 0.78, x: cx - r * 0.25, y: cy + r * 0.5 },
      { c: 'Z' },
    ], fill: land },
    { k: 'ellipse', cx, cy, rx: r * 0.44, ry: r, stroke: tint(sea, 0.55), sw: r * 0.055, opacity: 0.6 },
    { k: 'line', x1: cx - r, y1: cy, x2: cx + r, y2: cy, stroke: tint(sea, 0.55), sw: r * 0.055, opacity: 0.6 },
    { k: 'circle', cx, cy, r, stroke: tint(sea, 0.4), sw: r * 0.06 },
  ];
}

/** A cratered moon. */
export function moonShapes(cx: number, cy: number, r: number, body: string, crater: string): Shape[] {
  return [
    { k: 'circle', cx, cy, r, fill: body },
    { k: 'circle', cx: cx - r * 0.35, cy: cy - r * 0.3, r: r * 0.22, fill: crater, opacity: 0.75 },
    { k: 'circle', cx: cx + r * 0.28, cy: cy + r * 0.12, r: r * 0.16, fill: crater, opacity: 0.65 },
    { k: 'circle', cx: cx + r * 0.1, cy: cy - r * 0.52, r: r * 0.11, fill: crater, opacity: 0.6 },
    { k: 'circle', cx: cx - r * 0.15, cy: cy + r * 0.5, r: r * 0.13, fill: crater, opacity: 0.55 },
  ];
}

/** Dots winding out along a spiral — a galaxy, or an ammonite. */
export function spiralShapes(
  cx: number,
  cy: number,
  r: number,
  arms: number,
  dots: number,
  paint: Paint,
): Shape[] {
  const out: Shape[] = [];
  for (let arm = 0; arm < arms; arm++) {
    for (let i = 1; i <= dots; i++) {
      const t = i / dots;
      const a = (arm / arms) * Math.PI * 2 + t * Math.PI * 1.55;
      out.push({
        k: 'circle',
        cx: cx + Math.cos(a) * r * t,
        cy: cy + Math.sin(a) * r * t * 0.62,
        r: r * 0.055 * (1.15 - t * 0.7),
        ...paint,
        opacity: (paint.opacity ?? 1) * (1 - t * 0.55),
      });
    }
  }
  return out;
}

/** A flag on a pole, planted at (x, y) and flying to the right. */
export function flagShapes(x: number, y: number, h: number, pole: string, cloth: string): Shape[] {
  const w = h * 0.62;
  return [
    { k: 'rect', x: x - h * 0.02, y: y - h, w: h * 0.04, h, fill: pole },
    { k: 'path', cmds: [
      { c: 'M', x, y: y - h },
      { c: 'Q', x1: x + w * 0.55, y1: y - h + h * 0.12, x: x + w, y: y - h + h * 0.04 },
      { c: 'L', x: x + w, y: y - h + h * 0.34 },
      { c: 'Q', x1: x + w * 0.55, y1: y - h + h * 0.42, x, y: y - h + h * 0.3 },
      { c: 'Z' },
    ], fill: cloth },
  ];
}

/** A string of triangular flags between two points. */
export function buntingShapes(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  sag: number,
  count: number,
  colors: readonly string[],
  cord: string,
): Shape[] {
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2 + sag;
  const at = (t: number) => ({
    x: (1 - t) ** 2 * x0 + 2 * (1 - t) * t * midX + t * t * x1,
    y: (1 - t) ** 2 * y0 + 2 * (1 - t) * t * midY + t * t * y1,
  });
  const out: Shape[] = [
    { k: 'path', cmds: [{ c: 'M', x: x0, y: y0 }, { c: 'Q', x1: midX, y1: midY, x: x1, y: y1 }], stroke: cord, sw: 0.7 },
  ];
  const size = Math.hypot(x1 - x0, y1 - y0) / count;
  for (let i = 0; i < count; i++) {
    const p = at((i + 0.5) / count);
    out.push({
      k: 'path',
      cmds: trianglePath(p.x - size * 0.32, p.y, p.x + size * 0.32, p.y, p.x, p.y + size * 0.78),
      fill: colors[i % colors.length]!,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Things a child would recognise
// ---------------------------------------------------------------------------

const rotated = (cmds: PathCmd[], cx: number, cy: number, degrees: number): PathCmd[] =>
  degrees ? rotatePath(cmds, cx, cy, degrees) : cmds;

/** A dog bone, lying at an angle. */
export function boneShapes(cx: number, cy: number, len: number, degrees: number, paint: Paint): Shape[] {
  const w = len * 0.3;
  const knob = w * 0.34;
  const ends: [number, number][] = [
    [cx - len * 0.38, cy - knob * 0.85],
    [cx - len * 0.38, cy + knob * 0.85],
    [cx + len * 0.38, cy - knob * 0.85],
    [cx + len * 0.38, cy + knob * 0.85],
  ];
  return [
    { k: 'path', cmds: rotated(roundedRectPath(cx - len * 0.42, cy - w * 0.17, len * 0.84, w * 0.34, w * 0.17), cx, cy, degrees), ...paint },
    ...ends.map((e): Shape => ({
      k: 'path',
      cmds: rotated(ellipsePath(e[0], e[1], knob, knob), cx, cy, degrees),
      ...paint,
    })),
  ];
}

/** A fish, nose to the right before rotation. */
export function fishShapes(cx: number, cy: number, len: number, degrees: number, paint: Paint): Shape[] {
  const body = ellipsePath(cx + len * 0.06, cy, len * 0.36, len * 0.22);
  const tail = trianglePath(cx - len * 0.28, cy, cx - len * 0.5, cy - len * 0.2, cx - len * 0.5, cy + len * 0.2);
  return [
    { k: 'path', cmds: rotated(tail, cx, cy, degrees), ...paint },
    { k: 'path', cmds: rotated(body, cx, cy, degrees), ...paint },
    { k: 'path', cmds: rotated(ellipsePath(cx + len * 0.26, cy - len * 0.05, len * 0.04, len * 0.04), cx, cy, degrees), fill: '#FFFFFF', opacity: paint.opacity },
  ];
}

/** A balloon on a curling string. */
export function balloonShapes(cx: number, cy: number, r: number, fill: string): Shape[] {
  return [
    { k: 'path', cmds: [
      { c: 'M', x: cx, y: cy + r * 1.15 },
      { c: 'Q', x1: cx + r * 0.9, y1: cy + r * 2.4, x: cx + r * 0.15, y: cy + r * 3.4 },
      { c: 'Q', x1: cx - r * 0.7, y1: cy + r * 4.2, x: cx + r * 0.3, y: cy + r * 4.8 },
    ], stroke: shade(fill, 0.25), sw: r * 0.09, opacity: 0.85 },
    { k: 'ellipse', cx, cy, rx: r, ry: r * 1.18, fill },
    { k: 'path', cmds: trianglePath(cx - r * 0.16, cy + r * 1.14, cx + r * 0.16, cy + r * 1.14, cx, cy + r * 1.45), fill: shade(fill, 0.2) },
    { k: 'ellipse', cx: cx - r * 0.33, cy: cy - r * 0.42, rx: r * 0.2, ry: r * 0.3, fill: '#FFFFFF', opacity: 0.5 },
  ];
}

/** A wrapped sweet. */
export function candyShapes(cx: number, cy: number, r: number, body: string, wrap: string): Shape[] {
  return [
    { k: 'path', cmds: trianglePath(cx - r * 0.9, cy, cx - r * 2.1, cy - r * 0.8, cx - r * 2.1, cy + r * 0.8), fill: wrap },
    { k: 'path', cmds: trianglePath(cx + r * 0.9, cy, cx + r * 2.1, cy - r * 0.8, cx + r * 2.1, cy + r * 0.8), fill: wrap },
    { k: 'circle', cx, cy, r, fill: body },
    { k: 'path', cmds: [
      { c: 'M', x: cx - r * 0.7, y: cy - r * 0.4 },
      { c: 'Q', x1: cx, y1: cy - r * 1.1, x: cx + r * 0.7, y: cy - r * 0.4 },
    ], stroke: '#FFFFFF', sw: r * 0.22, opacity: 0.55, round: true },
  ];
}

/** A swirled lollipop on a stick. */
export function lollipopShapes(cx: number, cy: number, r: number, a: string, b: string): Shape[] {
  const out: Shape[] = [
    { k: 'rect', x: cx - r * 0.09, y: cy, w: r * 0.18, h: r * 2.4, rx: r * 0.09, fill: '#F2E6D8' },
    { k: 'circle', cx, cy, r, fill: a },
  ];
  // A spiral of overlapping discs reads as a swirl at any size.
  for (let i = 0; i < 22; i++) {
    const t = i / 22;
    const angle = t * Math.PI * 4;
    out.push({
      k: 'circle',
      cx: cx + Math.cos(angle) * r * 0.72 * (1 - t),
      cy: cy + Math.sin(angle) * r * 0.72 * (1 - t),
      r: r * 0.2 * (1 - t * 0.55),
      fill: i % 2 === 0 ? b : a,
    });
  }
  out.push({ k: 'circle', cx, cy, r, stroke: shade(a, 0.2), sw: r * 0.09 });
  return out;
}

// ---------------------------------------------------------------------------
// The road
// ---------------------------------------------------------------------------

/**
 * A chequered flag, hanging from a staff at (x, y) and flying to the right —
 * or to the left, if `w` is negative.
 *
 * The cloth ripples, so it cannot be a rectangle with a pattern on top: the
 * whole flag is a strip of quads following one wave, painted light first and
 * then only its dark squares, which keeps the background from showing through
 * anywhere the two colours meet.
 */
export function chequeredFlagShapes(
  x: number,
  y: number,
  w: number,
  h: number,
  degrees = 0,
  light = '#FFFFFF',
  dark = '#20242C',
  cols = 8,
  rows = 4,
): Shape[] {
  const wave = (t: number) => Math.sin(t * Math.PI * 2.1 + 0.6) * h * 0.16;
  const cell = h / rows;
  const corner = (col: number, row: number): [number, number] => {
    const t = col / cols;
    return [x + t * w, y + wave(t) - wave(0) + t * h * 0.08 + row * cell];
  };
  const cloth: PathCmd[] = [];
  for (let col = 0; col <= cols; col++) {
    const [px, py] = corner(col, 0);
    cloth.push(col === 0 ? { c: 'M', x: px, y: py } : { c: 'L', x: px, y: py });
  }
  for (let col = cols; col >= 0; col--) {
    const [px, py] = corner(col, rows);
    cloth.push({ c: 'L', x: px, y: py });
  }
  cloth.push({ c: 'Z' });

  const out: Shape[] = [{ k: 'path', cmds: rotated(cloth, x, y, degrees), fill: light }];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      if ((col + row) % 2 === 0) continue;
      const quad = [corner(col, row), corner(col + 1, row), corner(col + 1, row + 1), corner(col, row + 1)];
      out.push({
        k: 'path',
        cmds: rotated(
          quad.map(([px, py], i): PathCmd => ({ c: i === 0 ? 'M' : 'L', x: px, y: py })).concat([{ c: 'Z' }]),
          x,
          y,
          degrees,
        ),
        fill: dark,
      });
    }
  }
  return out;
}

/** A steering wheel seen head on: rim, three spokes and a hub. */
export function steeringWheelShapes(cx: number, cy: number, r: number, rim: string, hub: string): Shape[] {
  const out: Shape[] = [];
  // Two spokes falling away from the horizontal and one straight down.
  for (const deg of [160, 20, 90]) {
    const a = (deg * Math.PI) / 180;
    out.push({
      k: 'line',
      x1: cx,
      y1: cy,
      x2: cx + Math.cos(a) * r,
      y2: cy + Math.sin(a) * r,
      stroke: rim,
      sw: r * 0.17,
      round: true,
    });
  }
  out.push(
    { k: 'circle', cx, cy, r, stroke: rim, sw: r * 0.22 },
    { k: 'path', cmds: arcPath(cx, cy, r * 1.02), stroke: '#FFFFFF', sw: r * 0.06, opacity: 0.45 },
    { k: 'circle', cx, cy, r: r * 0.34, fill: rim },
    { k: 'circle', cx, cy, r: r * 0.22, fill: hub },
  );
  return out;
}

/** A traffic cone standing on its base. */
export function coneShapes(cx: number, baseY: number, h: number, body: string, band = '#FFFFFF'): Shape[] {
  // Half-width at height t, from the foot of the cone (0) to its tip (1).
  const hw = (t: number) => h * (0.3 - t * 0.21);
  const yAt = (t: number) => baseY - h * t;
  const ring = (t0: number, t1: number): Shape => ({
    k: 'path',
    cmds: [
      { c: 'M', x: cx - hw(t0), y: yAt(t0) },
      { c: 'L', x: cx + hw(t0), y: yAt(t0) },
      { c: 'L', x: cx + hw(t1), y: yAt(t1) },
      { c: 'L', x: cx - hw(t1), y: yAt(t1) },
      { c: 'Z' },
    ],
    fill: band,
  });
  return [
    { k: 'path', cmds: roundedRectPath(cx - h * 0.42, baseY - h * 0.1, h * 0.84, h * 0.1, h * 0.03), fill: shade(body, 0.25) },
    {
      k: 'path',
      cmds: [
        { c: 'M', x: cx - hw(0), y: yAt(0.02) },
        { c: 'L', x: cx - hw(0.94), y: yAt(0.94) },
        { c: 'Q', x1: cx, y1: yAt(1.06), x: cx + hw(0.94), y: yAt(0.94) },
        { c: 'L', x: cx + hw(0), y: yAt(0.02) },
        { c: 'Z' },
      ],
      fill: body,
    },
    ring(0.42, 0.58),
  ];
}

/** A traffic light on its post, all three lamps lit. */
export function trafficLightShapes(cx: number, baseY: number, h: number, post: string, box: string): Shape[] {
  const boxH = h * 0.42;
  const w = h * 0.3;
  const top = baseY - h;
  return [
    { k: 'rect', x: cx - h * 0.035, y: top + boxH * 0.7, w: h * 0.07, h: h - boxH * 0.7, fill: post },
    { k: 'path', cmds: roundedRectPath(cx - w / 2, top, w, boxH, w * 0.22), fill: box },
    ...['#E8503A', '#F5C518', '#4CC66A'].map((color, i): Shape => ({
      k: 'circle',
      cx,
      cy: top + boxH * (0.2 + i * 0.3),
      r: w * 0.2,
      fill: color,
    })),
  ];
}
