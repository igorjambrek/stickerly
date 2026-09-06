/**
 * Characters.
 *
 * A theme lives or dies on whether a seven-year-old recognises the thing on
 * the cover in half a second, so each of these is a bold silhouette with one
 * or two details on top rather than an illustration. They are built from the
 * same path commands as everything else, which is what lets the browser and
 * the PDF draw an identical dinosaur.
 *
 * Every figure is centred on (cx, cy) and sized by its height, so a theme can
 * drop one anywhere without doing arithmetic.
 */

import type { PathCmd, Shape } from './shapes.ts';
import { ellipsePath, roundedRectPath, starPath, trianglePath } from './shapes.ts';
import { shade, tint } from './motifs.ts';

/** A tyrannosaur in profile, facing right. */
export function dinoShapes(cx: number, cy: number, h: number, fill: string, detail?: string): Shape[] {
  const u = h;
  const p = (dx: number, dy: number): [number, number] => [cx + dx * u, cy + dy * u];
  const body: PathCmd[] = [
    { c: 'M', x: p(-0.68, 0.02)[0], y: p(-0.68, 0.02)[1] },
    { c: 'Q', x1: p(-0.4, -0.14)[0], y1: p(-0.4, -0.14)[1], x: p(-0.14, -0.08)[0], y: p(-0.14, -0.08)[1] },
    { c: 'Q', x1: p(0.02, -0.34)[0], y1: p(0.02, -0.34)[1], x: p(0.22, -0.36)[0], y: p(0.22, -0.36)[1] },
    { c: 'Q', x1: p(0.34, -0.38)[0], y1: p(0.34, -0.38)[1], x: p(0.4, -0.48)[0], y: p(0.4, -0.48)[1] },
    { c: 'Q', x1: p(0.56, -0.56)[0], y1: p(0.56, -0.56)[1], x: p(0.68, -0.42)[0], y: p(0.68, -0.42)[1] },
    { c: 'L', x: p(0.66, -0.32)[0], y: p(0.66, -0.32)[1] },
    { c: 'Q', x1: p(0.5, -0.28)[0], y1: p(0.5, -0.28)[1], x: p(0.36, -0.24)[0], y: p(0.36, -0.24)[1] },
    { c: 'Q', x1: p(0.26, -0.18)[0], y1: p(0.26, -0.18)[1], x: p(0.26, -0.04)[0], y: p(0.26, -0.04)[1] },
    { c: 'L', x: p(0.32, 0.34)[0], y: p(0.32, 0.34)[1] },
    { c: 'L', x: p(0.18, 0.34)[0], y: p(0.18, 0.34)[1] },
    { c: 'L', x: p(0.13, 0.02)[0], y: p(0.13, 0.02)[1] },
    { c: 'Q', x1: p(0.0, 0.1)[0], y1: p(0.0, 0.1)[1], x: p(-0.1, 0.06)[0], y: p(-0.1, 0.06)[1] },
    { c: 'L', x: p(-0.05, 0.34)[0], y: p(-0.05, 0.34)[1] },
    { c: 'L', x: p(-0.2, 0.34)[0], y: p(-0.2, 0.34)[1] },
    { c: 'L', x: p(-0.24, 0.04)[0], y: p(-0.24, 0.04)[1] },
    { c: 'Q', x1: p(-0.46, 0.16)[0], y1: p(-0.46, 0.16)[1], x: p(-0.68, 0.02)[0], y: p(-0.68, 0.02)[1] },
    { c: 'Z' },
  ];
  const ink = detail ?? shade(fill, 0.35);
  return [
    { k: 'path', cmds: body, fill },
    // Plates along the spine, then a tiny arm and an eye.
    ...[0.0, 0.12, 0.24].map((t): Shape => ({
      k: 'path',
      cmds: trianglePath(
        ...(p(-0.1 + t * 1.1, -0.3 - t * 0.06) as [number, number]),
        ...(p(-0.02 + t * 1.1, -0.42 - t * 0.06) as [number, number]),
        ...(p(0.06 + t * 1.1, -0.3 - t * 0.06) as [number, number]),
      ),
      fill: ink,
      opacity: 0.55,
    })),
    { k: 'path', cmds: roundedRectPath(...(p(0.2, -0.14) as [number, number]), u * 0.13, u * 0.05, u * 0.025), fill: ink, opacity: 0.5 },
    { k: 'circle', cx: p(0.5, -0.42)[0], cy: p(0.5, -0.42)[1], r: u * 0.035, fill: '#FFFFFF' },
    { k: 'circle', cx: p(0.51, -0.42)[0], cy: p(0.51, -0.42)[1], r: u * 0.018, fill: '#1A1A1A' },
  ];
}

