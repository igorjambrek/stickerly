/**
 * The album's live connection.
 *
 * An album is a thing two children build together, so the editor cannot only
 * find out what the other one did by being reloaded. This is the half that
 * listens: one socket per open album, opened with the same secret link the rest
 * of the app uses, carrying whole albums downstream and almost nothing back up.
 *
 * Edits deliberately do not go through here. They stay ordinary HTTP requests,
 * where the errors, the retries and the "saving / saved" note already work, and
 * the socket is only how *everybody else* hears about them. That is what keeps
 * a lost connection boring: nothing stops working, the album simply stops
 * moving on its own until the socket comes back.
 *
 * Coming back is this file's other job. A phone locks, a train enters a tunnel,
 * a server is redeployed mid-afternoon — so the connection retries with a
 * backoff, wakes immediately when the tab is looked at again or the network
 * returns, and asks for the album outright after any gap rather than trying to
 * work out what it missed.
 */

import { useEffect } from 'react';
import type { LiveServerMessage } from '@album/shared';
import { LIVE_CLOSE_GONE, livePath, translator } from '@album/shared';
import { setSocketId } from './api.ts';
import { readDeviceKey } from './deviceKey.ts';
import { useLangStore } from './lang.ts';
import { useStore } from './store.ts';

/** A second, doubling to fifteen, jittered so a restarted server is not stormed. */
const retryDelay = (attempt: number): number =>
  Math.min(15_000, 2 ** attempt * 1000) * (0.7 + Math.random() * 0.6);

