/**
 * The live hub.
 *
 * A hub in the SignalR sense, hand-rolled because that is all it takes: sockets
 * are grouped by album, a mutation is broadcast to the group, and the client
 * reconnects on its own. There is no client-callable method — edits keep going
 * over HTTP, where the validation, the error handling and the rate limiting
 * already live — so the socket only ever carries three facts downstream: the
 * album changed, who is here, and the album is gone.
 *
 * What it broadcasts is the whole album, the same object the mutation handed
 * back to whoever asked for it. That is the rule the rest of the app already
 * obeys, and the reason this could be added without touching a line that reads
 * album state: the editor has exactly one way to take an album in.
 *
 * Two things are worth knowing before changing anything here:
 *
 * - **Groups and revisions live in memory**, which is only true because the app
 *   is one process serving one SQLite file. A second instance would need both
 *   halves — the broadcast and the revision — somewhere both could see them,
 *   and that is the point at which this file becomes a real message bus.
 * - **The socket grants nothing.** It is opened with the album's edit token,
 *   exactly like every other route, and says only what a GET of that album
 *   would already say. The passport that arrives in `hello` is for presence — a
 *   face beside a name — and is never a key to anything.
 */

import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type { AlbumUpdate, LiveClientMessage, LivePeer, LiveServerMessage, Person } from '@album/shared';
import { LIVE_CLOSE_GONE, LIVE_HEARTBEAT_MS, SOCKET_HEADER } from '@album/shared';
import type { Identity } from './identity.ts';
import type { Repo } from './repo.ts';

/**
 * The route behind `livePath()` in the shared module — the same URL, said the
 * way Fastify wants to hear it. The tests connect through the shared helper, so
 * the two cannot drift apart unnoticed.
 */
const LIVE_ROUTE = '/api/albums/:token/live';

interface Connection {
  id: string;
  socket: WebSocket;
  albumId: string;
  /** Filled in by `hello`; null for a child who arrived with the link alone. */
  person: Person | null;
  /** Cleared before each ping. A socket that never answers one is not there. */
  alive: boolean;
  /** One `hello` per socket: each costs a hash and a lookup. */
  greeted: boolean;
}

