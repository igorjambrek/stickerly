-- Passports: a way to tell children apart without asking them anything.
--
-- A person is a picture and a made-up name. There is no email, no password and
-- no way back to a real child — the credential is a random key held by the
-- browser, and a second device gets one by showing a code the first device
-- generated. That is the whole account system.
--
-- Album access is unchanged: it is still the secret edit token in the URL. What
-- these tables add is *who* is holding it, which is what makes a cross-device
-- album list, a member roster and per-child attribution possible.

CREATE TABLE people (
  id         TEXT PRIMARY KEY,
  nickname   TEXT NOT NULL DEFAULT '',
  avatar     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One row per browser. Only the SHA-256 of the key is kept: a copy of this
-- database must not hand anyone a working passport.
CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  person_id    TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  key_hash     TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX devices_person ON devices(person_id);

-- Codes are short enough for a six-year-old to copy off a screen, which is only
-- safe because they expire in minutes, work once, and burn after a few wrong
-- guesses. Both code tables have the same shape for that reason.
CREATE TABLE pairings (
  code       TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

CREATE TABLE album_invites (
  code       TEXT PRIMARY KEY,
  album_id   TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES people(id) ON DELETE SET NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

-- Nullable because every album made before this migration has no owner, and
-- because SQLite will not add a column with a REFERENCES clause and NOT NULL.
ALTER TABLE albums ADD COLUMN owner_person_id TEXT REFERENCES people(id) ON DELETE SET NULL;

-- Who put the photo here. Cleared when the slot is emptied, and it travels with
-- the sticker when two slots are swapped.
ALTER TABLE slots ADD COLUMN filled_by TEXT REFERENCES people(id) ON DELETE SET NULL;

-- album_members was created in 001 for exactly this feature, but it describes a
-- member without identifying one: a nickname and a role, and no link to any
-- person. It has never had a row or a single reference in the code, so it is
-- cheaper to recreate it than to bolt a column on. Nickname and avatar are
-- deliberately absent now — they are read live from `people`, so a child who
-- renames themselves is renamed in every album at once.
DROP TABLE album_members;
CREATE TABLE album_members (
  id         TEXT PRIMARY KEY,
  album_id   TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  person_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'editor',
  created_at TEXT NOT NULL,
  UNIQUE (album_id, person_id)
);
CREATE INDEX album_members_album ON album_members(album_id);
