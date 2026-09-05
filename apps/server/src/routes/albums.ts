/**
 * Album, page and slot endpoints.
 *
 * Every mutation returns the whole album. It is only a few kilobytes, and it
 * means the editor never has to merge a partial response into local state —
 * which is exactly where "the number on screen is wrong" bugs come from.
 */

import type { FastifyInstance } from 'fastify';
import type { Repo } from '../repo.ts';
import { deleteAlbumStorage } from '../storage.ts';

interface TokenParams {
  token: string;
}

export function albumRoutes(repo: Repo) {
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
      return { ...created, album: repo.get(created.editToken) };
    });

    app.get<{ Params: TokenParams }>('/api/albums/:token', async (req) => ({
      album: repo.get(req.params.token),
      editToken: req.params.token,
    }));

    app.patch<{ Params: TokenParams }>('/api/albums/:token', async (req) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      repo.update(req.params.token, {
        title: body.title as string | undefined,
        lang: body.lang,
        ownerName: body.ownerName as string | undefined,
      });
      return { album: repo.get(req.params.token) };
    });

    /**
     * The cover has its own endpoint because it is the one part of an album a
     * child is expected to change their mind about, repeatedly.
     */
    app.put<{ Params: TokenParams }>('/api/albums/:token/cover', async (req) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      repo.setCover(req.params.token, {
        coverVariantId: body.coverVariantId,
        coverImageId: body.coverImageId as string | null | undefined,
        coverCrop: body.coverCrop,
      });
      return { album: repo.get(req.params.token) };
    });

    app.post<{ Params: TokenParams }>('/api/albums/:token/pages', async (req) => {
      repo.addPage(req.params.token);
      return { album: repo.get(req.params.token) };
    });

    app.delete<{ Params: TokenParams & { pageId: string } }>('/api/albums/:token/pages/:pageId', async (req) => {
      repo.deletePage(req.params.token, req.params.pageId);
      return { album: repo.get(req.params.token) };
    });

    app.patch<{ Params: TokenParams & { pageId: string } }>('/api/albums/:token/pages/:pageId', async (req) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.title === 'string') repo.setPageTitle(req.params.token, req.params.pageId, body.title);
      if (typeof body.position === 'number') repo.movePage(req.params.token, req.params.pageId, body.position);
      return { album: repo.get(req.params.token) };
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
      return { album: repo.get(req.params.token) };
    });

    app.post<{ Params: TokenParams & { slotId: string } }>('/api/albums/:token/slots/:slotId/swap', async (req) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      repo.swapSlots(req.params.token, req.params.slotId, String(body.withId ?? ''));
      return { album: repo.get(req.params.token) };
    });

    app.delete<{ Params: TokenParams }>('/api/albums/:token', async (req) => {
      const albumId = repo.deleteAlbum(req.params.token);
      await deleteAlbumStorage(albumId);
      return { ok: true };
    });
  };
}
