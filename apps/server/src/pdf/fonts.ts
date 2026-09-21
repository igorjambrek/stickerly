/**
 * Font embedding.
 *
 * The PDF base-14 fonts have no Cyrillic at all, so every glyph the child sees
 * comes from a bundled OFL TrueType file. The same files are served to the
 * browser as @font-face, which is what keeps the editor preview honest.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';

export const ASSETS_DIR =
  process.env.ASSETS_DIR ?? fileURLToPath(new URL('../../../../assets', import.meta.url));

export const FONT_DIR = path.join(ASSETS_DIR, 'fonts');

export const FONT_FILES = {
  body: 'Nunito-Regular.ttf',
  bodyBold: 'Nunito-Bold.ttf',
  display: 'Comfortaa-Regular.ttf',
  displayBold: 'Comfortaa-Bold.ttf',
} as const;

export type FontName = keyof typeof FONT_FILES;

export type Fonts = Record<FontName, PDFFont>;

const bytesCache = new Map<string, Buffer>();

async function fontBytes(file: string): Promise<Buffer> {
  const cached = bytesCache.get(file);
  if (cached) return cached;
  const buf = await readFile(path.join(FONT_DIR, file));
  bytesCache.set(file, buf);
  return buf;
}

/**
 * How far a capital — or a figure — rises above the baseline, as a fraction of
 * the font size.
 *
 * Centring a number in a box means centring its *ink*, and the ink of a figure
 * is nothing like the font size: it stands on the baseline and reaches the cap
 * height, which the two faces we ship disagree about (0.78 em in Comfortaa,
 * 0.71 em in Nunito). So it is read out of the font file rather than guessed,
 * because a guess that is close enough for a 3 mm label is two thirds of a
 * millimetre out on the 22 mm numeral printed behind a sticker — small enough
 * to be invisible in the file and just big enough on paper to be mistaken for
 * a printer whose duplex is out of register.
 */
const CAP_RISE = new WeakMap<PDFFont, number>();

/** For a font that came from somewhere other than `embedFonts`: the mean of ours. */
const DEFAULT_CAP_RISE = 0.745;

const riseCache = new Map<string, number>();

function capRiseOf(file: string, bytes: Buffer): number {
  const cached = riseCache.get(file);
  if (cached !== undefined) return cached;
  const font = fontkit.create(bytes);
  const rise = font.capHeight / font.unitsPerEm;
  // A font with no cap height in its OS/2 table would centre every numeral
  // somewhere arbitrary. Nothing may throw mid-print, so fall back instead.
  const value = rise > 0.4 && rise < 1.2 ? rise : DEFAULT_CAP_RISE;
  riseCache.set(file, value);
  return value;
}

/** The cap rise of an embedded font, for anything that has to be centred on it. */
export const capRise = (font: PDFFont): number => CAP_RISE.get(font) ?? DEFAULT_CAP_RISE;

/**
 * Embed every font a document might need.
 *
 * Subsetting keeps the three PDFs small, which matters when a parent mails
 * them to a print shop.
 */
export async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  doc.registerFontkit(fontkit);
  const entries = await Promise.all(
    (Object.keys(FONT_FILES) as FontName[]).map(async (name) => {
      const file = FONT_FILES[name];
      const bytes = await fontBytes(file);
      const font = await doc.embedFont(bytes, { subset: true });
      CAP_RISE.set(font, capRiseOf(file, bytes));
      return [name, font] as const;
    }),
  );
  return Object.fromEntries(entries) as Fonts;
}
