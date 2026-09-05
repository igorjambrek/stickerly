/**
 * A millimetre canvas on top of pdf-lib.
 *
 * Every layout number in this project is millimetres measured y-down from the
 * top-left of a panel (an album page, a cover panel, a sticker sheet). A Panel
 * is the only place that converts into PDF's y-up points, so the rest of the
 * print code reads exactly like the shared geometry it comes from.
 *
 * Font sizes are in millimetres too. Mixing mm and points in layout code is
 * how printed output quietly drifts away from the screen.
 */

import {
  LineCapStyle,
  PDFFont,
  PDFImage,
  PDFPage,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from 'pdf-lib';
import type { Crop, PathCmd, Rect, Shape } from '@album/shared';
import { coverPlacement, mmToPt, pathToSvgD, ptToMm, shapeToPathCmds } from '@album/shared';

export type Align = 'left' | 'center' | 'right';

export interface TextOptions {
  /** Baseline position, millimetres y-down from the panel's top-left. */
  x: number;
  y: number;
  /** Font size in millimetres (cap-to-descender em size, as usual). */
  size: number;
  font: PDFFont;
  color: string;
  align?: Align;
  opacity?: number;
  /** Extra space between characters, in mm. Useful for small-caps style labels. */
  letterSpacing?: number;
}

const HEX = /^#?([0-9a-f]{6})$/i;

/** '#0B7A3B' -> pdf-lib colour. Unknown strings fall back to black rather than throwing mid-print. */
export function color(hex: string) {
  const m = HEX.exec(hex.trim());
  if (!m) return rgb(0, 0, 0);
  const v = parseInt(m[1]!, 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

/** Quadratic control point -> the equivalent cubic pair. */
function quadToCubic(px: number, py: number, qx: number, qy: number, x: number, y: number) {
  return {
    c1x: px + (2 / 3) * (qx - px),
    c1y: py + (2 / 3) * (qy - py),
    c2x: x + (2 / 3) * (qx - x),
    c2y: y + (2 / 3) * (qy - y),
  };
}

export class Panel {
  /**
   * @param page   the PDF page this panel lives on
   * @param ox,oy  the panel's top-left corner in page millimetres, y-down
   * @param w,h    the panel's size in this panel's own units
   * @param scale  how many page millimetres one of those units is worth
   */
  constructor(
    readonly page: PDFPage,
    readonly ox: number,
    readonly oy: number,
    readonly w: number,
    readonly h: number,
    readonly scale = 1,
  ) {}

  /** A sub-panel, for nesting a sticker inside a page inside a sheet. */
  inset(r: Rect): Panel {
    return new Panel(this.page, this.ox + r.x * this.scale, this.oy + r.y * this.scale, r.w, r.h, this.scale);
  }

  /**
   * The same panel measured in units `k` times smaller than page millimetres.
   *
   * This is how one piece of layout code serves both album sizes: cover and
   * page artwork is written once against the reference A4 page and drawn
   * through `scaled(layout.scale)`, so an A5 page is the same design at 71%
   * rather than a second design. Stroke widths, dashes, font sizes and images
   * all follow, because every conversion below goes through `scale`.
   */
  scaled(k: number): Panel {
    return new Panel(this.page, this.ox, this.oy, this.w / k, this.h / k, this.scale * k);
  }

  /** Panel units -> absolute PDF points. */
  ptX(xMm: number): number {
    return mmToPt(this.ox + xMm * this.scale);
  }

  ptY(yMm: number): number {
    return this.page.getHeight() - mmToPt(this.oy + yMm * this.scale);
  }

  // -------------------------------------------------------------------------
  // Shapes
  // -------------------------------------------------------------------------

  /**
   * Draw one shape. Everything goes through drawSvgPath: it already applies the
   * y-flip and a uniform scale, so passing panel coordinates with the panel's
   * own scale makes stroke widths and dash patterns land in the same units.
   */
  shape(s: Shape): void {
    const d = pathToSvgD(shapeToPathCmds(s));
    if (!d) return;
    this.page.drawSvgPath(d, {
      x: this.ptX(0),
      y: this.ptY(0),
      scale: mmToPt(this.scale),
      color: s.fill ? color(s.fill) : undefined,
      borderColor: s.stroke ? color(s.stroke) : undefined,
      borderWidth: s.stroke ? (s.sw ?? 0.3) : undefined,
      borderDashArray: s.dash,
      borderLineCap: s.round ? LineCapStyle.Round : undefined,
      opacity: s.opacity,
      borderOpacity: s.opacity,
    });
  }

  shapes(list: Shape[]): void {
    for (const s of list) this.shape(s);
  }

  rect(r: Rect, paint: Omit<Shape & { k: 'rect' }, 'k' | 'x' | 'y' | 'w' | 'h'>): void {
    this.shape({ k: 'rect', ...r, ...paint });
  }

  // -------------------------------------------------------------------------
  // Text
  // -------------------------------------------------------------------------

  /** Width of a string in millimetres at a millimetre font size. */
  widthOf(text: string, font: PDFFont, size: number, letterSpacing = 0): number {
    const base = ptToMm(font.widthOfTextAtSize(text, mmToPt(size)));
    return base + Math.max(0, text.length - 1) * letterSpacing;
  }

  text(text: string, o: TextOptions): void {
    if (!text) return;
    const width = this.widthOf(text, o.font, o.size, o.letterSpacing);
    const startX = o.align === 'center' ? o.x - width / 2 : o.align === 'right' ? o.x - width : o.x;
    const common = {
      y: this.ptY(o.y),
      size: mmToPt(o.size * this.scale),
      font: o.font,
      color: color(o.color),
      opacity: o.opacity,
    };

    if (!o.letterSpacing) {
      this.page.drawText(text, { x: this.ptX(startX), ...common });
      return;
    }

    // pdf-lib has no tracking option, so wide-spaced labels are set glyph by glyph.
    let x = startX;
    for (const ch of text) {
      this.page.drawText(ch, { x: this.ptX(x), ...common });
      x += ptToMm(o.font.widthOfTextAtSize(ch, mmToPt(o.size))) + o.letterSpacing;
    }
  }

  /**
   * Draw a single line, shrinking the font until it fits `maxWidth`.
   * Returns the size actually used, so callers can align things underneath.
   */
  fitText(text: string, o: TextOptions & { maxWidth: number; minSize?: number }): number {
    let size = o.size;
    const min = o.minSize ?? o.size * 0.45;
    while (size > min && this.widthOf(text, o.font, size, o.letterSpacing) > o.maxWidth) {
      size -= 0.25;
    }
    this.text(text, { ...o, size });
    return size;
  }

  /** Greedy word wrap. Returns the lines; does not draw. */
  wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && this.widthOf(candidate, font, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /**
   * Draw wrapped text into a box, shrinking until it fits both width and
   * height. Returns the y of the last baseline drawn.
   */
  textBlock(
    text: string,
    o: Omit<TextOptions, 'x' | 'y'> & { box: Rect; lineHeight?: number; minSize?: number; valign?: 'top' | 'middle' },
  ): number {
    const lh = o.lineHeight ?? 1.25;
    const min = o.minSize ?? o.size * 0.4;
    let size = o.size;
    let lines = this.wrap(text, o.font, size, o.box.w);
    while (size > min && lines.length * size * lh > o.box.h) {
      size -= 0.25;
      lines = this.wrap(text, o.font, size, o.box.w);
    }
    const blockH = lines.length * size * lh;
    const startY =
      o.valign === 'middle'
        ? o.box.y + (o.box.h - blockH) / 2 + size * 0.85
        : o.box.y + size * 0.85;
    const anchorX =
      o.align === 'center' ? o.box.x + o.box.w / 2 : o.align === 'right' ? o.box.x + o.box.w : o.box.x;

    let y = startY;
    for (const line of lines) {
      this.text(line, { ...o, x: anchorX, y, size });
      y += size * lh;
    }
    return y - size * lh;
  }

  // -------------------------------------------------------------------------
  // Images
  // -------------------------------------------------------------------------

  /**
   * Draw an image so it covers `box`, clipped to `box` with rounded corners.
   * The placement comes from shared code, so the editor shows the same framing.
   */
  image(img: PDFImage, box: Rect, crop: Crop, radius = 0, opacity?: number): void {
    const placed = coverPlacement(box, img.width, img.height, crop);
    this.withClip(box, radius, () => {
      this.page.drawImage(img, {
        x: this.ptX(placed.x),
        // drawImage anchors at the bottom-left, so shift down by the height.
        y: this.ptY(placed.y + placed.h),
        width: mmToPt(placed.w * this.scale),
        height: mmToPt(placed.h * this.scale),
        opacity,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Clipping
  // -------------------------------------------------------------------------

  /** Run `draw` with output clipped to a (optionally rounded) rectangle. */
  withClip(box: Rect, radius: number, draw: () => void): void {
    const cmds: PathCmd[] = shapeToPathCmds(
      radius > 0 ? { k: 'rect', ...box, rx: radius } : { k: 'rect', ...box },
    );
    this.page.pushOperators(pushGraphicsState(), ...this.clipOperators(cmds), clip(), endPath());
    draw();
    this.page.pushOperators(popGraphicsState());
  }

  /** Turn path commands into raw PDF path operators in absolute point space. */
  private clipOperators(cmds: PathCmd[]) {
    const ops = [];
    let cx = 0;
    let cy = 0;
    for (const cmd of cmds) {
      switch (cmd.c) {
        case 'M':
          ops.push(moveTo(this.ptX(cmd.x), this.ptY(cmd.y)));
          cx = cmd.x;
          cy = cmd.y;
          break;
        case 'L':
          ops.push(lineTo(this.ptX(cmd.x), this.ptY(cmd.y)));
          cx = cmd.x;
          cy = cmd.y;
          break;
        case 'Q': {
          const c = quadToCubic(cx, cy, cmd.x1, cmd.y1, cmd.x, cmd.y);
          ops.push(
            appendBezierCurve(
              this.ptX(c.c1x),
              this.ptY(c.c1y),
              this.ptX(c.c2x),
              this.ptY(c.c2y),
              this.ptX(cmd.x),
              this.ptY(cmd.y),
            ),
          );
          cx = cmd.x;
          cy = cmd.y;
          break;
        }
        case 'C':
          ops.push(
            appendBezierCurve(
              this.ptX(cmd.x1),
              this.ptY(cmd.y1),
              this.ptX(cmd.x2),
              this.ptY(cmd.y2),
              this.ptX(cmd.x),
              this.ptY(cmd.y),
            ),
          );
          cx = cmd.x;
          cy = cmd.y;
          break;
        case 'Z':
          ops.push(closePath());
          break;
      }
    }
    return ops;
  }
}
