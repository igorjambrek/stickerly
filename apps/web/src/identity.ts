/**
 * Who this child is, as far as the app is concerned.
 *
 * A passport is created on a deliberate tap — the welcome screen's button on a
 * first visit, making an album, opening the passport screen, claiming a code —
 * and never on a bare page view, so a passing crawler mints nothing and a child
 * who only ever follows a link into an album never becomes an account they did
 * not ask for.
 *
 * Nothing here is allowed to break the app. Every failure path ends with no
 * passport and an editor that works exactly as it did before, because album
 * access is still the secret link and always was.
 */

import { create } from 'zustand';
import type { Lang, Person } from '@album/shared';
import type { AlbumCard, Passport } from './api.ts';
import { api } from './api.ts';
import { readDeviceKey, writeDeviceKey } from './deviceKey.ts';
import { readRecent } from './store.ts';

/** Set once the browser's pre-passport albums have been folded into the account. */
const CLAIMED_KEY = 'nalepko.claimed';

const readFlag = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    // No storage means no upgrade to do, and no way to remember doing it.
    return true;
  }
};

const writeFlag = (key: string): void => {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Worst case the claim is attempted again next load, which is idempotent.
  }
};

interface IdentityState {
  person: Person | null;
  albums: AlbumCard[];
  /** False until the first load has settled, so the UI can avoid flashing. */
  checked: boolean;

  load: () => Promise<void>;
  ensure: (lang: Lang, seed?: { nickname?: string; avatar?: string }) => Promise<Person>;
  update: (patch: { nickname?: string; avatar?: string }, lang: Lang) => Promise<void>;
  adopt: (passport: Passport, opts?: { fresh?: boolean }) => void;
}

export const useIdentity = create<IdentityState>((set, get) => ({
  person: null,
  albums: [],
  checked: false,

  /**
   * Reads the passport, and on the first run folds in whatever albums this
   * browser remembers from before it had one — turning a device-local list into
   * one the child can carry to another device.
   */
  async load() {
    if (!readDeviceKey()) {
      set({ checked: true });
      return;
    }
    try {
      const tokens = readFlag(CLAIMED_KEY) ? [] : readRecent().map((a) => a.token);
      const me = tokens.length ? await api.claimAlbums(tokens) : await api.me();
      if (!readFlag(CLAIMED_KEY)) writeFlag(CLAIMED_KEY);
      set({ person: me.person, albums: me.albums, checked: true });
    } catch {
      // A key this server does not know — a wiped database, a different
      // deployment — is no different from having none.
      set({ person: null, albums: [], checked: true });
    }
  },

  async ensure(lang, seed) {
    const existing = get().person;
    if (existing) return existing;

    const nickname = seed?.nickname?.trim();
    const passport = await api.createPerson({
      lang,
      ...(nickname ? { nickname } : {}),
      ...(seed?.avatar ? { avatar: seed.avatar } : {}),
    });
    // Brand new, on this very browser: whatever it already made is this child's.
    get().adopt(passport, { fresh: true });
    return passport.person;
  },

  async update(patch, lang) {
    const { person } = await api.updateMe({ ...patch, lang });
    set({ person });
  },

  /**
   * A brand new passport, or one that just arrived from another device. Only
   * the first has any claim on the albums this browser remembers making: a
   * passport claimed from another device already knows its own, and sweeping up
   * whatever is lying around on a borrowed tablet is not what that gesture
   * meant.
   */
  adopt(passport, opts) {
    writeDeviceKey(passport.deviceKey);
    if (!opts?.fresh) writeFlag(CLAIMED_KEY);
    set({ person: passport.person, checked: true });
    void get().load();
  },
}));
