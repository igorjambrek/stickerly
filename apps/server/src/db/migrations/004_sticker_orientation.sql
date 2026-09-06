-- Which way up a sticker stands, and which way round the photo in it is.
--
-- `sticker_orientation` joins `size` and `slots_per_page` in the group of
-- choices made once, at creation: together they decide the page grid, and
-- re-cutting that in an album full of photos would throw some away. Every
-- album written before this column existed stands its stickers up, which is
-- what the default says.
ALTER TABLE albums ADD COLUMN sticker_orientation TEXT NOT NULL DEFAULT 'portrait';

-- A slot may stand the other way round from its album — the team photo in an
-- album of portraits — and when it does it takes the room of two, so its
-- `position` names the first grid cell it covers rather than a running index.
-- An empty string means "however the album stands", which is what every slot
-- written before this column existed meant, in an album of either kind.
ALTER TABLE slots ADD COLUMN orientation TEXT NOT NULL DEFAULT '';

-- A turn is part of the crop, not a separate kind of edit, so it is stored
-- beside the rest of the crop in both places a crop lives: on the slot and on
-- the cover. Degrees clockwise, and only ever 0, 90, 180 or 270.
ALTER TABLE albums ADD COLUMN cover_crop_rotate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE slots ADD COLUMN crop_rotate INTEGER NOT NULL DEFAULT 0;
