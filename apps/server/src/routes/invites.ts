/**
 * Album invites.
 *
 * An invite is how a friend arrives: a code short enough to read off a screen,
 * or the QR that wraps it. Claiming one puts a row in `album_members` and hands
 * back the album's edit token, which is what actually grants access — the
 * roster records who is here, it does not gate them. Taking a member off the
 * list therefore removes them from the album's story, not from the album; real
 * revocation needs the token to stop being the key, which is a later job.
 */

import type { FastifyInstance } from 'fastify';
import type { Identity } from '../identity.ts';
import type { Repo } from '../repo.ts';
import { Invalid } from '../repo.ts';
import { config } from '../config.ts';
import { createRateLimiter } from '../ratelimit.ts';
import { requirePerson } from './people.ts';

export function inviteRoutes(repo: Repo, identity: Identity) {
  const claims = createRateLimiter(config.maxClaimsPerMinute, 60_000);

  return async function routes(app: FastifyInstance): Promise<void> {
    /**
     * Holding the token is enough to invite, exactly as holding it is enough to
     * do everything else. Recording *which* member minted it is what lets an
     * album say who brought whom.
     */
    app.post<{ Params: { token: string } }>('/api/albums/:token/invites', async (req) => {
      const albumId = repo.albumId(req.params.token);
      return identity.mintInvite(albumId, req.person?.id ?? null);
    });

    app.post<{ Params: { code: string } }>('/api/invites/:code/claim', async (req) => {
      if (!claims.take(req.ip)) throw new Invalid('too many tries, wait a minute');

      // A passport first: joining is the one thing that has to know who you are.
      const person = requirePerson(req);
      const { albumId } = identity.claimInvite(req.params.code);
      repo.addMember(albumId, person.id);

      const editToken = repo.editTokenOf(albumId);
      return { album: repo.get(editToken), editToken };
    });
  };
}
