/**
 * A tiny drawing vocabulary that both renderers understand.
 *
 * Template artwork is described as data, never as SVG markup or PDF calls, so
 * the browser and the PDF generator draw the same picture from the same
 * numbers. Paths are structured commands rather than `d` strings so the PDF
 * side can flip them into y-up space without parsing anything.
 *
 * Coordinates are millimetres, y-down, relative to the shape's container.
 */

export interface Paint {
  fill?: string;
  stroke?: string;
  /** Stroke width in mm. */
  sw?: number;
  opacity?: number;
  /** Dash pattern in mm. */
  dash?: number[];
  /** Rounded line ends, for a softer hand-drawn look. */
  round?: boolean;
}

export type PathCmd =
  | { c: 'M'; x: number; y: number }
  | { c: 'L'; x: number; y: number }
  | { c: 'Q'; x1: number; y1: number; x: number; y: number }
  | { c: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { c: 'Z' };

export type Shape =
  | ({ k: 'rect'; x: number; y: number; w: number; h: number; rx?: number } & Paint)
  | ({ k: 'circle'; cx: number; cy: number; r: number } & Paint)
  | ({ k: 'ellipse'; cx: number; cy: number; rx: number; ry: number } & Paint)
  | ({ k: 'line'; x1: number; y1: number; x2: number; y2: number } & Paint)
  | ({ k: 'path'; cmds: PathCmd[] } & Paint);

const n = (v: number) => Math.round(v * 1000) / 1000;

/** Serialise structured commands into an SVG path `d` attribute (y-down). */
export function pathToSvgD(cmds: PathCmd[]): string {
  return cmds
    .map((c) => {
      switch (c.c) {
        case 'M':
          return `M${n(c.x)},${n(c.y)}`;
        case 'L':
          return `L${n(c.x)},${n(c.y)}`;
        case 'Q':
          return `Q${n(c.x1)},${n(c.y1)} ${n(c.x)},${n(c.y)}`;
        case 'C':
          return `C${n(c.x1)},${n(c.y1)} ${n(c.x2)},${n(c.y2)} ${n(c.x)},${n(c.y)}`;
        case 'Z':
          return 'Z';
      }
    })
    .join(' ');
}

/** Apply a point transform to every coordinate in a path. */
export function mapPath(cmds: PathCmd[], f: (x: number, y: number) => [number, number]): PathCmd[] {
  return cmds.map((c): PathCmd => {
    switch (c.c) {
      case 'M':
      case 'L': {
        const [x, y] = f(c.x, c.y);
        return { c: c.c, x, y };
      }
      case 'Q': {
        const [x1, y1] = f(c.x1, c.y1);
        const [x, y] = f(c.x, c.y);
        return { c: 'Q', x1, y1, x, y };
      }
      case 'C': {
        const [x1, y1] = f(c.x1, c.y1);
        const [x2, y2] = f(c.x2, c.y2);
        const [x, y] = f(c.x, c.y);
        return { c: 'C', x1, y1, x2, y2, x, y };
      }
      case 'Z':
        return { c: 'Z' };
    }
  });
}

export const translatePath = (cmds: PathCmd[], dx: number, dy: number): PathCmd[] =>
  mapPath(cmds, (x, y) => [x + dx, y + dy]);

export function rotatePath(cmds: PathCmd[], cx: number, cy: number, degrees: number): PathCmd[] {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return mapPath(cmds, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  });
}

// ---------------------------------------------------------------------------
// Path builders
// ---------------------------------------------------------------------------

export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): PathCmd[] {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return [
    { c: 'M', x: x + rr, y },
    { c: 'L', x: x + w - rr, y },
    { c: 'Q', x1: x + w, y1: y, x: x + w, y: y + rr },
    { c: 'L', x: x + w, y: y + h - rr },
    { c: 'Q', x1: x + w, y1: y + h, x: x + w - rr, y: y + h },
    { c: 'L', x: x + rr, y: y + h },
    { c: 'Q', x1: x, y1: y + h, x, y: y + h - rr },
    { c: 'L', x, y: y + rr },
    { c: 'Q', x1: x, y1: y, x: x + rr, y },
    { c: 'Z' },
  ];
}

export function starPath(cx: number, cy: number, r: number, points = 5, innerRatio = 0.45, rotation = -90): PathCmd[] {
  const cmds: PathCmd[] = [];
  const step = Math.PI / points;
  const start = (rotation * Math.PI) / 180;
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * innerRatio;
    const a = start + i * step;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    cmds.push(i === 0 ? { c: 'M', x, y } : { c: 'L', x, y });
  }
  cmds.push({ c: 'Z' });
  return cmds;
}

/** A regular polygon. `rotation` is where the first vertex points, in degrees. */
export function polygonPath(cx: number, cy: number, r: number, sides: number, rotation = -90): PathCmd[] {
  const cmds: PathCmd[] = [];
  const start = (rotation * Math.PI) / 180;
  for (let i = 0; i < sides; i++) {
    const a = start + (i * 2 * Math.PI) / sides;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    cmds.push(i === 0 ? { c: 'M', x, y } : { c: 'L', x, y });
  }
  cmds.push({ c: 'Z' });
  return cmds;
}