export function createRealtime(repo: Repo, identity: Identity) {
  /** album id -> the sockets watching it. */
  const groups = new Map<string, Map<string, Connection>>();
  /** album id -> the revision it was last changed at. */
  const revisions = new Map<string, number>();

  const groupOf = (albumId: string): Map<string, Connection> => {
    const existing = groups.get(albumId);
    if (existing) return existing;
    const fresh = new Map<string, Connection>();
    groups.set(albumId, fresh);
    return fresh;
  };

  /**
   * The next revision for an album. Monotonic by construction, and seeded from
   * the clock so a restarted server never hands out a number a client has
   * already seen and would therefore ignore.
   */
  const bump = (albumId: string): number => {
    const next = Math.max(Date.now(), (revisions.get(albumId) ?? 0) + 1);
    revisions.set(albumId, next);
    return next;
  };

  const peersOf = (albumId: string): LivePeer[] =>
    [...groupOf(albumId).values()].map((c) => ({ id: c.id, person: c.person }));

  const send = (conn: Connection, payload: string): void => {
    // Sockets die between one line and the next. A failed send is not something
    // anybody can act on, and the heartbeat collects the remains.
    try {
      conn.socket.send(payload);
    } catch {
      /* gone */
    }
  };

  /** Everyone watching this album, optionally minus the socket that caused it. */
  const broadcast = (albumId: string, message: LiveServerMessage, exceptId?: string): void => {
    const group = groups.get(albumId);
    if (!group?.size) return;
    const payload = JSON.stringify(message);
    for (const conn of group.values()) {
      if (conn.id !== exceptId) send(conn, payload);
    }
  };

  const announcePeers = (albumId: string, exceptId?: string): void =>
    broadcast(albumId, { t: 'peers', peers: peersOf(albumId) }, exceptId);

  const drop = (conn: Connection): void => {
    const group = groups.get(conn.albumId);
    if (!group?.delete(conn.id)) return;
    if (group.size === 0) groups.delete(conn.albumId);
    else announcePeers(conn.albumId);
  };

  return {
    /** The album as it stands, for a plain read. Nothing is bumped, nobody is told. */
    snapshot(token: string): AlbumUpdate {
      const album = repo.get(token);
      return { album, rev: revisions.get(album.id) ?? 0 };
    },

    /**
     * The line every mutation route now ends with. It reads the album back,
     * gives that reading a revision, tells everybody else, and hands the same
     * pair to the caller — so the answer to the request and the push to the
     * others are the same album at the same revision, by construction.
     */
    publish(req: FastifyRequest, token: string): AlbumUpdate {
      const album = repo.get(token);
      const rev = bump(album.id);
      const header = req.headers[SOCKET_HEADER];
      broadcast(
        album.id,
        { t: 'album', rev, album, by: req.person },
        typeof header === 'string' ? header : undefined,
      );
      return { album, rev };
    },

    /**
     * The album has been deleted. Everyone still looking at it is told once and
     * then shown the door: there is nothing left to reconnect to.
     */
    gone(albumId: string): void {
      broadcast(albumId, { t: 'gone' });
      for (const conn of groups.get(albumId)?.values() ?? []) {
        conn.socket.close(LIVE_CLOSE_GONE, 'album deleted');
      }
      groups.delete(albumId);
      revisions.delete(albumId);
    },

    /** The socket route itself, plus the heartbeat that keeps the roster honest. */
    plugin: async function realtimeRoutes(app: FastifyInstance): Promise<void> {
      app.get<{ Params: { token: string } }>(LIVE_ROUTE, { websocket: true }, (socket, req) => {
        let albumId: string;
        try {
          albumId = repo.albumId(req.params.token);
        } catch {
          // A link that has been deleted, or was never real. Say so and stop:
          // reconnecting cannot make an album exist.
          socket.close(LIVE_CLOSE_GONE, 'no such album');
          return;
        }

        const conn: Connection = {
          id: randomBytes(9).toString('base64url'),
          socket,
          albumId,
          // A browser cannot put a header on a handshake, so this is normally
          // null here and filled in by `hello`. Anything that is not a browser
          // can send the header, and then it is already right.
          person: req.person,
          alive: true,
          greeted: false,
        };
        groupOf(albumId).set(conn.id, conn);

        send(
          conn,
          JSON.stringify({
            t: 'welcome',
            id: conn.id,
            rev: revisions.get(albumId) ?? 0,
            peers: peersOf(albumId),
          } satisfies LiveServerMessage),
        );
        announcePeers(albumId, conn.id);

        socket.on('message', (raw: Buffer) => {
          if (conn.greeted) return;
          let message: LiveClientMessage;
          try {
            message = JSON.parse(raw.toString('utf8')) as LiveClientMessage;
          } catch {
            return;
          }
          if (message?.t !== 'hello') return;

          conn.greeted = true;
          const person = identity.personByDeviceKey(
            typeof message.deviceKey === 'string' ? message.deviceKey : undefined,
          );
          // A key this server does not know is not a failure: it is a child
          // without a passport, as welcome here as everywhere else in the app.
          if (!person || person.id === conn.person?.id) return;
          conn.person = person;
          announcePeers(albumId);
        });

        socket.on('pong', () => (conn.alive = true));
        socket.on('error', () => drop(conn));
        socket.on('close', () => drop(conn));
      });

      /**
       * A socket that was quietly cut — a phone that went into a tunnel, a
       * proxy that gave up — stays open as far as this process is concerned,
       * and would sit in the roster as a child who is not there. The ping is
       * what finds those, and it doubles as the traffic that stops an idle
       * proxy from closing a connection nobody happens to be typing on.
       */
      const heartbeat = setInterval(() => {
        for (const group of groups.values()) {
          for (const conn of [...group.values()]) {
            if (!conn.alive) {
              conn.socket.terminate();
              drop(conn);
              continue;
            }
            conn.alive = false;
            try {
              conn.socket.ping();
            } catch {
              drop(conn);
            }
          }
        }
      }, LIVE_HEARTBEAT_MS);
      // Nothing here should keep a process — or a test run — alive.
      heartbeat.unref();
      app.addHook('onClose', async () => clearInterval(heartbeat));
    },
  };
}

export type Realtime = ReturnType<typeof createRealtime>;
