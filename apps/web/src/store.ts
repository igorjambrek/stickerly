/**
 * Editor state.
 *
 * Every mutation is a round trip that returns the complete album, so there is
 * one source of truth and no optimistic-merge drift. The child sees a small
 * "saving / saved" note rather than a save button.
 */

import { create } from 'zustand';
import type { Album, Crop, Lang, Slot } from '@album/shared';
import type { CoverPatch } from './api.ts';
import { api } from './api.ts';

export type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

/** One step back. Deliberately shallow: it covers the accidents, not history. */
interface UndoEntry {
  label: string;
  run: () => Promise<Album>;
}

interface State {
  token: string | null;
  album: Album | null;
  status: Status;
  error: string | null;
  undo: UndoEntry | null;
  toast: string | null;

  load: (token: string) => Promise<void>;
  run: (work: () => Promise<Album>, undo?: UndoEntry) => Promise<void>;
  showToast: (message: string) => void;
  undoLast: () => Promise<void>;

  setTitle: (title: string) => Promise<void>;
  setOwnerName: (ownerName: string) => Promise<void>;
  deleteAlbum: () => Promise<void>;
  setCover: (patch: CoverPatch) => Promise<void>;
  setLang: (lang: Lang) => Promise<void>;
  addPage: () => Promise<void>;
  deletePage: (pageId: string) => Promise<void>;
  setPageTitle: (pageId: string, title: string) => Promise<void>;
  setSlot: (slot: Slot, patch: { label?: string; imageId?: string | null; crop?: Crop }) => Promise<void>;
  swapSlots: (slotId: string, withId: string) => Promise<void>;
}

let savedTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => ({
  token: null,
  album: null,
  status: 'idle',
  error: null,
  undo: null,
  toast: null,

  async load(token) {
    set({ token, status: 'loading', error: null });
    try {
      set({ album: await api.getAlbum(token), status: 'idle' });
    } catch (error) {
      set({ status: 'error', error: (error as Error).message });
    }
  },

  async run(work, undo) {
    set({ status: 'saving', error: null });
    try {
      const album = await work();
      set({ album, status: 'saved', undo: undo ?? get().undo });
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => {
        if (get().status === 'saved') set({ status: 'idle' });
      }, 1600);
    } catch (error) {
      set({ status: 'error', error: (error as Error).message });
    }
  },

  showToast(message) {
    set({ toast: message });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 2400);
  },

  async undoLast() {
    const entry = get().undo;
    if (!entry) return;
    set({ undo: null });
    await get().run(entry.run);
  },

  setTitle(title) {
    const token = get().token!;
    return get().run(() => api.updateAlbum(token, { title }));
  },

  setOwnerName(ownerName) {
    const token = get().token!;
    return get().run(() => api.updateAlbum(token, { ownerName }));
  },

  async deleteAlbum() {
    const token = get().token!;
    await api.deleteAlbum(token);
    forgetAlbum(token);
  },

  /** The cover is the one thing a child is meant to keep changing their mind about. */
  setCover(patch) {
    const token = get().token!;
    return get().run(() => api.setCover(token, patch));
  },

  setLang(lang) {
    const token = get().token!;
    return get().run(() => api.updateAlbum(token, { lang }));
  },

  addPage() {
    const token = get().token!;
    return get().run(() => api.addPage(token));
  },

  deletePage(pageId) {
    const token = get().token!;
    return get().run(() => api.deletePage(token, pageId));
  },

  setPageTitle(pageId, title) {
    const token = get().token!;
    return get().run(() => api.updatePage(token, pageId, { title }));
  },

  /**
   * Slot edits are the ones a child undoes: a photo dropped in the wrong place,
   * a name typed over. The previous values are captured before the request.
   */
  setSlot(slot, patch) {
    const token = get().token!;
    const before = { label: slot.label, imageId: slot.imageId, crop: slot.crop };
    return get().run(() => api.setSlot(token, slot.id, patch), {
      label: 'slot',
      run: () => api.setSlot(token, slot.id, before),
    });
  },

  swapSlots(slotId, withId) {
    const token = get().token!;
    return get().run(() => api.swapSlots(token, slotId, withId), {
      label: 'swap',
      run: () => api.swapSlots(token, slotId, withId),
    });
  },
}));

/** Albums the child has made on this device, so they can get back to them. */
const RECENT_KEY = 'nalepko.recent';

export interface RecentAlbum {
  token: string;
  title: string;
  templateId: string;
  coverVariantId?: string;
  at: number;
}

export function readRecent(): RecentAlbum[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentAlbum[];
    return Array.isArray(raw) ? raw.slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function rememberAlbum(album: Album, token: string): void {
  try {
    const others = readRecent().filter((a) => a.token !== token);
    const entry: RecentAlbum = {
      token,
      title: album.title,
      templateId: album.templateId,
      coverVariantId: album.coverVariantId,
      at: Date.now(),
    };
    localStorage.setItem(RECENT_KEY, JSON.stringify([entry, ...others].slice(0, 12)));
  } catch {
    // A private window with storage disabled is not a reason to fail.
  }
}

export function forgetAlbum(token: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(readRecent().filter((a) => a.token !== token)));
  } catch {
    // A private window with storage disabled is not a reason to fail.
  }
}
