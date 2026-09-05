/**
 * Photo upload and delivery.
 *
 * Photos are reached through the album's secret token, so a link that was
 * never shared exposes nothing.
 */

import type { FastifyInstance } from 'fastify';
import { Invalid, type Repo } from '../repo.ts';
import { type ImageRole, readPrintImage, readThumb, storeImage } from '../storage.ts';

interface TokenParams {
  token: string;
}

export function imageRoutes(repo: Repo) {
  return async function routes(app: FastifyInstance): Promise<void> {
    app.post<{ Params: TokenParams }>('/api/albums/:token/images', async (req, reply) => {
      const albumId = repo.albumId(req.params.token);

      const file = await req.file();
      if (!file) throw new Invalid('no file uploaded');
      if (!file.mimetype.startsWith('image/')) throw new Invalid('that is not a picture');

      const bytes = await file.toBuffer();
      if (bytes.length === 0) throw new Invalid('empty file');

      // A cover photo fills a whole page, so it is kept at a higher resolution
      // than a sticker. Everything else about the upload is identical.
      const role: ImageRole = (req.query as Record<string, unknown>)?.role === 'cover' ? 'cover' : 'sticker';

      // Reserve the id first so the file name and the database row agree even
      // if encoding fails halfway through.
      const imageId = repo.addImage(req.params.token, 0, 0);
      const stored = await storeImage(albumId, imageId, bytes, role);
      repo.setImageSize(req.params.token, imageId, stored.w, stored.h);

      reply.code(201);
      return { image: { id: imageId, ...stored } };
    });

    app.get<{ Params: TokenParams & { imageId: string } }>(
      '/api/albums/:token/images/:imageId',
      async (req, reply) => {
        const albumId = repo.albumId(req.params.token);
        if (!repo.ownsImage(req.params.token, req.params.imageId)) return reply.code(404).send({ error: 'not found' });

        const thumb = (req.query as Record<string, unknown>)?.size === 'thumb';
        const bytes = thumb
          ? await readThumb(albumId, req.params.imageId)
          : await readPrintImage(albumId, req.params.imageId);
        if (!bytes) return reply.code(404).send({ error: 'not found' });

        // Image bytes never change for a given id, so they can be cached hard.
        return reply
          .header('content-type', 'image/jpeg')
          .header('cache-control', 'private, max-age=31536000, immutable')
          .send(bytes);
      },
    );

  };
}