/** A palm, trunk curving away from vertical by `lean` degrees. */
export function palmShapes(x: number, groundY: number, h: number, trunk: string, leaf: string, lean = 8): Shape[] {
  const topX = x + Math.sin((lean * Math.PI) / 180) * h;
  const topY = groundY - h;
  const out: Shape[] = [
    {
      k: 'path',
      cmds: [
        { c: 'M', x: x - h * 0.05, y: groundY },
        { c: 'Q', x1: x + (topX - x) * 0.3, y1: groundY - h * 0.55, x: topX - h * 0.025, y: topY },
        { c: 'L', x: topX + h * 0.025, y: topY },
        { c: 'Q', x1: x + (topX - x) * 0.3 + h * 0.05, y1: groundY - h * 0.55, x: x + h * 0.05, y: groundY },
        { c: 'Z' },
      ],
      fill: trunk,
    },
  ];
  for (let i = 0; i < 6; i++) {
    const a = -160 + i * 40;
    const rad = (a * Math.PI) / 180;
    const len = h * 0.42;
    out.push({
      k: 'path',
      cmds: [
        { c: 'M', x: topX, y: topY },
        { c: 'Q', x1: topX + Math.cos(rad) * len * 0.6, y1: topY + Math.sin(rad) * len * 0.6 - h * 0.1, x: topX + Math.cos(rad) * len, y: topY + Math.sin(rad) * len + h * 0.06 },
        { c: 'Q', x1: topX + Math.cos(rad) * len * 0.55, y1: topY + Math.sin(rad) * len * 0.55 + h * 0.04, x: topX, y: topY },
        { c: 'Z' },
      ],
      fill: leaf,
    });
  }
  out.push({ k: 'circle', cx: topX, cy: topY, r: h * 0.035, fill: shade(leaf, 0.25) });
  return out;
}

