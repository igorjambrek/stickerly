/**
 * Passports: people, the devices they hold, and the short codes that move a
 * passport from one device to another.
 *
 * A person is a picture and a made-up name. The credential is a random key the
 * browser keeps and the server only ever sees the hash of; there is no password
 * to forget, no email to collect, and nothing here that could identify a real
 * child.
 *
 * This module deliberately does not touch albums. Album access is still the
 * secret edit token, exactly as before — knowing who is holding that token is
 * an additional fact, not a new gate. `album_members` therefore lives with the
 * rest of the album data in `repo.ts`; what lives here is the invite code that
 * eventually produces a row in it.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { Lang, Person } from '@album/shared';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  DEFAULT_LANG,
  isAvatarId,
  isCode,
  makeNickname,
  normaliseCode,
  pickNicknameIds,
} from '@album/shared';
import type { Db } from './db/index.ts';
import { config } from './config.ts';
import { Invalid, MAX_NAME, NotFound, clampText, newId, newToken } from './repo.ts';

/**
 * A whole number in `[0, bound)`, drawn without modulo bias. The seeded PRNG in
 * `@album/shared` is for scattering artwork and must never be used here.
 */
function randomInt(bound: number): number {
  const ceiling = Math.floor(0xffffffff / bound) * bound;
  for (;;) {
    const draw = randomBytes(4).readUInt32BE(0);
    if (draw < ceiling) return draw % bound;
  }
}

