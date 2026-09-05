/**
 * Passport endpoints.
 *
 * Everything here is about *who*, never about *what* — no album is reachable
 * through these routes, so a passport is a fact about the caller rather than a
 * key to anything. That is what keeps this layer additive: an anonymous child
 * with a secret link still works exactly as they did before any of this
 * existed.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Person } from '@album/shared';
import type { Identity } from '../identity.ts';
import type { Repo } from '../repo.ts';
import { Invalid, NoPassport } from '../repo.ts';
import { config } from '../config.ts';
import { createRateLimiter } from '../ratelimit.ts';

interface CodeParams {
  code: string;
}

export const requirePerson = (req: FastifyRequest): Person => {
  if (!req.person) throw new NoPassport('no passport');
  return req.person;
};

export function peopleRoutes(repo: Repo, identity: Identity) {
  /**
   * Claim codes are six characters, which is only safe because guessing is
   * expensive. This is the thing that makes it expensive — the per-code counter
   * in the database cannot see a wrong guess, because a wrong guess matches no
   * row at all.
   */
  const claims = createRateLimiter(config.maxClaimsPerMinute, 60_000);
  /** A passport costs one row, so minting them is worth a limit of its own. */
  const mints = createRateLimiter(30, 60_000);

  return async function routes(app: FastifyInstance): Promise<void> {
    const limit = (limiter: { take: (key: string) => boolean }, req: FastifyRequest) => {
      if (!limiter.take(req.ip)) throw new Invalid('too many tries, wait a minute');
    };

    app.post('/api/people', async (req, reply) => {
      limit(mints, req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const passport = identity.createPerson({
        nickname: body.nickname,
        avatar: body.avatar,
        lang: body.lang,
      });
      reply.code(201);
      return passport;
    });

    app.get('/api/me', async (req) => {
      const person = requirePerson(req);
      return { person, albums: repo.albumsOf(person.id) };
    });

    app.patch('/api/me', async (req) => {
      const person = requirePerson(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      return { person: identity.updatePerson(person, body) };
    });

    /** Device A: something to hold up to device B's camera. */
    app.post('/api/me/pairings', async (req) => {
      const person = requirePerson(req);
      return identity.mintPairing(person.id);
    });

    /**
     * Device B. It gets a key of its own rather than a copy of device A's, so
     * the two are separate rows and one can be cut off without the other.
     */
    app.post<{ Params: CodeParams }>('/api/pairings/:code/claim', async (req) => {
      limit(claims, req);
      return identity.claimPairing(req.params.code);
    });

    /**
     * The upgrade path. Albums a child made before passports existed are known
     * only to the browser that made them; handing those tokens over here turns
     * a device-local list into one they can carry.
     */
    app.post('/api/me/albums/claim', async (req) => {
      const person = requirePerson(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const claimed = repo.claimAlbums(person.id, body.tokens);
      // The same shape as `/api/me`, plus the count: this is the first thing a
      // browser calls on the load that upgrades it, and it should not have to
      // ask who it is in a second request.
      return { claimed, person, albums: repo.albumsOf(person.id) };
    });
  };
}