/** A unicorn head in profile, facing right, with a horn and a flowing mane. */
export function unicornShapes(
  cx: number,
  cy: number,
  h: number,
  coat: string,
  horn: string,
  mane: readonly string[],
): Shape[] {
  const u = h;
  const p = (dx: number, dy: number): [number, number] => [cx + dx * u, cy + dy * u];
  const head: PathCmd[] = [
    { c: 'M', x: p(-0.3, 0.5)[0], y: p(-0.3, 0.5)[1] },
    { c: 'Q', x1: p(-0.34, 0.05)[0], y1: p(-0.34, 0.05)[1], x: p(-0.2, -0.16)[0], y: p(-0.2, -0.16)[1] },
    { c: 'Q', x1: p(-0.08, -0.34)[0], y1: p(-0.08, -0.34)[1], x: p(0.1, -0.34)[0], y: p(0.1, -0.34)[1] },
    { c: 'Q', x1: p(0.3, -0.32)[0], y1: p(0.3, -0.32)[1], x: p(0.36, -0.14)[0], y: p(0.36, -0.14)[1] },
    { c: 'Q', x1: p(0.42, 0.04)[0], y1: p(0.42, 0.04)[1], x: p(0.3, 0.16)[0], y: p(0.3, 0.16)[1] },
    { c: 'Q', x1: p(0.16, 0.28)[0], y1: p(0.16, 0.28)[1], x: p(0.1, 0.5)[0], y: p(0.1, 0.5)[1] },
    { c: 'Z' },
  ];
  const out: Shape[] = [];
  // Mane first: it streams out behind the head.
  mane.forEach((color, i) => {
    const t = i / Math.max(1, mane.length - 1);
    out.push({
      k: 'path',
      cmds: [
        { c: 'M', x: p(-0.16, -0.2 + t * 0.18)[0], y: p(-0.16, -0.2 + t * 0.18)[1] },
        { c: 'Q', x1: p(-0.62 - t * 0.16, -0.16 + t * 0.2)[0], y1: p(-0.62 - t * 0.16, -0.16 + t * 0.2)[1], x: p(-0.5 - t * 0.14, 0.26 + t * 0.16)[0], y: p(-0.5 - t * 0.14, 0.26 + t * 0.16)[1] },
        { c: 'Q', x1: p(-0.34, 0.1 + t * 0.14)[0], y1: p(-0.34, 0.1 + t * 0.14)[1], x: p(-0.14, -0.12 + t * 0.18)[0], y: p(-0.14, -0.12 + t * 0.18)[1] },
        { c: 'Z' },
      ],
      fill: color,
    });
  });
  out.push(
    { k: 'path', cmds: head, fill: coat },
    // Ear, horn, eye, nostril.
    { k: 'path', cmds: trianglePath(...(p(-0.02, -0.3) as [number, number]), ...(p(-0.14, -0.5) as [number, number]), ...(p(0.06, -0.38) as [number, number])), fill: coat },
    { k: 'path', cmds: trianglePath(...(p(0.06, -0.34) as [number, number]), ...(p(0.16, -0.78) as [number, number]), ...(p(0.2, -0.3) as [number, number])), fill: horn },
    { k: 'path', cmds: [
      { c: 'M', x: p(0.09, -0.5)[0], y: p(0.09, -0.5)[1] },
      { c: 'L', x: p(0.18, -0.47)[0], y: p(0.18, -0.47)[1] },
      { c: 'M', x: p(0.12, -0.62)[0], y: p(0.12, -0.62)[1] },
      { c: 'L', x: p(0.175, -0.6)[0], y: p(0.175, -0.6)[1] },
    ], stroke: shade(horn, 0.25), sw: u * 0.02 },
    { k: 'circle', cx: p(0.2, -0.14)[0], cy: p(0.2, -0.14)[1], r: u * 0.035, fill: '#3A2A4A' },
    { k: 'circle', cx: p(0.215, -0.152)[0], cy: p(0.215, -0.152)[1], r: u * 0.013, fill: '#FFFFFF' },
    { k: 'ellipse', cx: p(0.33, 0.04)[0], cy: p(0.33, 0.04)[1], rx: u * 0.022, ry: u * 0.03, fill: shade(coat, 0.25) },
  );
  return out;
}

/** A cat's face: ears, whiskers, and not much else. */
export function catFaceShapes(cx: number, cy: number, r: number, coat: string, inner: string): Shape[] {
  const ink = shade(coat, 0.55);
  return [
    { k: 'path', cmds: trianglePath(cx - r * 0.86, cy - r * 0.5, cx - r * 0.78, cy - r * 1.35, cx - r * 0.16, cy - r * 0.86), fill: coat },
    { k: 'path', cmds: trianglePath(cx + r * 0.86, cy - r * 0.5, cx + r * 0.78, cy - r * 1.35, cx + r * 0.16, cy - r * 0.86), fill: coat },
    { k: 'path', cmds: trianglePath(cx - r * 0.72, cy - r * 0.6, cx - r * 0.68, cy - r * 1.1, cx - r * 0.3, cy - r * 0.8), fill: inner },
    { k: 'path', cmds: trianglePath(cx + r * 0.72, cy - r * 0.6, cx + r * 0.68, cy - r * 1.1, cx + r * 0.3, cy - r * 0.8), fill: inner },
    { k: 'ellipse', cx, cy, rx: r, ry: r * 0.88, fill: coat },
    { k: 'ellipse', cx: cx - r * 0.36, cy: cy - r * 0.1, rx: r * 0.1, ry: r * 0.14, fill: ink },
    { k: 'ellipse', cx: cx + r * 0.36, cy: cy - r * 0.1, rx: r * 0.1, ry: r * 0.14, fill: ink },
    { k: 'path', cmds: trianglePath(cx - r * 0.12, cy + r * 0.2, cx + r * 0.12, cy + r * 0.2, cx, cy + r * 0.36), fill: inner },
    { k: 'path', cmds: [
      { c: 'M', x: cx - r * 0.05, y: cy + r * 0.36 },
      { c: 'Q', x1: cx - r * 0.22, y1: cy + r * 0.56, x: cx - r * 0.34, y: cy + r * 0.36 },
      { c: 'M', x: cx + r * 0.05, y: cy + r * 0.36 },
      { c: 'Q', x1: cx + r * 0.22, y1: cy + r * 0.56, x: cx + r * 0.34, y: cy + r * 0.36 },
    ], stroke: ink, sw: r * 0.07, round: true },
    ...[-1, 1].flatMap((s) => [0.12, 0.32].map((dy): Shape => ({
      k: 'line',
      x1: cx + s * r * 0.5,
      y1: cy + r * dy,
      x2: cx + s * r * 1.35,
      y2: cy + r * (dy - 0.14),
      stroke: ink,
      sw: r * 0.055,
      opacity: 0.75,
      round: true,
    }))),
  ];
}

