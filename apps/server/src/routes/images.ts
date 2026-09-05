/**
 * Photo upload and delivery.
 *
 * Photos are reached through the album's secret token, so a link that was
 * never shared exposes nothing.
 *
 * A picture arrives one of two ways — off the child's own device, or off the
 * shelf of pictures they found by asking for one. Both end in the same place:
 * `storeImage` normalises the bytes, the album gets a row, and everybody else
 * with the album open hears about it.
 */

import type { FastifyInstance } from 'fastify';
import type { Lang } from '@album/shared';
import { DEFAULT_LANG, LANGS } from '@album/shared';
import type { Pictures } from '../pictures.ts';
import type { Realtime } from '../realtime.ts';
import { Invalid, type Repo } from '../repo.ts';
import { config } from '../config.ts';
import { createRateLimiter } from '../ratelimit.ts';
import { fetchPicture } from '../remotefetch.ts';
import { type ImageRole, readPrintImage, readThumb, storeImage } from '../storage.ts';

interface TokenParams {
  token: string;
}

/** A cover photo fills a whole page, so it is kept at a higher resolution. */
const roleOf = (query: unknown): ImageRole =>
  (query as Record<string, unknown> | undefined)?.role === 'cover' ? 'cover' : 'sticker';

const langOf = (value: unknown): Lang => (LANGS.includes(value as Lang) ? (value as Lang) : DEFAULT_LANG);

export function imageRoutes(repo: Repo, live: Realtime, pictures: Pictures) {
  // Searching costs somebody else's quota and fetching costs our bandwidth, so
  // both are counted per caller. Same window as the code claims next door.
  const searches = createRateLimiter(config.pictures.maxSearchesPerMinute, 60_000);
  const picks = createRateLimiter(config.pictures.maxPicksPerMinute, 60_000);

  return async function routes(app: FastifyInstance): Promise<void> {
    app.post<{ Params: TokenParams }>('/api/albums/:token/images', async (req, reply) => {
      const albumId = repo.albumId(req.params.token);

      const file = await req.file();
      if (!file) throw new Invalid('no file uploaded');
      if (!file.mimetype.startsWith('image/')) throw new Invalid('that is not a picture');

      const bytes = await file.toBuffer();
      if (bytes.length === 0) throw new Invalid('empty file');

      // Everything else about the upload is identical whatever it is for.
      const role = roleOf(req.query);

      // Reserve the id first so the file name and the database row agree even
      // if encoding fails halfway through.
      const imageId = repo.addImage(req.params.token, 0, 0);
      const stored = await storeImage(albumId, imageId, bytes, role);
      repo.setImageSize(req.params.token, imageId, stored.w, stored.h);

      reply.code(201);
      // A photo nobody has placed yet is still a change to the album — it is in
      // the album's picture list — so the other children hear about it on the
      // same terms as everything else.
      return { image: { id: imageId, ...stored }, ...live.publish(req, req.params.token) };
    });

    /**
     * What a child said they were looking for, answered with pictures.
     *
     * Behind the album token like everything else: this is not an image search
     * the internet may use, it is one the holder of an album link may use.
     */
    app.get<{ Params: TokenParams; Querystring: { q?: string; lang?: string } }>(
      '/api/albums/:token/pictures',
      async (req) => {
        repo.albumId(req.params.token);
        if (!pictures.enabled) throw new Invalid('picture search is switched off');
        if (!searches.take(req.ip)) throw new Invalid('too many searches, wait a minute');

        // The query that comes back is the one the pictures were found by,
        // which is not always the one that was asked: a name said out loud in
        // Serbian is spelled in Serbian, and the pictures are labelled in
        // English. The editor shows the difference rather than hiding it.
        const found = await pictures.search(req.query.q ?? '', langOf(req.query.lang));
        return { provider: pictures.provider, ...found };
      },
    );

    /**
     * Take one of those pictures into the album.
     *
     * The body names a `pick`, not a URL — a handle this process signed when it
     * offered the picture, and the only kind of address it will go and fetch.
     * From the row it writes onward, a picture found this way is exactly a
     * picture that was uploaded: same normalising, same stripping, same file.
     */
    app.post<{ Params: TokenParams; Body: { pick?: string } }>(
      '/api/albums/:token/images/from-search',
      async (req, reply) => {
        const albumId = repo.albumId(req.params.token);
        if (!pictures.enabled) throw new Invalid('picture search is switched off');
        if (!picks.take(req.ip)) throw new Invalid('too many pictures, wait a minute');
        if (typeof req.body?.pick !== 'string') throw new Invalid('which picture?');

        const url = pictures.open(req.body.pick);

        let downloaded;
        try {
          downloaded = await fetchPicture(url, {
            maxBytes: config.maxUploadBytes,
            timeoutMs: config.pictures.timeoutMs,
            userAgent: config.pictures.userAgent,
          });
        } catch (error) {
          // Gone, enormous, refused, timed out, or somewhere we will not
          // follow — every one of those is the same thing to the child holding
          // the screen, and none of them is this server failing. The reason
          // goes to the log, where somebody can act on it; the child is told to
          // pick a different picture.
          req.log.warn({ err: error }, 'could not fetch a found picture');
          throw new Invalid('that picture could not be fetched, try another one');
        }

        const role = roleOf(req.query);
        const imageId = repo.addImage(req.params.token, 0, 0);
        const stored = await storeImage(albumId, imageId, downloaded.bytes, role);
        repo.setImageSize(req.params.token, imageId, stored.w, stored.h);

        reply.code(201);
        return { image: { id: imageId, ...stored }, ...live.publish(req, req.params.token) };
      },
    );

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
