-- Two choices a child now makes up front, and one they can change later.
--
-- `size` and `slots_per_page` decide the paper and the page grid, so they are
-- fixed at creation: changing either would mean adding or destroying slots in
-- an album that already has photos in them.
--
-- The cover is the opposite — it is meant to be played with, so the variant
-- and its photo can be changed at any time.
--
-- Existing albums predate the choice and are all big albums with nine
-- stickers to a page, which is what these defaults say.
ALTER TABLE albums ADD COLUMN size TEXT NOT NULL DEFAULT 'a3';
ALTER TABLE albums ADD COLUMN slots_per_page INTEGER NOT NULL DEFAULT 9;

-- An empty variant means "whichever cover this theme leads with", so a row
-- written before covers existed still resolves to something printable.
ALTER TABLE albums ADD COLUMN cover_variant TEXT NOT NULL DEFAULT '';

-- The cover photo is an ordinary album image, so it is served, scoped and
-- cleaned up by the machinery that already exists. NULL default is required:
-- SQLite will not add a column with a REFERENCES clause and a non-null one.
ALTER TABLE albums ADD COLUMN cover_image_id TEXT REFERENCES images(id) ON DELETE SET NULL;
ALTER TABLE albums ADD COLUMN cover_crop_x REAL NOT NULL DEFAULT 0.5;
ALTER TABLE albums ADD COLUMN cover_crop_y REAL NOT NULL DEFAULT 0.5;
ALTER TABLE albums ADD COLUMN cover_crop_scale REAL NOT NULL DEFAULT 1;