/** A dog's face, floppy-eared. */
export function dogFaceShapes(cx: number, cy: number, r: number, coat: string, patch: string): Shape[] {
  const ink = shade(coat, 0.6);
  return [
    { k: 'ellipse', cx: cx - r * 0.92, cy: cy + r * 0.08, rx: r * 0.34, ry: r * 0.72, fill: patch },
    { k: 'ellipse', cx: cx + r * 0.92, cy: cy + r * 0.08, rx: r * 0.34, ry: r * 0.72, fill: patch },
    { k: 'ellipse', cx, cy, rx: r, ry: r * 0.9, fill: coat },
    { k: 'ellipse', cx: cx - r * 0.42, cy: cy - r * 0.28, rx: r * 0.3, ry: r * 0.26, fill: patch, opacity: 0.75 },
    { k: 'circle', cx: cx - r * 0.36, cy: cy - r * 0.12, r: r * 0.11, fill: ink },
    { k: 'circle', cx: cx + r * 0.36, cy: cy - r * 0.12, r: r * 0.11, fill: ink },
    { k: 'ellipse', cx, cy: cy + r * 0.34, rx: r * 0.55, ry: r * 0.42, fill: tint(coat, 0.35) },
    { k: 'ellipse', cx, cy: cy + r * 0.2, rx: r * 0.17, ry: r * 0.13, fill: ink },
    { k: 'path', cmds: [
      { c: 'M', x: cx, y: cy + r * 0.32 },
      { c: 'L', x: cx, y: cy + r * 0.46 },
      { c: 'M', x: cx - r * 0.02, y: cy + r * 0.46 },
      { c: 'Q', x1: cx - r * 0.22, y1: cy + r * 0.66, x: cx - r * 0.3, y: cy + r * 0.44 },
      { c: 'M', x: cx + r * 0.02, y: cy + r * 0.46 },
      { c: 'Q', x1: cx + r * 0.22, y1: cy + r * 0.66, x: cx + r * 0.3, y: cy + r * 0.44 },
    ], stroke: ink, sw: r * 0.07, round: true },
  ];
}

