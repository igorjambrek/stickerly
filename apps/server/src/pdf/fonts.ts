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
 * Embed every font a document might need.
 *
 * Subsetting keeps the three PDFs small, which matters when a parent mails
 * them to a print shop.
 */
export async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  doc.registerFontkit(fontkit);
  const entries = await Promise.all(
    (Object.keys(FONT_FILES) as FontName[]).map(async (name) => {
      const font = await doc.embedFont(await fontBytes(FONT_FILES[name]), { subset: true });
      return [name, font] as const;
    }),
  );
  return Object.fromEntries(entries) as Fonts;
}
