/**
 * One editor's socket, as the server sees it.
 *
 * These talk to a real socket on a real port rather than to the hub directly,
 * because the things that break here are the joins — the route, the exclusion
 * header, the close code — and none of those are visible from inside the
 * module. The client end connects through `livePath()`, the same helper the
 * editor uses, so the URL cannot drift apart from the route that serves it.
 */

import assert from 'node:assert/strict';
import type { LiveServerMessage } from '@album/shared';
import { livePath } from '@album/shared';

type Message<T extends LiveServerMessage['t']> = Extract<LiveServerMessage, { t: T }>;

export class LiveClient {
  private readonly queue: LiveServerMessage[] = [];
  private waiting: { type: LiveServerMessage['t']; resolve: (m: never) => void } | null = null;
  /**
   * The close, watched from the moment the socket exists. A server that turns a
   * connection away does it faster than a test can ask about it afterwards, so
   * this cannot be a listener attached on demand.
   */
  private readonly closed: Promise<number>;
  /** The connection id the server gave us, once `welcome` has been read. */
  id = '';

  private constructor(private readonly socket: WebSocket) {
    this.closed = new Promise((resolve) =>
      socket.addEventListener('close', (event) => resolve(event.code), { once: true }),
    );
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as LiveServerMessage;
      if (this.waiting?.type === message.t) {
        const { resolve } = this.waiting;
        this.waiting = null;
        resolve(message as never);
        return;
      }
      this.queue.push(message);
    });
  }

  static async open(wsBase: string, token: string): Promise<LiveClient> {
    const socket = new WebSocket(`${wsBase}${livePath(token)}`);
    const client = new LiveClient(socket);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error('could not connect')), { once: true });
    });
    return client;
  }

  /** Opened, greeted, and ready to be told about other people's edits. */
  static async ready(wsBase: string, token: string, deviceKey?: string): Promise<LiveClient> {
    const client = await LiveClient.open(wsBase, token);
    client.id = (await client.next('welcome')).id;
    client.socket.send(JSON.stringify(deviceKey ? { t: 'hello', deviceKey } : { t: 'hello' }));
    return client;
  }

  next<T extends LiveServerMessage['t']>(type: T, ms = 3000): Promise<Message<T>> {
    const found = this.queue.findIndex((m) => m.t === type);
    if (found >= 0) return Promise.resolve(this.queue.splice(found, 1)[0] as Message<T>);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        reject(new Error(`no '${type}' message within ${ms}ms`));
      }, ms);
      this.waiting = {
        type,
        resolve: ((m: Message<T>) => {
          clearTimeout(timer);
          resolve(m);
        }) as (m: never) => void,
      };
    });
  }

  /**
   * Keep reading pushes of one kind until one of them satisfies the caller.
   *
   * A single edit can be announced more than once — a passport arriving after
   * the handshake re-sends the roster, an upload and the placing of that photo
   * are two changes — so a journey waits for the state it is after rather than
   * for the next message to happen to be it.
   */
  async until<T extends LiveServerMessage['t']>(
    type: T,
    matches: (message: Message<T>) => boolean,
    ms = 3000,
  ): Promise<Message<T>> {
    const deadline = Date.now() + ms;
    for (;;) {
      const message = await this.next(type, Math.max(1, deadline - Date.now()));
      if (matches(message)) return message;
    }
  }

  /**
   * Nothing of one kind for a moment.
   *
   * The narrower half of `hearsNothing`, for a socket that is legitimately
   * being told other things — a roster changing as children come and go —
   * while the question is only whether it was sent back its own edit.
   */
  async hearsNo(type: LiveServerMessage['t'], ms = 300): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
    assert.deepEqual(
      this.queue.filter((m) => m.t === type),
      [],
      `expected this socket to be left out of '${type}'`,
    );
  }

  /** Nothing at all for a moment — which is the whole point of the exclusion header. */
  async hearsNothing(ms = 300): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
    assert.deepEqual(this.queue, [], 'expected this socket to be left out');
  }

  closeCode(ms = 3000): Promise<number> {
    const late = new Promise<number>((_, reject) =>
      setTimeout(() => reject(new Error(`the socket was still open after ${ms}ms`)), ms).unref(),
    );
    return Promise.race([this.closed, late]);
  }

  close(): void {
    this.socket.close();
  }
}