/** A rocket standing on its flame. */
export function rocketShapes(
  cx: number,
  cy: number,
  h: number,
  body: string,
  window: string,
  fin: string,
  flame?: readonly [string, string],
): Shape[] {
  const w = h * 0.42;
  const top = cy - h / 2;
  const bodyBottom = cy + h * 0.22;
  const out: Shape[] = [];
  if (flame) {
    out.push(
      { k: 'path', cmds: [
        { c: 'M', x: cx - w * 0.3, y: bodyBottom - h * 0.02 },
        { c: 'Q', x1: cx, y1: cy + h * 0.72, x: cx + w * 0.3, y: bodyBottom - h * 0.02 },
        { c: 'Z' },
      ], fill: flame[0] },
      { k: 'path', cmds: [
        { c: 'M', x: cx - w * 0.16, y: bodyBottom - h * 0.02 },
        { c: 'Q', x1: cx, y1: cy + h * 0.52, x: cx + w * 0.16, y: bodyBottom - h * 0.02 },
        { c: 'Z' },
      ], fill: flame[1] },
    );
  }
  out.push(
    { k: 'path', cmds: trianglePath(cx - w * 0.5, cy + h * 0.02, cx - w * 1.05, cy + h * 0.3, cx - w * 0.5, cy + h * 0.22), fill: fin },
    { k: 'path', cmds: trianglePath(cx + w * 0.5, cy + h * 0.02, cx + w * 1.05, cy + h * 0.3, cx + w * 0.5, cy + h * 0.22), fill: fin },
    { k: 'path', cmds: [
      { c: 'M', x: cx, y: top },
      { c: 'Q', x1: cx + w * 0.6, y1: cy - h * 0.14, x: cx + w * 0.5, y: bodyBottom },
      { c: 'L', x: cx - w * 0.5, y: bodyBottom },
      { c: 'Q', x1: cx - w * 0.6, y1: cy - h * 0.14, x: cx, y: top },
      { c: 'Z' },
    ], fill: body },
    { k: 'path', cmds: [
      { c: 'M', x: cx, y: top },
      { c: 'Q', x1: cx + w * 0.6, y1: cy - h * 0.14, x: cx + w * 0.5, y: bodyBottom },
      { c: 'L', x: cx + w * 0.16, y: bodyBottom },
      { c: 'Q', x1: cx + w * 0.3, y1: cy - h * 0.16, x: cx, y: top },
      { c: 'Z' },
    ], fill: shade(body, 0.12) },
    { k: 'circle', cx, cy: cy - h * 0.12, r: w * 0.26, fill: window },
    { k: 'circle', cx, cy: cy - h * 0.12, r: w * 0.26, stroke: shade(body, 0.35), sw: h * 0.018 },
    { k: 'rect', x: cx - w * 0.5, y: bodyBottom - h * 0.05, w, h: h * 0.05, fill: fin },
  );
  return out;
}

/** A scalloped rosette, the kind pinned on a sports day. */
export function rosetteShapes(cx: number, cy: number, r: number, ribbon: string, disc: string, ink: string): Shape[] {
  return [
    { k: 'path', cmds: trianglePath(cx - r * 0.55, cy + r * 0.4, cx - r * 0.1, cy + r * 0.4, cx - r * 0.62, cy + r * 2.1), fill: shade(ribbon, 0.15) },
    { k: 'path', cmds: trianglePath(cx + r * 0.55, cy + r * 0.4, cx + r * 0.1, cy + r * 0.4, cx + r * 0.62, cy + r * 2.1), fill: shade(ribbon, 0.15) },
    { k: 'path', cmds: starPath(cx, cy, r, 16, 0.84, -90), fill: ribbon },
    { k: 'circle', cx, cy, r: r * 0.68, fill: disc },
    { k: 'circle', cx, cy, r: r * 0.68, stroke: shade(ribbon, 0.1), sw: r * 0.07 },
    { k: 'path', cmds: starPath(cx, cy, r * 0.38, 5, 0.45, -90), fill: ink },
  ];
}

