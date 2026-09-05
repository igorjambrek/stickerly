/**
 * The live-editing protocol.
 *
 * Two children on one album is the ordinary case — the invite exists for
 * exactly that — so the editor cannot be a thing that only learns about
 * everybody else on reload. This file is the vocabulary the two sides use to
 * keep up, and it lives here for the same reason the geometry does: a message
 * the server sends and the editor does not understand is a bug you find in
 * production.
 *
 * The shape is borrowed from SignalR, minus the framework: one socket per open
 * album, sockets grouped by album, the server pushing to the group, the client
 * reconnecting quietly on its own. What travels is not a patch but the whole
 * album, exactly as every mutation response already does — the editor has one
 * way to take an album in, and no code anywhere that merges half of one.
 */

import type { Album, Person } from './types.ts';

/**
 * Where the socket lives. Under `/api` so the one proxy rule already in the
 * Caddyfile covers it, and so the dev server's single proxy entry does too.
 */
export const livePath = (token: string): string => `/api/albums/${encodeURIComponent(token)}/live`;

/**
 * Names the socket a change came from, so the hub can leave that one out of the
 * broadcast: the editor that asked for the change already has the answer, and
 * telling it again would mean applying its own edit twice — once from the
 * response, once from the push — with a chance of arriving in the wrong order.
 */
export const SOCKET_HEADER = 'x-nalepko-socket';

/**
 * A revision: a number that only ever goes up, per album.
 *
 * The same change reaches an editor twice over — as the answer to its own
 * request, and as the push meant for everyone else — and two children editing
 * at once means those can interleave any way the network likes. Rather than
 * reason about that, every album that crosses the wire carries the revision it
 * was read at and the editor drops anything older than what it already has.
 *
 * Revisions are seeded from the wall clock, so they keep climbing across a
 * server restart and a client that reconnects to a fresh process is not
 * holding a number from the future.
 */
export interface AlbumUpdate {
  album: Album;
  rev: number;
}

/**
 * Somebody with this album open. A connection, not a child: the same child in
 * two tabs is two peers, and `person` is null for one who followed the link
 * without a passport — which is normal here, not an error.
 */
export interface LivePeer {
  id: string;
  person: Person | null;
}

/** Everything the server says. */
export type LiveServerMessage =
  /** First thing on the wire: who you are to us, and where the album is up to. */
  | { t: 'welcome'; id: string; rev: number; peers: LivePeer[] }
  | ({ t: 'album'; by: Person | null } & AlbumUpdate)
  | { t: 'peers'; peers: LivePeer[] }
  /** The album was deleted while you had it open. */
  | { t: 'gone' };

/**
 * Everything the client says, which is almost nothing: the socket is a
 * listener, and edits still go over HTTP where the error handling already
 * lives. `hello` exists only because a browser cannot put the passport header
 * on a WebSocket handshake, and presence wants a face to show.
 */
export type LiveClientMessage = { t: 'hello'; deviceKey?: string };

/** The album is not there anymore, or never was. Reconnecting will not help. */
export const LIVE_CLOSE_GONE = 4004;

/** How often the server pokes an idle socket to find out whether it is still there. */
export const LIVE_HEARTBEAT_MS = 30_000;
