/**
 * Album, page and slot endpoints.
 *
 * Every mutation returns the whole album. It is only a few kilobytes, and it
 * means the editor never has to merge a partial response into local state —
 * which is exactly where "the number on screen is wrong" bugs come from.
 *
 * Since an album can have more than one child in it, every mutation also says
 * the same thing to everybody else who has it open. That is one call —
 * `live.publish` — and it returns exactly what the response body already was,
 * plus the revision that reading was taken at, so the answer to this request
 * and the push to the others cannot disagree.
 */

import type { FastifyInstance } from 'fastify';
import type { Realtime } from '../realtime.ts';
import type { Repo } from '../repo.ts';
import { deleteAlbumStorage } from '../storage.ts';

interface TokenParams {
  token: string;
}

export function albumRoutes(repo: Repo, live: Realtime) {
  return async function routes(app: FastifyInstance): Promise<void> {
    app.post('/api/albums', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const created = repo.create({
        title: body.title as string,
        templateId: body.templateId as string,
        coverVariantId: body.coverVariantId,
        size: body.size,
        slotsPerPage: body.slotsPerPage,
        ownerName: body.ownerName as string,
        lang: body.lang,
        ownerPersonId: req.person?.id ?? null,
      });
      reply.code(201);
      // Nobody can be watching an album that did not exist a moment ago, so
      // this is a plain reading rather than a broadcast.
      return { ...created, ...live.snapshot(created.editToken) };
    });

    app.get<{ Params: TokenParams }>('/api/albums/:token', async (req) => ({
      ...live.snapshot(req.params.token),
      editToken: req.params.token,
    }));

    app.patch<{ Params: TokenParams }>('/api/albums/:token', async (req) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      repo.update(req.params.token, {
        title: body.title as string | undefined,
        lang: body.lang,
        ownerName: body.ownerName as string | undefined,
      });
      return live.publish(req, req.params.token);
    });

    /**
     * The cover has its own endpoint because it is the one part of an album a
     * child is expected to change their mind about, repeatedly — the theme
     * included, since a theme is only paint and the stickers stay where they
     * are. Size and stickers-per-page, which would destroy slots, stay locked.
     */
    app.put<{ Params: TokenParams }>('/api/albums/:token/cover', async (req) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      repo.setCover(req.params.token, {
        templateId: body.templateId,
        coverVariantId: body.coverVariantId,
        coverImageId: body.coverImageId as string | null | undefined,
        coverCrop: body.coverCrop,
      });
      return live.publish(req, req.params.token);
    });

    app.post<{ Params: TokenParams }>('/api/albums/:token/pages', async (req) => {
      repo.addPage(req.params.token);
      return live.publish(req, req.params.token);
    });

    app.delete<{ Params: TokenParams & { pageId: string } }>('/api/albums/:token/pages/:pageId', async (req) => {
      repo.deletePage(req.params.token, req.params.pageId);
      return live.publish(req, req.params.token);
    });

    app.patch<{ Params: TokenParams & { pageId: string } }>('/api/albums/:token/pages/:pageId', async (req) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.title === 'string') repo.setPageTitle(req.params.token, req.params.pageId, body.title);
      if (typeof body.position === 'number') repo.movePage(req.params.token, req.params.pageId, body.position);
      return live.publish(req, req.params.token);
    });

    app.put<{ Params: TokenParams & { slotId: string } }>('/api/albums/:token/slots/:slotId', async (req) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      repo.setSlot(
        req.params.token,
        req.params.slotId,
        {
          label: body.label as string | undefined,
          imageId: body.imageId as string | null | undefined,
          crop: body.crop,
        },
        // Whoever put the photo here, when we know. An anonymous editor is
        // still welcome; their stickers simply carry no face.
        req.person?.id ?? null,
      );
      return live.publish(req, req.params.token);
    });

    app.post<{ Params: TokenParams & { slotId: string } }>('/api/albums/:token/slots/:slotId/swap', async (req) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      repo.swapSlots(req.params.token, req.params.slotId, String(body.withId ?? ''));
      return live.publish(req, req.params.token);
    });

    app.delete<{ Params: TokenParams }>('/api/albums/:token', async (req) => {
      const albumId = repo.deleteAlbum(req.params.token);
      // Told before the photos go, so anyone still looking at it hears why the
      // pictures stopped loading rather than watching them fail one by one.
      live.gone(albumId);
      await deleteAlbumStorage(albumId);
      return { ok: true };
    });
  };
}
