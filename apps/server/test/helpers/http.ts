/**
 * One browser, as the server sees it.
 *
 * A journey has two or three children in it at once, each holding their own
 * passport and their own socket, and the thing that most often goes wrong in
 * this app is a header: the device key that says who filled a sticker, the
 * socket id that keeps an editor from hearing its own edit. Wrapping those up
 * per child means a test can never accidentally send Мила's edit as Вук.
 */

import assert from 'node:assert/strict';
import { SOCKET_HEADER } from '@album/shared';

const DEVICE_HEADER = 'x-nalepko-device';

export interface BrowserOptions {
  /** The passport this browser holds, if it has one. Most children have none. */
  deviceKey?: string;
  /** Its live socket, so a push it caused is not sent back to it. */
  socketId?: string;
}

export interface Browser {
  readonly deviceKey?: string;
  /** The response itself, whatever it is — for statuses, headers and bytes. */
  raw(method: string, url: string, body?: unknown): Promise<Response>;
  get<T>(url: string): Promise<T>;
  post<T>(url: string, body?: unknown): Promise<T>;
  put<T>(url: string, body: unknown): Promise<T>;
  patch<T>(url: string, body: unknown): Promise<T>;
  del<T>(url: string): Promise<T>;
  /** A photo off the child's own device, sent exactly as the editor sends it. */
  upload<T>(url: string, bytes: Buffer, filename?: string): Promise<T>;
  /** The same browser, now owning up to the socket it is watching through. */
  withSocket(socketId: string): Browser;
}

export function browser(base: string, options: BrowserOptions = {}): Browser {
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    ...(options.deviceKey ? { [DEVICE_HEADER]: options.deviceKey } : {}),
    ...(options.socketId ? { [SOCKET_HEADER]: options.socketId } : {}),
    ...extra,
  });

  const raw = (method: string, url: string, body?: unknown): Promise<Response> =>
    fetch(base + url, {
      method,
      // Announced only when there is one, exactly as the editor does it.
      headers: headers(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const send = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
    const res = await raw(method, url, body);
    assert.ok(res.ok, `${method} ${url} answered ${res.status}: ${await res.clone().text()}`);
    return (await res.json()) as T;
  };

  return {
    deviceKey: options.deviceKey,
    raw,
    get: (url) => send('GET', url),
    post: (url, body) => send('POST', url, body ?? {}),
    put: (url, body) => send('PUT', url, body),
    patch: (url, body) => send('PATCH', url, body),
    del: (url) => send('DELETE', url),
    async upload<T>(url: string, bytes: Buffer, filename = 'photo.jpg'): Promise<T> {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), filename);
      const res = await fetch(base + url, { method: 'POST', headers: headers(), body: form });
      assert.ok(res.ok, `uploading to ${url} answered ${res.status}: ${await res.clone().text()}`);
      return (await res.json()) as T;
    },
    withSocket: (socketId) => browser(base, { ...options, socketId }),
  };
}
