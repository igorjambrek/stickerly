/**
 * The Fastify application.
 *
 * Built as a factory so tests can spin up an isolated instance against an
 * in-memory database without touching the disk or a port.
 */

import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import type { Person } from '@album/shared';
import { config } from './config.ts';
import type { Db } from './db/index.ts';
import { Invalid, NoPassport, NotFound, createRepo } from './repo.ts';
import { createIdentity } from './identity.ts';
import { createPictures } from './pictures.ts';
import { createRealtime } from './realtime.ts';
import { UnreadableImage } from './storage.ts';
import { albumRoutes } from './routes/albums.ts';
import { imageRoutes } from './routes/images.ts';
import { inviteRoutes } from './routes/invites.ts';
import { peopleRoutes } from './routes/people.ts';
import { printRoutes } from './routes/print.ts';

/** Who is calling, when they have a passport. Null is normal, not an error. */
declare module 'fastify' {
  interface FastifyRequest {
    person: Person | null;
  }
}

/**
 * A header rather than a cookie: the editor is served from the same origin as
 * the API, `api.ts` has exactly one place to add it, and nothing here is a
 * capability the browser should be attaching on its own — which is what makes
 * CSRF a non-question.
 */
const DEVICE_HEADER = 'x-nalepko-device';

export interface AppOptions {
  db: Db;
  logger?: boolean;
  /** Serve the built frontend from the same process. Off in tests. */
  serveWeb?: boolean;
}

export async function createApp({ db, logger = false, serveWeb = true }: AppOptions): Promise<FastifyInstance> {
  // Annotated so `trustProxy` does not push TypeScript onto Fastify's HTTP/2 overload.
  const options: FastifyServerOptions = { logger, bodyLimit: 1024 * 1024, trustProxy: config.trustProxy };
  const app = Fastify(options);
  const repo = createRepo(db);
  const identity = createIdentity(db);
  const live = createRealtime(repo, identity);
  const pictures = createPictures();

  await app.register(multipart, {
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 4 },
  });

  /**
   * Registered before the routes, because the album's socket route is one of
   * them. The payload cap is generous for what a client ever sends — a `hello`
   * carrying a device key — and mean enough that a socket cannot be used to
   * push anything at this process.
   */
  await app.register(websocket, { options: { maxPayload: 4 * 1024 } });

  /**
   * A POST with nothing to say is ordinary here — adding a page, minting a
   * code — and plenty of HTTP clients announce a JSON content type regardless.
   * Fastify's default parser rejects that combination outright, which turns a
   * client's harmless habit into a failed request, so an empty body is read as
   * an empty object instead.
   */
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = (body as string).trim();
    if (!text) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch {
      const bad = new Error('invalid json') as Error & { statusCode: number };
      bad.statusCode = 400;
      done(bad, undefined);
    }
  });

  /**
   * Resolved for every request and required by almost none. Album routes read
   * it to record who did something; only `/api/me` and joining an album insist
   * on it.
   */
  app.decorateRequest('person', null);
  app.addHook('onRequest', async (req) => {
    const header = req.headers[DEVICE_HEADER];
    req.person = identity.personByDeviceKey(typeof header === 'string' ? header : undefined);
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof NotFound) return reply.code(404).send({ error: error.message });
    if (error instanceof Invalid) return reply.code(400).send({ error: error.message });
    if (error instanceof NoPassport) return reply.code(401).send({ error: 'no passport' });
    if (error instanceof UnreadableImage) return reply.code(415).send({ error: 'unreadable image' });
    if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ error: 'image too large', maxBytes: config.maxUploadBytes });
    }
    // Fastify's own refusals — malformed JSON, an empty body, an unparseable
    // content type — already know what they are. Reporting them as 500 would
    // blame the server for something the caller can fix.
    const framework = error as { statusCode?: number; message?: string };
    const status = framework.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.code(status).send({ error: framework.message ?? 'bad request' });
    }

    req.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({ error: 'server error' });
  });

  app.get('/api/health', async () => ({ ok: true }));

  /**
   * What this server can do, asked once when the editor loads. Only picture
   * search so far, and it is here rather than on the album because it is a
   * property of the deployment, not of anybody's album — a door the editor
   * must not offer when it opens onto nothing.
   */
  app.get('/api/features', async () => ({ pictureSearch: pictures.enabled }));

  await app.register(live.plugin);
  await app.register(albumRoutes(repo, live));
  await app.register(imageRoutes(repo, live, pictures));
  await app.register(printRoutes(repo));
  await app.register(peopleRoutes(repo, identity));
  await app.register(inviteRoutes(repo, identity, live));

  if (serveWeb && existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, index: ['index.html'] });
    // The editor lives at /a/<token>, so unknown non-API paths fall back to the SPA.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
