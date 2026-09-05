/**
 * The browser half of the drawing vocabulary.
 *
 * Mirrors the PDF renderer in apps/server/src/pdf/canvas.ts: same shapes, same
 * millimetre coordinates, same template code producing them. This is what
 * makes the on-screen album match the printed one.
 */

import type { CSSProperties } from 'react';
import type { Shape } from '@album/shared';
import { pathToSvgD } from '@album/shared';

function paint(s: Shape): CSSProperties & Record<string, unknown> {
  return {
    // SVG fills black by default; the PDF side draws nothing without a fill.
    fill: s.fill ?? 'none',
    stroke: s.stroke ?? 'none',
    strokeWidth: s.stroke ? (s.sw ?? 0.3) : undefined,
    strokeDasharray: s.dash?.join(' '),
    strokeLinecap: s.round ? 'round' : undefined,
    opacity: s.opacity,
  };
}

function ShapeNode({ shape }: { shape: Shape }) {
  const style = paint(shape);
  switch (shape.k) {
    case 'rect':
      return <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} style={style} />;
    case 'circle':
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} style={style} />;
    case 'ellipse':
      return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} style={style} />;
    case 'line':
      return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} style={style} />;
    case 'path':
      return <path d={pathToSvgD(shape.cmds)} style={style} />;
  }
}

export interface ShapeCanvasProps {
  shapes: Shape[];
  /** Panel size in millimetres; becomes the SVG viewBox. */
  width: number;
  height: number;
  className?: string;
}

export function ShapeCanvas({ shapes, width, height, className }: ShapeCanvasProps) {
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      {shapes.map((shape, i) => (
        <ShapeNode key={i} shape={shape} />
      ))}
    </svg>
  );
}