/** Six characters from the unambiguous alphabet, also without modulo bias. */
function newCode(): string {
  let code = '';
  while (code.length < CODE_LENGTH) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const hashKey = (key: string): string => createHash('sha256').update(key).digest('hex');

export interface NewPassport {
  person: Person;
  /** Returned once, at the moment it is created, and never stored in the clear. */
  deviceKey: string;
}

export interface MintedCode {
  code: string;
  expiresAt: string;
}

interface PersonRow {
  id: string;
  nickname: string;
  avatar: string;
}

interface CodeRow {
  code: string;
  attempts: number;
  expires_at: string;
  used_at: string | null;
}

export function createIdentity(db: Db) {
  const q = {
    insertPerson: db.prepare(
      'INSERT INTO people (id, nickname, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ),
    personById: db.prepare('SELECT id, nickname, avatar FROM people WHERE id = ?'),
    updatePerson: db.prepare('UPDATE people SET nickname = ?, avatar = ?, updated_at = ? WHERE id = ?'),
    insertDevice: db.prepare(
      'INSERT INTO devices (id, person_id, key_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
    ),
    deviceByHash: db.prepare(
      `SELECT p.id, p.nickname, p.avatar, d.id AS device_id, d.last_seen_at
       FROM devices d JOIN people p ON p.id = d.person_id WHERE d.key_hash = ?`,
    ),
    touchDevice: db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?'),

    insertPairing: db.prepare(
      'INSERT INTO pairings (code, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    ),
    pairing: db.prepare('SELECT code, person_id, attempts, expires_at, used_at FROM pairings WHERE code = ?'),
    burnPairing: db.prepare('UPDATE pairings SET attempts = attempts + 1 WHERE code = ?'),
    usePairing: db.prepare('UPDATE pairings SET used_at = ? WHERE code = ?'),
    prunePairings: db.prepare('DELETE FROM pairings WHERE expires_at < ?'),

    insertInvite: db.prepare(
      'INSERT INTO album_invites (code, album_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    ),
    invite: db.prepare(
      'SELECT code, album_id, attempts, expires_at, used_at FROM album_invites WHERE code = ?',
    ),
    burnInvite: db.prepare('UPDATE album_invites SET attempts = attempts + 1 WHERE code = ?'),
    useInvite: db.prepare('UPDATE album_invites SET used_at = ? WHERE code = ?'),
    pruneInvites: db.prepare('DELETE FROM album_invites WHERE expires_at < ?'),
  };

  /**
   * Codes are unique, short and numerous, so a collision is remote — but a
   * primary-key clash would surface as a 500 on a child's screen, which is not
   * a trade worth making for three lines.
   */
  const mint = (insert: (code: string, expiresAt: string) => void): MintedCode => {
    const expiresAt = new Date(Date.now() + config.codeTtlMs).toISOString();
    for (let attempt = 0; ; attempt++) {
      const code = newCode();
      try {
        insert(code, expiresAt);
        return { code, expiresAt };
      } catch (error) {
        if (attempt >= 4 || !String(error).includes('UNIQUE')) throw error;
      }
    }
  };

  /**
   * Every reason to refuse a code answers the same way. A caller told "expired"
   * rather than "no such code" has learned which of their guesses were real,
   * and to the child who simply mistyped the two are the same thing.
   */
  const checkCode = (row: CodeRow | undefined, burn: (code: string) => void): void => {
    if (!row) throw new NotFound('code not found');
    if (row.used_at || row.attempts >= config.maxCodeAttempts || row.expires_at < new Date().toISOString()) {
      throw new NotFound('code not found');
    }
    // Counts retries against a code that exists. This is not what stops
    // guessing — a wrong guess matches no row at all, so it never reaches here;
    // the rate limiter in front of these routes is what does that. What it does
    // stop is a code that reached the wrong person being retried for as long as
    // it lives.
    burn(row.code);
  };

  const newDeviceFor = (personId: string): string => {
    const deviceKey = newToken();
    const now = new Date().toISOString();
    q.insertDevice.run(newId(), personId, hashKey(deviceKey), now, now);
    return deviceKey;
  };

  const person = (personId: string): Person => {
    const row = q.personById.get(personId) as PersonRow | undefined;
    if (!row) throw new NotFound('person not found');
    return row;
  };

  return {
    person,

    /**
     * A person is never nameless. A child who has not picked anything yet
     * arrives as Брзи Лав, which is the privacy feature as much as the
     * onboarding one: the easy path stops being "type your real name".
     */
    createPerson(input: { nickname?: unknown; avatar?: unknown; lang?: unknown } = {}): NewPassport {
      const lang = (input.lang ?? DEFAULT_LANG) as Lang;
      const picked = pickNicknameIds(randomInt);
      const avatar = isAvatarId(input.avatar) ? (input.avatar as string) : picked.avatarId;
      const nickname = clampText(input.nickname, MAX_NAME) || makeNickname(lang, avatar, picked.adjectiveId);

      const id = newId();
      const now = new Date().toISOString();
      const deviceKey = db.transaction(() => {
        q.insertPerson.run(id, nickname, avatar, now, now);
        return newDeviceFor(id);
      })();

      return { person: { id, nickname, avatar }, deviceKey };
    },

    /** Null rather than throwing: identity is optional almost everywhere. */
    personByDeviceKey(key: string | undefined): Person | null {
      if (!key) return null;
      const row = q.deviceByHash.get(hashKey(key)) as
        | (PersonRow & { device_id: string; last_seen_at: string })
        | undefined;
      if (!row) return null;

      // Once an hour is enough to tell a live passport from an abandoned one,
      // and it avoids a write on every single request.
      const now = new Date();
      if (now.getTime() - Date.parse(row.last_seen_at) > 60 * 60 * 1000) {
        q.touchDevice.run(now.toISOString(), row.device_id);
      }
      return { id: row.id, nickname: row.nickname, avatar: row.avatar };
    },

    /** Clearing the nickname regenerates one rather than leaving a child blank. */
    updatePerson(current: Person, patch: { nickname?: unknown; avatar?: unknown; lang?: unknown }): Person {
      const lang = (patch.lang ?? DEFAULT_LANG) as Lang;
      const avatar = isAvatarId(patch.avatar) ? (patch.avatar as string) : current.avatar;
      const asked = patch.nickname === undefined ? current.nickname : clampText(patch.nickname, MAX_NAME);
      const nickname = asked || makeNickname(lang, avatar, pickNicknameIds(randomInt).adjectiveId);

      q.updatePerson.run(nickname, avatar, new Date().toISOString(), current.id);
      return { id: current.id, nickname, avatar };
    },

    mintPairing(personId: string): MintedCode {
      q.prunePairings.run(new Date().toISOString());
      return mint((code, expiresAt) => q.insertPairing.run(code, personId, new Date().toISOString(), expiresAt));
    },

    /** The second device gets its own key. The first one keeps working. */
    claimPairing(rawCode: string): NewPassport {
      const code = normaliseCode(rawCode);
      if (!isCode(code)) throw new Invalid('that is not a code');

      const row = q.pairing.get(code) as (CodeRow & { person_id: string }) | undefined;
      checkCode(row, (c) => q.burnPairing.run(c));
      const personId = row!.person_id;

      return db.transaction(() => {
        q.usePairing.run(new Date().toISOString(), code);
        return { person: person(personId), deviceKey: newDeviceFor(personId) };
      })();
    },

    mintInvite(albumId: string, personId: string | null): MintedCode {
      q.pruneInvites.run(new Date().toISOString());
      return mint((code, expiresAt) =>
        q.insertInvite.run(code, albumId, personId, new Date().toISOString(), expiresAt),
      );
    },

    /** Returns the album to join; making the member row is the repo's business. */
    claimInvite(rawCode: string): { albumId: string } {
      const code = normaliseCode(rawCode);
      if (!isCode(code)) throw new Invalid('that is not a code');

      const row = q.invite.get(code) as (CodeRow & { album_id: string }) | undefined;
      checkCode(row, (c) => q.burnInvite.run(c));

      q.useInvite.run(new Date().toISOString(), code);
      return { albumId: row!.album_id };
    },
  };
}

export type Identity = ReturnType<typeof createIdentity>;