const liveUrl = (token: string): string => {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}${livePath(token)}`;
};

interface Listener {
  onMessage: (message: LiveServerMessage) => void;
  /** Called with false the moment the connection drops, true when it is back. */
  onLive: (live: boolean) => void;
}

/**
 * A blip is not an outage. The bar only says "reconnecting" once a gap has
 * lasted long enough that the child is genuinely looking at a page standing
 * still — which also covers the first moment of a load, when the socket is
 * simply still on its way.
 */
const OFFLINE_GRACE_MS = 2500;

/**
 * Keeps a socket open to one album for as long as the returned disposer has not
 * been called. Everything about the connection — the retrying, the waking, the
 * greeting — is in here; the caller only ever sees messages.
 */
export function connectAlbum(token: string, listener: Listener): () => void {
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let stopped = false;

  function open(): void {
    if (stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(liveUrl(token));
    } catch {
      // A browser that will not open the socket at all — an exotic privacy
      // setting, a blocked scheme. The editor is expected to survive this.
      retry();
      return;
    }
    socket = ws;

    ws.onopen = () => {
      attempt = 0;
      listener.onLive(true);
      // The passport cannot ride on a WebSocket handshake — a browser will not
      // put a header on one — so it is the first thing said instead. It buys a
      // face in the roster and nothing else.
      const deviceKey = readDeviceKey();
      ws.send(JSON.stringify(deviceKey ? { t: 'hello', deviceKey } : { t: 'hello' }));
    };

    ws.onmessage = (event) => {
      if (stopped) return;
      try {
        listener.onMessage(JSON.parse(String(event.data)) as LiveServerMessage);
      } catch {
        // A message this build does not understand is not worth a broken editor.
      }
    };

    ws.onclose = (event) => {
      socket = null;
      // The album is gone. There is nothing to reconnect to, and the message
      // just before this one has already said so.
      if (event.code === LIVE_CLOSE_GONE) stopped = true;
      // A connection that has been disposed of — the screen closed, the album
      // deleted — says nothing on its way out. The close arrives after the
      // caller has stopped listening, and by then a warning about a connection
      // nobody is waiting on would land on whatever they are looking at now.
      if (stopped) return;
      listener.onLive(false);
      retry();
    };

    // A failed connection also closes, so `onclose` does the scheduling and
    // this only exists to keep the browser from logging an unhandled error.
    ws.onerror = () => ws.close();
  }

  function retry(): void {
    if (stopped || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      open();
    }, retryDelay(attempt++));
  }

  /**
   * A phone that has been asleep does not learn its socket died until it is
   * woken, and by then the child is already looking at a stale page. Both of
   * these mean "you are back": try again now rather than at the end of a
   * backoff that started before the nap.
   */
  const wake = (): void => {
    if (stopped || socket || document.visibilityState !== 'visible') return;
    clearTimeout(timer);
    timer = undefined;
    attempt = 0;
    open();
  };

  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  open();

  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('online', wake);
    socket?.close();
    socket = null;
  };
}

/** At most one of these every few seconds: it is a nudge, not a changelog. */
const REMOTE_TOAST_GAP_MS = 6000;

/**
 * Wires one album's socket to the editor store for as long as the screen is
 * open. Everything it does is a `set` on the store, so nothing else in the
 * editor has to know that any of this exists.
 */
export function useLiveAlbum(token: string): void {
  useEffect(() => {
    const store = useStore.getState;
    /** False until the first `welcome`; after that, every one is a reconnection. */
    let reconnected = false;
    /**
     * Fetch the album again if the socket knows about a change this screen does
     * not — but only once the first load has settled, or the two would race and
     * every album that had ever been edited would be fetched twice on opening.
     */
    const catchUpTo = (rev: number): void => {
      if (store().status === 'loading') {
        const stop = useStore.subscribe((state) => {
          if (state.status === 'loading') return;
          stop();
          catchUpTo(rev);
        });
        return;
      }
      if (rev > store().rev) void store().resync();
    };
    let lastToast = 0;
    let grace: ReturnType<typeof setTimeout> | undefined;

    const dispose = connectAlbum(token, {
      onLive: (live) => {
        if (live) {
          clearTimeout(grace);
          grace = undefined;
          useStore.setState({ offline: false });
          return;
        }
        // The gap is timed from when it opened, not from the last attempt to
        // close it. Every retry that fails arrives here too, and restarting the
        // clock on each one would push the warning further away the longer the
        // connection stayed down — which is precisely backwards.
        if (grace !== undefined || store().offline) return;
        grace = setTimeout(() => {
          grace = undefined;
          // The roster goes with it. Once the socket is gone we no longer know
          // who is in the album, and a face left lit is a claim about somebody
          // who may have closed the tab ten minutes ago.
          useStore.setState({ offline: true, peers: [] });
        }, OFFLINE_GRACE_MS);
      },
      onMessage: (message) => {
        const t = translator(useLangStore.getState().lang);

        switch (message.t) {
          case 'welcome': {
            // Named on every mutation from here on, so the hub knows which
            // socket not to tell about the change we are about to make.
            setSocketId(message.id);
            useStore.setState({ socketId: message.id, peers: message.peers });
            // After a gap the album is fetched outright: the server may have
            // been restarted in the meantime, and a revision from before that
            // says nothing about what was missed. On the first connection there
            // is only the question of whether the album has moved on since the
            // load that is already under way.
            if (reconnected) void store().resync();
            else catchUpTo(message.rev);
            reconnected = true;
            break;
          }

          case 'peers':
            useStore.setState({ peers: message.peers });
            break;

          case 'album': {
            store().accept(message);
            // Stickers appearing by themselves is delightful once you know why,
            // and unnerving until then — so the first one says who is doing it.
            if (Date.now() - lastToast > REMOTE_TOAST_GAP_MS) {
              lastToast = Date.now();
              store().showToast(t('editor.remoteEdit', { name: message.by?.nickname ?? t('editor.someone') }));
            }
            break;
          }

          case 'gone':
            // Somebody deleted the album out from under this screen. Saying so
            // is kinder than letting every next action fail with a 404.
            useStore.setState({ album: null, error: t('editor.albumGone') });
            break;
        }
      },
    });

    return () => {
      dispose();
      clearTimeout(grace);
      setSocketId(null);
      useStore.setState({ socketId: null, peers: [], offline: false });
    };
  }, [token]);
}
