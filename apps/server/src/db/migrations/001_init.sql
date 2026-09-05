-- Albums are reached by a secret link rather than an account: no sign-up for a
-- child, and the same mechanism becomes the sharing feature later on.
CREATE TABLE albums (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  template_id TEXT NOT NULL,
  lang        TEXT NOT NULL,
  owner_name  TEXT NOT NULL DEFAULT '',
  edit_token  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE images (
  id         TEXT PRIMARY KEY,
  album_id   TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  w          INTEGER NOT NULL,
  h          INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX images_album ON images(album_id);

CREATE TABLE pages (
  id       TEXT PRIMARY KEY,
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  kind     TEXT NOT NULL DEFAULT 'sticker',
  title    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX pages_album ON pages(album_id, position);

-- Note the absence of a sticker number. Numbering is purely positional, so it
-- is derived on every read instead of stored; that makes it impossible for the
-- number on screen to drift from the number that gets printed.
CREATE TABLE slots (
  id         TEXT PRIMARY KEY,
  page_id    TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  image_id   TEXT REFERENCES images(id) ON DELETE SET NULL,
  crop_x     REAL NOT NULL DEFAULT 0.5,
  crop_y     REAL NOT NULL DEFAULT 0.5,
  crop_scale REAL NOT NULL DEFAULT 1
);
CREATE INDEX slots_page ON slots(page_id, position);

-- Unused in v1, but the sharing feature is the reason this app has a server at
-- all, so the table it will need exists from the start.
CREATE TABLE album_members (
  id         TEXT PRIMARY KEY,
  album_id   TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  nickname   TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'editor',
  created_at TEXT NOT NULL
);
CREATE INDEX album_members_album ON album_members(album_id);