/** A schoolhouse, seen head on. */
export function schoolShapes(cx: number, baseY: number, w: number, wall: string, roof: string, glass: string): Shape[] {
  const h = w * 0.62;
  const out: Shape[] = [
    { k: 'rect', x: cx - w / 2, y: baseY - h, w, h, fill: wall },
    { k: 'path', cmds: trianglePath(cx - w * 0.58, baseY - h, cx + w * 0.58, baseY - h, cx, baseY - h * 1.55), fill: roof },
    { k: 'rect', x: cx - w * 0.04, y: baseY - h * 1.9, w: w * 0.08, h: h * 0.42, fill: roof },
    { k: 'path', cmds: trianglePath(cx - w * 0.06, baseY - h * 1.88, cx + w * 0.06, baseY - h * 1.88, cx, baseY - h * 2.1), fill: shade(roof, 0.2) },
    { k: 'rect', x: cx - w * 0.11, y: baseY - h * 0.62, w: w * 0.22, h: h * 0.62, rx: w * 0.11, fill: shade(wall, 0.35) },
  ];
  for (const dx of [-0.32, 0.32]) {
    out.push(
      { k: 'rect', x: cx + w * dx - w * 0.11, y: baseY - h * 0.82, w: w * 0.22, h: h * 0.32, rx: w * 0.02, fill: glass },
      { k: 'line', x1: cx + w * dx, y1: baseY - h * 0.82, x2: cx + w * dx, y2: baseY - h * 0.5, stroke: wall, sw: w * 0.015 },
    );
  }
  out.push({ k: 'circle', cx, cy: baseY - h * 1.24, r: w * 0.09, fill: glass });
  out.push({ k: 'path', cmds: [
    { c: 'M', x: cx, y: baseY - h * 1.28 },
    { c: 'L', x: cx, y: baseY - h * 1.24 },
    { c: 'L', x: cx + w * 0.05, y: baseY - h * 1.24 },
  ], stroke: shade(wall, 0.5), sw: w * 0.014 });
  return out;
}

/** An erupting volcano, with lava running down its flank. */
export function volcanoShapes(cx: number, baseY: number, h: number, rock: string, lava: string): Shape[] {
  const w = h * 1.9;
  return [
    { k: 'path', cmds: [
      { c: 'M', x: cx - w / 2, y: baseY },
      { c: 'L', x: cx - h * 0.22, y: baseY - h },
      { c: 'L', x: cx + h * 0.22, y: baseY - h },
      { c: 'L', x: cx + w / 2, y: baseY },
      { c: 'Z' },
    ], fill: rock },
    { k: 'path', cmds: [
      { c: 'M', x: cx - h * 0.22, y: baseY - h },
      { c: 'Q', x1: cx, y1: baseY - h * 0.92, x: cx + h * 0.22, y: baseY - h },
      { c: 'Q', x1: cx + h * 0.1, y1: baseY - h * 0.72, x: cx + h * 0.18, y: baseY - h * 0.5 },
      { c: 'Q', x1: cx + h * 0.02, y1: baseY - h * 0.3, x: cx + h * 0.12, y: baseY },
      { c: 'L', x: cx - h * 0.06, y: baseY },
      { c: 'Q', x1: cx - h * 0.14, y1: baseY - h * 0.44, x: cx - h * 0.2, y: baseY - h * 0.72 },
      { c: 'Z',
      },
    ], fill: lava },
    { k: 'ellipse', cx, cy: baseY - h, rx: h * 0.23, ry: h * 0.06, fill: tint(lava, 0.3) },
    ...[[-0.5, 0.5], [0.1, 0.85], [0.62, 0.42]].map(([dx, s]): Shape => ({
      k: 'path',
      cmds: ellipsePath(cx + h * dx!, baseY - h * (1.18 + s! * 0.35), h * 0.09 * s!, h * 0.07 * s!),
      fill: shade(rock, 0.15),
      opacity: 0.85,
    })),
  ];
}

/** How a car is painted, beyond its body colour. */
export interface CarPaint {
  /** Windows; set it to the body colour for a flat silhouette. */
  glass?: string;
  tyre?: string;
  rim?: string;
  /** -1 turns the car around to face left. */
  facing?: 1 | -1;
}

/**
 * A road car in profile, facing right — or left, if `facing` is -1.
 *
 * `len` is bumper to bumper and every other measurement follows from it, so a
 * scene sizes a car by the one number it can judge. The car is centred on
 * (cx, cy) horizontally and vertically about its body, with the tyres reaching
 * `len * 0.16` below cy — a road places a car by its middle and the wheels
 * land on the tarmac.
 */
