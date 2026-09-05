/**
 * The print endpoints.
 *
 * One click in the editor becomes three downloads. Everything a printer needs
 * to know — page size, imposition, fold, bleed-free margins, sticker pitch —
 * is decided here and in the pdf module, never by the child.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { PAPER_NAME, STICKER_PAPER, countFilled, fillerPagesNeeded, printFileName, printSheetCounts } from '@album/shared';
import type { Repo } from '../repo.ts';
import { readPrintImage } from '../storage.ts';
import { buildCoverPdf, buildPagesPdf, buildStickersPdf } from '../pdf/index.ts';

interface TokenParams {
  token: string;
}

function sendPdf(reply: FastifyReply, bytes: Uint8Array, filename: string): FastifyReply {
  return reply
    .header('content-type', 'application/pdf')
    .header('content-disposition', `attachment; filename="${filename}"`)
    .header('cache-control', 'no-store')
    .send(Buffer.from(bytes));
}

export function printRoutes(repo: Repo) {
  return async function routes(app: FastifyInstance): Promise<void> {
    const inputFor = (token: string) => {
      const album = repo.get(token);
      const albumId = album.id;
      return { album, loadImage: (imageId: string) => readPrintImage(albumId, imageId) };
    };

    /**
     * What the print dialog needs to explain itself, without building any PDFs.
     * All of it is arithmetic on the album, so it is cheap enough to call on
     * every open.
     */
    app.get<{ Params: TokenParams }>('/api/albums/:token/print/summary', async (req) => {
      const album = repo.get(req.params.token);
      const sheets = printSheetCounts(album);
      return {
        stickerCount: countFilled(album),
        pageCount: album.pages.length,
        fillerCount: fillerPagesNeeded(album.pages.length),
        coverSheets: sheets.cover,
        pageSheets: sheets.pages,
        stickerSheets: sheets.stickers,
        /** What to feed the printer: the album's own sheet for cover and pages... */
        sheetPaper: PAPER_NAME[album.size],
        /** ...and always A4 for the sticker sheets. */
        stickerPaper: STICKER_PAPER,
        size: album.size,
        slotsPerPage: album.slotsPerPage,
      };
    });

    app.get<{ Params: TokenParams }>('/api/albums/:token/print/cover.pdf', async (req, reply) => {
      const input = inputFor(req.params.token);
      const bytes = await buildCoverPdf(input);
      return sendPdf(reply, bytes, printFileName(input.album.title, 'cover'));
    });

    app.get<{ Params: TokenParams }>('/api/albums/:token/print/pages.pdf', async (req, reply) => {
      const input = inputFor(req.params.token);
      const result = await buildPagesPdf(input);
      return sendPdf(reply, result.bytes, printFileName(input.album.title, 'pages'));
    });

    app.get<{ Params: TokenParams }>('/api/albums/:token/print/stickers.pdf', async (req, reply) => {
      const input = inputFor(req.params.token);
      const layout = (req.query as Record<string, unknown>)?.layout === 'safe' ? ('safe' as const) : ('full' as const);
      const result = await buildStickersPdf({ ...input, layout });
      return sendPdf(reply, result.bytes, printFileName(input.album.title, 'stickers'));
    });
  };
}
