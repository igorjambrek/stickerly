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