export function heartPath(cx: number, cy: number, w: number, h = w): PathCmd[] {
  return [
    { c: 'M', x: cx, y: cy + h * 0.38 },
    { c: 'C', x1: cx - w * 0.52, y1: cy - h * 0.04, x2: cx - w * 0.5, y2: cy - h * 0.46, x: cx - w * 0.22, y: cy - h * 0.46 },
    { c: 'C', x1: cx - w * 0.08, y1: cy - h * 0.46, x2: cx, y2: cy - h * 0.3, x: cx, y: cy - h * 0.16 },
    { c: 'C', x1: cx, y1: cy - h * 0.3, x2: cx + w * 0.08, y2: cy - h * 0.46, x: cx + w * 0.22, y: cy - h * 0.46 },
    { c: 'C', x1: cx + w * 0.5, y1: cy - h * 0.46, x2: cx + w * 0.52, y2: cy - h * 0.04, x: cx, y: cy + h * 0.38 },
    { c: 'Z' },
  ];
}

/** A pointed oval, used for leaves and petals. Rotated about its own centre. */
export function leafPath(cx: number, cy: number, len: number, wid: number, degrees = 0): PathCmd[] {
  const cmds: PathCmd[] = [
    { c: 'M', x: cx, y: cy - len / 2 },
    { c: 'Q', x1: cx + wid, y1: cy, x: cx, y: cy + len / 2 },
    { c: 'Q', x1: cx - wid, y1: cy, x: cx, y: cy - len / 2 },
    { c: 'Z' },
  ];
  return degrees ? rotatePath(cmds, cx, cy, degrees) : cmds;
}

export function trianglePath(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): PathCmd[] {
  return [
    { c: 'M', x: x1, y: y1 },
    { c: 'L', x: x2, y: y2 },
    { c: 'L', x: x3, y: y3 },
    { c: 'Z' },
  ];
}

/** A half-circle arc, meant to be stroked rather than filled. Used for rainbows. */
export function arcPath(cx: number, cy: number, r: number): PathCmd[] {
  const k = 0.5523 * r;
  return [
    { c: 'M', x: cx - r, y: cy },
    { c: 'C', x1: cx - r, y1: cy - k, x2: cx - k, y2: cy - r, x: cx, y: cy - r },
    { c: 'C', x1: cx + k, y1: cy - r, x2: cx + r, y2: cy - k, x: cx + r, y: cy },
  ];
}

/** A four-pointed sparkle with concave sides. */
export function sparklePath(cx: number, cy: number, r: number): PathCmd[] {
  const i = r * 0.18;
  return [
    { c: 'M', x: cx, y: cy - r },
    { c: 'Q', x1: cx + i, y1: cy - i, x: cx + r, y: cy },
    { c: 'Q', x1: cx + i, y1: cy + i, x: cx, y: cy + r },
    { c: 'Q', x1: cx - i, y1: cy + i, x: cx - r, y: cy },
    { c: 'Q', x1: cx - i, y1: cy - i, x: cx, y: cy - r },
    { c: 'Z' },
  ];
}

// ---------------------------------------------------------------------------
// Composite motifs
// ---------------------------------------------------------------------------

/** A paw print: one pad and four toes. */
export function pawShapes(cx: number, cy: number, size: number, paint: Paint): Shape[] {
  const s = size / 10;
  const toes: [number, number, number][] = [
    [-3.1, -1.6, 1.15],
    [-1.05, -3.4, 1.25],
    [1.05, -3.4, 1.25],
    [3.1, -1.6, 1.15],
  ];
  return [
    ...toes.map(([dx, dy, r]): Shape => ({
      k: 'ellipse',
      cx: cx + dx * s,
      cy: cy + dy * s,
      rx: r * s,
      ry: r * s * 1.15,
      ...paint,
    })),
    { k: 'ellipse', cx, cy: cy + 1.6 * s, rx: 3.4 * s, ry: 2.9 * s, ...paint },
  ];
}

/** A fluffy cloud built from overlapping circles. */
export function cloudShapes(cx: number, cy: number, w: number, paint: Paint): Shape[] {
  const u = w / 10;
  return [
    { k: 'circle', cx: cx - 2.8 * u, cy, r: 2.1 * u, ...paint },
    { k: 'circle', cx: cx - 0.4 * u, cy: cy - 1.1 * u, r: 2.9 * u, ...paint },
    { k: 'circle', cx: cx + 2.6 * u, cy, r: 2.2 * u, ...paint },
    { k: 'rect', x: cx - 3.4 * u, y: cy - 0.3 * u, w: 6.6 * u, h: 2.4 * u, rx: 1.2 * u, ...paint },
  ];
}

/** A ringed planet. */
export function planetShapes(cx: number, cy: number, r: number, body: string, ring: string): Shape[] {
  return [
    { k: 'circle', cx, cy, r, fill: body },
    { k: 'circle', cx: cx - r * 0.34, cy: cy - r * 0.28, r: r * 0.2, fill: ring, opacity: 0.4 },
    { k: 'circle', cx: cx + r * 0.4, cy: cy + r * 0.35, r: r * 0.13, fill: ring, opacity: 0.3 },
    { k: 'ellipse', cx, cy, rx: r * 1.75, ry: r * 0.42, stroke: ring, sw: r * 0.16 },
  ];
}