export function carShapes(
  cx: number,
  cy: number,
  len: number,
  body: string,
  { glass = '#CFE9FB', tyre = '#23262E', rim = '#DDE3EA', facing = 1 }: CarPaint = {},
): Shape[] {
  const u = len;
  const ink = shade(body, 0.45);
  const X = (dx: number) => cx + dx * facing * u;
  const Y = (dy: number) => cy + dy * u;
  const M = (dx: number, dy: number): PathCmd => ({ c: 'M', x: X(dx), y: Y(dy) });
  const L = (dx: number, dy: number): PathCmd => ({ c: 'L', x: X(dx), y: Y(dy) });
  const Q = (dx1: number, dy1: number, dx: number, dy: number): PathCmd => ({
    c: 'Q',
    x1: X(dx1),
    y1: Y(dy1),
    x: X(dx),
    y: Y(dy),
  });
  /** A box given in car units, laid out left-to-right whichever way it faces. */
  const box = (dx0: number, dy0: number, dx1: number, dy1: number, r = 0): PathCmd[] =>
    roundedRectPath(Math.min(X(dx0), X(dx1)), Y(dy0), Math.abs(X(dx1) - X(dx0)), (dy1 - dy0) * u, r * u);

  const shell: PathCmd[] = [
    M(-0.5, 0.055),
    L(-0.5, -0.015),
    Q(-0.5, -0.058, -0.435, -0.062),
    L(-0.355, -0.066),
    // Rear screen up to the roof, a flat run, then the windscreen and bonnet.
    Q(-0.315, -0.185, -0.225, -0.2),
    L(0.005, -0.205),
    Q(0.1, -0.202, 0.15, -0.078),
    L(0.35, -0.068),
    Q(0.475, -0.058, 0.5, 0.005),
    L(0.5, 0.055),
    { c: 'Z' },
  ];
  const greenhouse: PathCmd[] = [
    M(-0.33, -0.085),
    Q(-0.288, -0.172, -0.215, -0.182),
    L(-0.012, -0.187),
    Q(0.068, -0.184, 0.108, -0.088),
    { c: 'Z' },
  ];
  const wheel = (dx: number): Shape[] => [
    { k: 'circle', cx: X(dx), cy: Y(0.055), r: u * 0.105, fill: tyre },
    { k: 'circle', cx: X(dx), cy: Y(0.055), r: u * 0.056, fill: rim },
    { k: 'circle', cx: X(dx), cy: Y(0.055), r: u * 0.02, fill: shade(rim, 0.35) },
  ];

  return [
    { k: 'path', cmds: shell, fill: body },
    // A darker sill, so the car has a bottom rather than floating on the road.
    { k: 'path', cmds: box(-0.49, 0.028, 0.49, 0.055), fill: ink, opacity: 0.3 },
    { k: 'path', cmds: greenhouse, fill: glass },
    { k: 'path', cmds: box(-0.13, -0.19, -0.1, -0.085), fill: body },
    { k: 'line', x1: X(-0.1), y1: Y(-0.082), x2: X(-0.095), y2: Y(0.03), stroke: ink, sw: u * 0.006, opacity: 0.35 },
    { k: 'path', cmds: box(-0.045, -0.052, 0.005, -0.038, 0.007), fill: ink, opacity: 0.5 },
    { k: 'ellipse', cx: X(0.442), cy: Y(-0.03), rx: u * 0.026, ry: u * 0.02, fill: '#FFF3C4' },
    { k: 'path', cmds: box(-0.486, -0.038, -0.458, -0.014, 0.007), fill: '#E8503A' },
    ...wheel(-0.3),
    ...wheel(0.295),
  ];
}

/**
 * A single-seater in profile, facing right: wings, sidepod, airbox and a
 * helmet in the cockpit. Sized and placed the same way as `carShapes`, with
 * the tyres reaching `len * 0.147` below cy.
 */