/** A classic black-and-white football: a centre pentagon ringed by five more. */
export function ballShapes(cx: number, cy: number, r: number, light: string, dark: string): Shape[] {
  const shapes: Shape[] = [{ k: 'circle', cx, cy, r, fill: light, stroke: dark, sw: r * 0.08 }];
  shapes.push({ k: 'path', cmds: polygonPath(cx, cy, r * 0.34, 5, -90), fill: dark });
  for (let i = 0; i < 5; i++) {
    const deg = i * 72 - 90;
    const a = (deg * Math.PI) / 180;
    shapes.push({
      k: 'path',
      // Each outer pentagon points away from the centre, as on a real ball.
      cmds: polygonPath(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, r * 0.3, 5, deg),
      fill: dark,
    });
  }
  return shapes;
}

/** A three-toed dinosaur footprint. */
export function footprintShapes(cx: number, cy: number, size: number, paint: Paint): Shape[] {
  const s = size / 10;
  return [
    { k: 'ellipse', cx, cy: cy + 1.6 * s, rx: 2.6 * s, ry: 3.1 * s, ...paint },
    { k: 'path', cmds: leafPath(cx - 3.1 * s, cy - 1.6 * s, 5 * s, 1.5 * s, -28), ...paint },
    { k: 'path', cmds: leafPath(cx, cy - 3.2 * s, 5.4 * s, 1.6 * s, 0), ...paint },
    { k: 'path', cmds: leafPath(cx + 3.1 * s, cy - 1.6 * s, 5 * s, 1.5 * s, 28), ...paint },
  ];
}

/** A pencil lying at an angle. */
export function pencilShapes(
  cx: number,
  cy: number,
  len: number,
  degrees: number,
  body: string,
  wood: string,
  lead: string,
): Shape[] {
  const w = len * 0.18;
  const half = len / 2;
  const bodyLen = len * 0.74;
  const raw: Shape[] = [
    { k: 'path', cmds: roundedRectPath(cx - half, cy - w / 2, bodyLen, w, w * 0.25), fill: body },
    {
      k: 'path',
      cmds: trianglePath(cx - half + bodyLen, cy - w / 2, cx - half + bodyLen, cy + w / 2, cx + half, cy),
      fill: wood,
    },
    {
      k: 'path',
      cmds: trianglePath(cx + half - len * 0.08, cy - w * 0.2, cx + half - len * 0.08, cy + w * 0.2, cx + half, cy),
      fill: lead,
    },
  ];
  return raw.map((s) => (s.k === 'path' ? { ...s, cmds: rotatePath(s.cmds, cx, cy, degrees) } : s));
}

// ---------------------------------------------------------------------------
// Uniform conversion
// ---------------------------------------------------------------------------

/** Bezier circle constant: how far control points sit along the tangent. */
const KAPPA = 0.5522847498307936;

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): PathCmd[] {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  return [
    { c: 'M', x: cx - rx, y: cy },
    { c: 'C', x1: cx - rx, y1: cy - oy, x2: cx - ox, y2: cy - ry, x: cx, y: cy - ry },
    { c: 'C', x1: cx + ox, y1: cy - ry, x2: cx + rx, y2: cy - oy, x: cx + rx, y: cy },
    { c: 'C', x1: cx + rx, y1: cy + oy, x2: cx + ox, y2: cy + ry, x: cx, y: cy + ry },
    { c: 'C', x1: cx - ox, y1: cy + ry, x2: cx - rx, y2: cy + oy, x: cx - rx, y: cy },
    { c: 'Z' },
  ];
}

/**
 * Flatten any shape to path commands.
 *
 * The PDF renderer draws every primitive through a single path code path, so
 * fills, strokes, dashes and opacity behave identically no matter which shape
 * a template reached for. The SVG renderer keeps using native elements.
 */
export function shapeToPathCmds(shape: Shape): PathCmd[] {
  switch (shape.k) {
    case 'path':
      return shape.cmds;
    case 'rect':
      return shape.rx
        ? roundedRectPath(shape.x, shape.y, shape.w, shape.h, shape.rx)
        : [
            { c: 'M', x: shape.x, y: shape.y },
            { c: 'L', x: shape.x + shape.w, y: shape.y },
            { c: 'L', x: shape.x + shape.w, y: shape.y + shape.h },
            { c: 'L', x: shape.x, y: shape.y + shape.h },
            { c: 'Z' },
          ];
    case 'circle':
      return ellipsePath(shape.cx, shape.cy, shape.r, shape.r);
    case 'ellipse':
      return ellipsePath(shape.cx, shape.cy, shape.rx, shape.ry);
    case 'line':
      return [
        { c: 'M', x: shape.x1, y: shape.y1 },
        { c: 'L', x: shape.x2, y: shape.y2 },
      ];
  }
}