export function raceCarShapes(
  cx: number,
  cy: number,
  len: number,
  body: string,
  accent: string,
  helmet = '#F2F4F8',
): Shape[] {
  const u = len;
  const X = (dx: number) => cx + dx * u;
  const Y = (dy: number) => cy + dy * u;
  const M = (dx: number, dy: number): PathCmd => ({ c: 'M', x: X(dx), y: Y(dy) });
  const L = (dx: number, dy: number): PathCmd => ({ c: 'L', x: X(dx), y: Y(dy) });
  const Q = (dx1: number, dy1: number, dx: number, dy: number): PathCmd => ({
    c: 'Q',
    x1: X(dx1),
    y1: Y(dy1),
    x: X(dx),
    y: Y(dy),
  });
  const box = (dx0: number, dy0: number, dx1: number, dy1: number, r = 0): PathCmd[] =>
    roundedRectPath(X(dx0), Y(dy0), (dx1 - dx0) * u, (dy1 - dy0) * u, r * u);

  const chassis: PathCmd[] = [
    M(-0.44, 0.05),
    L(0.16, 0.052),
    // The nose, out to its tip and back along the top to the cockpit.
    Q(0.34, 0.05, 0.47, 0.024),
    L(0.47, 0.0),
    Q(0.32, -0.026, 0.16, -0.04),
    L(0.1, -0.044),
    L(0.055, -0.088),
    L(-0.028, -0.09),
    // Up over the airbox, then down the engine cover to the rear axle.
    Q(-0.1, -0.092, -0.14, -0.15),
    L(-0.185, -0.155),
    Q(-0.215, -0.1, -0.27, -0.072),
    L(-0.44, -0.05),
    { c: 'Z' },
  ];
  const sidepod: PathCmd[] = [
    M(-0.26, 0.05),
    L(0.0, 0.05),
    L(0.0, -0.005),
    Q(-0.03, -0.038, -0.1, -0.04),
    L(-0.2, -0.04),
    Q(-0.26, -0.04, -0.26, 0.005),
    { c: 'Z' },
  ];
  const wheel = (dx: number): Shape[] => [
    { k: 'circle', cx: X(dx), cy: Y(0.022), r: u * 0.125, fill: '#23262E' },
    { k: 'circle', cx: X(dx), cy: Y(0.022), r: u * 0.125, stroke: '#3A3F4A', sw: u * 0.012 },
    { k: 'circle', cx: X(dx), cy: Y(0.022), r: u * 0.055, fill: '#C9CFD8' },
    { k: 'circle', cx: X(dx), cy: Y(0.022), r: u * 0.018, fill: '#8B94A2' },
  ];

  return [
    // Rear wing first: the support disappears behind the engine cover.
    { k: 'path', cmds: box(-0.45, -0.16, -0.412, 0.03), fill: shade(body, 0.3) },
    { k: 'path', cmds: box(-0.5, -0.185, -0.30, -0.155, 0.008), fill: shade(accent, 0.12) },
    { k: 'path', cmds: box(-0.485, -0.142, -0.325, -0.122, 0.006), fill: accent },
    { k: 'path', cmds: box(-0.5, -0.195, -0.455, -0.09, 0.008), fill: accent },
    // Front wing, low and wide.
    { k: 'path', cmds: box(0.30, 0.046, 0.52, 0.078, 0.006), fill: accent },
    { k: 'path', cmds: box(0.475, 0.012, 0.52, 0.086, 0.008), fill: shade(accent, 0.12) },
    { k: 'path', cmds: box(-0.42, 0.05, 0.2, 0.062), fill: '#1F2229' },
    { k: 'path', cmds: chassis, fill: body },
    { k: 'path', cmds: sidepod, fill: shade(body, 0.18) },
    { k: 'path', cmds: box(-0.25, -0.005, -0.02, 0.012, 0.006), fill: accent },
    { k: 'path', cmds: box(0.18, -0.03, 0.42, -0.012, 0.006), fill: accent, opacity: 0.9 },
    // The driver: a helmet in the cockpit opening, visor forward.
    { k: 'circle', cx: X(0.0), cy: Y(-0.125), r: u * 0.055, fill: helmet },
    { k: 'path', cmds: box(-0.05, -0.14, 0.04, -0.122, 0.009), fill: accent },
    { k: 'ellipse', cx: X(0.024), cy: Y(-0.122), rx: u * 0.031, ry: u * 0.019, fill: '#2A2E38' },
    ...wheel(-0.3),
    ...wheel(0.265),
  ];
}
