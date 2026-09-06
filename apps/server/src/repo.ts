/**
 * Album persistence.
 *
 * Albums are addressed by their secret edit token, never by a guessable id, so
 * every mutation takes the token and scopes itself to that album. Sticker
 * numbers are never written to the database — they are recomputed from
 * position on every read, which is what guarantees the number a child sees is
 * the number that gets printed.
 */

import { randomBytes } from 'node:crypto';
import type {
  Album,
  AlbumMember,
  AlbumSize,
  Crop,
  ImageRef,
  Lang,
  MemberRole,
  Page,
  PageKind,
  Slot,
} from '@album/shared';
import {
  DEFAULT_ALBUM_SIZE,
  DEFAULT_CROP,
  DEFAULT_LANG,
  LANGS,
  carryCover,
  getTemplate,
  getVariant,
  isAlbumSize,
  isTemplateId,
  layoutFor,
  renumber,
} from '@album/shared';
import type { Db } from './db/index.ts';
import { config } from './config.ts';

export const newId = (): string => randomBytes(9).toString('base64url');
export const newToken = (): string => randomBytes(16).toString('base64url');

/** A fresh album opens with four pages: one folded sheet, nothing wasted. */
export const INITIAL_PAGES = 4;

export const MAX_TITLE = 60;
export const MAX_LABEL = 28;
export const MAX_NAME = 30;

export const clampText = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

const normaliseCrop = (c: unknown): Crop => {
  const raw = (c ?? {}) as Partial<Crop>;
  const scale = typeof raw.scale === 'number' && Number.isFinite(raw.scale) ? raw.scale : 1;
  return {
    x: clamp01(raw.x, DEFAULT_CROP.x),
    y: clamp01(raw.y, DEFAULT_CROP.y),
    scale: Math.min(4, Math.max(1, scale)),
  };
};

const normaliseLang = (v: unknown): Lang => (LANGS.includes(v as Lang) ? (v as Lang) : DEFAULT_LANG);

const normaliseSize = (v: unknown): AlbumSize => (isAlbumSize(v) ? v : DEFAULT_ALBUM_SIZE);

/** A cover id this theme does not have resolves to the theme's own cover. */
const normaliseVariant = (templateId: string, v: unknown): string =>
  getVariant(getTemplate(templateId), typeof v === 'string' ? v : null).id;

/**
 * A theme this app does not have leaves the album on the one it already wears.
 * `getTemplate` would fall back to football, which is the right answer when an
 * album is being made and the wrong one when it already exists.
 */
const normaliseTemplate = (v: unknown, current: string): string => (isTemplateId(v) ? (v as string) : current);

export interface CreateAlbumInput {
  title?: string;
  templateId?: string;
  coverVariantId?: unknown;
  coverImageId?: unknown;
  size?: unknown;
  slotsPerPage?: unknown;
  lang?: unknown;
  ownerName?: string;
  /** The passport that made it, when the child has one. */
  ownerPersonId?: string | null;
}

export interface CreatedAlbum {
  id: string;
  editToken: string;
}

/** Enough to draw an album's card on the home screen, and to open it. */
export interface AlbumSummary {
  editToken: string;
  title: string;
  templateId: string;
  coverVariantId: string;
  role: MemberRole;
  updatedAt: string;
}

/** Thrown for anything the caller could have avoided; routes turn these into 4xx. */
export class NotFound extends Error {}
export class Invalid extends Error {}
/** No passport on a request that needs one. Never thrown by an album route. */
export class NoPassport extends Error {}

export function createRepo(db: Db) {
  const q = {
    albumByToken: db.prepare('SELECT * FROM albums WHERE edit_token = ?'),
    albumById: db.prepare('SELECT * FROM albums WHERE id = ?'),
    pagesOf: db.prepare('SELECT * FROM pages WHERE album_id = ? ORDER BY position, id'),
    slotsOf: db.prepare(
      `SELECT s.* FROM slots s JOIN pages p ON p.id = s.page_id
       WHERE p.album_id = ? ORDER BY p.position, p.id, s.position, s.id`,
    ),
    imagesOf: db.prepare('SELECT id, w, h FROM images WHERE album_id = ? ORDER BY created_at'),
    touch: db.prepare('UPDATE albums SET updated_at = ? WHERE id = ?'),
    insertAlbum: db.prepare(
      `INSERT INTO albums (id, title, template_id, cover_variant, size, slots_per_page, lang, owner_name,
                           owner_person_id, edit_token, created_at, updated_at)
       VALUES (@id, @title, @templateId, @coverVariant, @size, @slotsPerPage, @lang, @ownerName,
               @ownerPersonId, @editToken, @now, @now)`,
    ),

    /**
     * The roster is album data, so it is read here with everything else rather
     * than through its own endpoint. Nicknames and avatars are joined live from
     * `people`, never copied, so a child who renames themselves is renamed in
     * every album they have ever joined.
     */
    membersOf: db.prepare(
      `SELECT p.id, p.nickname, p.avatar, m.role, m.created_at
       FROM album_members m JOIN people p ON p.id = m.person_id
       WHERE m.album_id = ? ORDER BY m.created_at, p.id`,
    ),
    insertMember: db.prepare(
      `INSERT OR IGNORE INTO album_members (id, album_id, person_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    albumsOfPerson: db.prepare(
      `SELECT a.edit_token, a.title, a.template_id, a.cover_variant, a.updated_at, m.role
       FROM album_members m JOIN albums a ON a.id = m.album_id
       WHERE m.person_id = ? ORDER BY a.updated_at DESC`,
    ),
    setOwner: db.prepare('UPDATE albums SET owner_person_id = ? WHERE id = ? AND owner_person_id IS NULL'),
    insertPage: db.prepare('INSERT INTO pages (id, album_id, position, kind, title) VALUES (?, ?, ?, ?, ?)'),
    insertSlot: db.prepare('INSERT INTO slots (id, page_id, position) VALUES (?, ?, ?)'),
    deletePage: db.prepare('DELETE FROM pages WHERE id = ? AND album_id = ?'),
    setPagePosition: db.prepare('UPDATE pages SET position = ? WHERE id = ?'),
    setPageTitle: db.prepare('UPDATE pages SET title = ? WHERE id = ? AND album_id = ?'),
    countPages: db.prepare('SELECT COUNT(*) AS n FROM pages WHERE album_id = ?'),
    slotInAlbum: db.prepare(
      `SELECT s.* FROM slots s JOIN pages p ON p.id = s.page_id WHERE s.id = ? AND p.album_id = ?`,
    ),
    updateSlot: db.prepare(
      `UPDATE slots SET label = @label, image_id = @imageId, crop_x = @cropX, crop_y = @cropY,
              crop_scale = @cropScale, filled_by = @filledBy
       WHERE id = @id`,
    ),
    insertImage: db.prepare('INSERT INTO images (id, album_id, w, h, created_at) VALUES (?, ?, ?, ?, ?)'),
    setImageSize: db.prepare('UPDATE images SET w = ?, h = ? WHERE id = ? AND album_id = ?'),
    imageInAlbum: db.prepare('SELECT id FROM images WHERE id = ? AND album_id = ?'),
    countImages: db.prepare('SELECT COUNT(*) AS n FROM images WHERE album_id = ?'),
    updateAlbum: db.prepare(
      'UPDATE albums SET title = @title, lang = @lang, owner_name = @ownerName, updated_at = @now WHERE id = @id',
    ),
    updateCover: db.prepare(
      `UPDATE albums SET template_id = @templateId, cover_variant = @variant, cover_image_id = @imageId,
              cover_crop_x = @cropX, cover_crop_y = @cropY, cover_crop_scale = @cropScale, updated_at = @now
       WHERE id = @id`,
    ),
    deleteAlbum: db.prepare('DELETE FROM albums WHERE id = ?'),
  };

  type AlbumRow = {
    id: string;
    title: string;
    template_id: string;
    cover_variant: string;
    cover_image_id: string | null;
    cover_crop_x: number;
    cover_crop_y: number;
    cover_crop_scale: number;
    size: string;
    slots_per_page: number;
    lang: string;
    owner_name: string;
    owner_person_id: string | null;
    edit_token: string;
    created_at: string;
    updated_at: string;
  };
  type MemberRow = { id: string; nickname: string; avatar: string; role: string; created_at: string };
  type PageRow = { id: string; album_id: string; position: number; kind: string; title: string };
  type SlotRow = {
    id: string;
    page_id: string;
    position: number;
    label: string;
    image_id: string | null;
    crop_x: number;
    crop_y: number;
    crop_scale: number;
    filled_by: string | null;
  };

  const touch = (albumId: string) => q.touch.run(new Date().toISOString(), albumId);

  /** Add a page and its slots. The album's grid decides how many. */
  const insertPageWithSlots = db.transaction(
    (albumId: string, position: number, slotCount: number, kind: PageKind = 'sticker') => {
      const pageId = newId();
      q.insertPage.run(pageId, albumId, position, kind, '');
      for (let i = 0; i < slotCount; i++) q.insertSlot.run(newId(), pageId, i);
      return pageId;
    },
  );

  function requireAlbumRow(token: string): AlbumRow {
    const row = q.albumByToken.get(token) as AlbumRow | undefined;
    if (!row) throw new NotFound('album not found');
    return row;
  }

  return {
    create(input: CreateAlbumInput): CreatedAlbum {
      const id = newId();
      const editToken = newToken();
      const template = getTemplate(input.templateId ?? '');
      const size = normaliseSize(input.size);
      // Snap to a grid this paper can actually print, rather than rejecting.
      const slotsPerPage = layoutFor(size, input.slotsPerPage).slotsPerPage;
      const now = new Date().toISOString();

      const ownerPersonId = input.ownerPersonId ?? null;

      db.transaction(() => {
        q.insertAlbum.run({
          id,
          title: clampText(input.title, MAX_TITLE) || 'Мој албум',
          templateId: template.id,
          coverVariant: normaliseVariant(template.id, input.coverVariantId),
          size,
          slotsPerPage,
          lang: normaliseLang(input.lang),
          ownerName: clampText(input.ownerName, MAX_NAME),
          ownerPersonId,
          editToken,
          now,
        });
        // The owner is a member too, so one query answers "which albums are mine".
        if (ownerPersonId) q.insertMember.run(newId(), id, ownerPersonId, 'owner', now);
        for (let i = 0; i < INITIAL_PAGES; i++) insertPageWithSlots(id, i, slotsPerPage);
      })();

      return { id, editToken };
    },

    /** The full album, with numbering derived from position. */
    get(token: string): Album {
      const row = requireAlbumRow(token);
      const pageRows = q.pagesOf.all(row.id) as PageRow[];
      const slotRows = q.slotsOf.all(row.id) as SlotRow[];

      const slotsByPage = new Map<string, Slot[]>();
      for (const s of slotRows) {
        const list = slotsByPage.get(s.page_id) ?? [];
        list.push({
          id: s.id,
          pageId: s.page_id,
          position: s.position,
          number: 0, // filled in by renumber below
          label: s.label,
          imageId: s.image_id,
          crop: { x: s.crop_x, y: s.crop_y, scale: s.crop_scale },
          filledBy: s.filled_by,
        });
        slotsByPage.set(s.page_id, list);
      }

      const pages: Page[] = pageRows.map((p) => ({
        id: p.id,
        position: p.position,
        kind: p.kind as PageKind,
        title: p.title,
        slots: slotsByPage.get(p.id) ?? [],
      }));

      const size = normaliseSize(row.size);
      return {
        id: row.id,
        title: row.title,
        templateId: row.template_id,
        coverVariantId: normaliseVariant(row.template_id, row.cover_variant),
        coverImageId: row.cover_image_id,
        coverCrop: { x: row.cover_crop_x, y: row.cover_crop_y, scale: row.cover_crop_scale },
        size,
        slotsPerPage: layoutFor(size, row.slots_per_page).slotsPerPage,
        lang: normaliseLang(row.lang),
        ownerName: row.owner_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        pages: renumber(pages),
        images: q.imagesOf.all(row.id) as ImageRef[],
        ownerPersonId: row.owner_person_id,
        members: (q.membersOf.all(row.id) as MemberRow[]).map(
          (m): AlbumMember => ({
            id: m.id,
            nickname: m.nickname,
            avatar: m.avatar,
            role: m.role === 'owner' ? 'owner' : 'editor',
            joinedAt: m.created_at,
          }),
        ),
      };
    },

    albumId(token: string): string {
      return requireAlbumRow(token).id;
    },

    /** The other direction, for a child arriving with an invite code instead of a link. */
    editTokenOf(albumId: string): string {
      const row = q.albumById.get(albumId) as AlbumRow | undefined;
      if (!row) throw new NotFound('album not found');
      return row.edit_token;
    },

    /**
     * Size and slots-per-page are deliberately absent: both decide how many
     * slots a page has, and changing that in an album with photos in it means
     * throwing some away. They are chosen once, at creation.
     */
    update(token: string, patch: { title?: string; lang?: unknown; ownerName?: string }): void {
      const row = requireAlbumRow(token);
      q.updateAlbum.run({
        id: row.id,
        title: patch.title === undefined ? row.title : clampText(patch.title, MAX_TITLE) || row.title,
        lang: patch.lang === undefined ? row.lang : normaliseLang(patch.lang),
        ownerName: patch.ownerName === undefined ? row.owner_name : clampText(patch.ownerName, MAX_NAME),
        now: new Date().toISOString(),
      });
    },

    /**
     * The look, on the other hand, is meant to be played with: a different
     * theme, a different cover, a different photo or a different crop, as often
     * as the child likes.
     *
     * The theme is here rather than in `update` because it is the same decision
     * as the cover — which is why the editor asks for both behind one button —
     * and because the two cannot be set independently: cover ids belong to
     * their theme, so a new theme has to choose a cover with it. Unlike size,
     * a theme is only paint: pages, slots, photos and numbers are untouched by
     * it, so an album full of stickers can change its mind about what it is.
     */
    setCover(
      token: string,
      patch: {
        templateId?: unknown;
        coverVariantId?: unknown;
        coverImageId?: string | null;
        coverCrop?: unknown;
      },
    ): void {
      const row = requireAlbumRow(token);

      const imageId = patch.coverImageId === undefined ? row.cover_image_id : patch.coverImageId;
      if (imageId && !q.imageInAlbum.get(imageId, row.id)) throw new Invalid('unknown image');

      const crop =
        patch.coverCrop === undefined
          ? { x: row.cover_crop_x, y: row.cover_crop_y, scale: row.cover_crop_scale }
          : normaliseCrop(patch.coverCrop);

      const templateId =
        patch.templateId === undefined ? row.template_id : normaliseTemplate(patch.templateId, row.template_id);

      // A cover the child named is theirs, in whatever theme it was named for;
      // otherwise a theme change carries the old cover over as best it can.
      const variant =
        patch.coverVariantId !== undefined
          ? normaliseVariant(templateId, patch.coverVariantId)
          : templateId === row.template_id
            ? row.cover_variant
            : carryCover(getTemplate(row.template_id), getTemplate(templateId), row.cover_variant);

      q.updateCover.run({
        id: row.id,
        templateId,
        variant,
        imageId,
        cropX: crop.x,
        cropY: crop.y,
        cropScale: crop.scale,
        now: new Date().toISOString(),
      });
    },

    addPage(token: string): void {
      const row = requireAlbumRow(token);
      const { n } = q.countPages.get(row.id) as { n: number };
      if (n >= config.maxPagesPerAlbum) throw new Invalid('too many pages');
      insertPageWithSlots(row.id, n, layoutFor(row.size, row.slots_per_page).slotsPerPage);
      touch(row.id);
    },

    /** Deleting a page closes the gap, and numbering follows automatically. */
    deletePage(token: string, pageId: string): void {
      const row = requireAlbumRow(token);
      const pages = q.pagesOf.all(row.id) as PageRow[];
      if (pages.length <= 1) throw new Invalid('an album needs at least one page');
      if (!pages.some((p) => p.id === pageId)) throw new NotFound('page not found');

      db.transaction(() => {
        q.deletePage.run(pageId, row.id);
        pages
          .filter((p) => p.id !== pageId)
          .forEach((p, i) => q.setPagePosition.run(i, p.id));
      })();
      touch(row.id);
    },

    setPageTitle(token: string, pageId: string, title: string): void {
      const row = requireAlbumRow(token);
      const result = q.setPageTitle.run(clampText(title, MAX_TITLE), pageId, row.id);
      if (result.changes === 0) throw new NotFound('page not found');
      touch(row.id);
    },

    movePage(token: string, pageId: string, toIndex: number): void {
      const row = requireAlbumRow(token);
      const pages = q.pagesOf.all(row.id) as PageRow[];
      const from = pages.findIndex((p) => p.id === pageId);
      if (from < 0) throw new NotFound('page not found');

      const target = Math.min(pages.length - 1, Math.max(0, Math.trunc(toIndex)));
      const reordered = [...pages];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(target, 0, moved!);

      db.transaction(() => reordered.forEach((p, i) => q.setPagePosition.run(i, p.id)))();
      touch(row.id);
    },

    setSlot(
      token: string,
      slotId: string,
      patch: { label?: string; imageId?: string | null; crop?: unknown },
      personId: string | null = null,
    ): void {
      const row = requireAlbumRow(token);
      const slot = q.slotInAlbum.get(slotId, row.id) as SlotRow | undefined;
      if (!slot) throw new NotFound('slot not found');

      let imageId = patch.imageId === undefined ? slot.image_id : patch.imageId;
      if (imageId && !q.imageInAlbum.get(imageId, row.id)) throw new Invalid('unknown image');

      const crop = patch.crop === undefined ? { x: slot.crop_x, y: slot.crop_y, scale: slot.crop_scale } : normaliseCrop(patch.crop);

      // Attribution follows the photo, not the edit: nudging someone else's
      // crop or fixing their spelling does not make the sticker yours.
      const filledBy = !imageId ? null : imageId === slot.image_id ? slot.filled_by : personId;

      q.updateSlot.run({
        id: slotId,
        label: patch.label === undefined ? slot.label : clampText(patch.label, MAX_LABEL),
        imageId,
        cropX: crop.x,
        cropY: crop.y,
        cropScale: crop.scale,
        filledBy,
      });
      touch(row.id);
    },

    /**
     * Dragging a sticker onto another slot swaps their contents rather than
     * shuffling rows. Numbers belong to positions, so they renumber themselves.
     */
    swapSlots(token: string, aId: string, bId: string): void {
      const row = requireAlbumRow(token);
      const a = q.slotInAlbum.get(aId, row.id) as SlotRow | undefined;
      const b = q.slotInAlbum.get(bId, row.id) as SlotRow | undefined;
      if (!a || !b) throw new NotFound('slot not found');

      db.transaction(() => {
        q.updateSlot.run({ id: a.id, label: b.label, imageId: b.image_id, cropX: b.crop_x, cropY: b.crop_y, cropScale: b.crop_scale, filledBy: b.filled_by });
        q.updateSlot.run({ id: b.id, label: a.label, imageId: a.image_id, cropX: a.crop_x, cropY: a.crop_y, cropScale: a.crop_scale, filledBy: a.filled_by });
      })();
      touch(row.id);
    },

    addImage(token: string, w: number, h: number): string {
      const row = requireAlbumRow(token);
      const { n } = q.countImages.get(row.id) as { n: number };
      if (n >= config.maxImagesPerAlbum) throw new Invalid('too many images');
      const id = newId();
      q.insertImage.run(id, row.id, w, h, new Date().toISOString());
      touch(row.id);
      return id;
    },

    /** Filled in once the upload has been decoded and we know its real size. */
    setImageSize(token: string, imageId: string, w: number, h: number): void {
      const row = requireAlbumRow(token);
      const result = q.setImageSize.run(w, h, imageId, row.id);
      if (result.changes === 0) throw new NotFound('image not found');
    },

    ownsImage(token: string, imageId: string): boolean {
      return Boolean(q.imageInAlbum.get(imageId, requireAlbumRow(token).id));
    },

    /**
     * Joining is idempotent — a child who scans the same invite twice, or who
     * already built this album, is simply already a member.
     */
    addMember(albumId: string, personId: string, role: MemberRole = 'editor'): void {
      q.insertMember.run(newId(), albumId, personId, role, new Date().toISOString());
    },

    albumsOf(personId: string): AlbumSummary[] {
      const rows = q.albumsOfPerson.all(personId) as {
        edit_token: string;
        title: string;
        template_id: string;
        cover_variant: string;
        updated_at: string;
        role: string;
      }[];
      return rows.map((r) => ({
        editToken: r.edit_token,
        title: r.title,
        templateId: r.template_id,
        coverVariantId: normaliseVariant(r.template_id, r.cover_variant),
        role: r.role === 'owner' ? 'owner' : 'editor',
        updatedAt: r.updated_at,
      }));
    },

    /**
     * Adopts albums this browser already knew about into a passport, so the
     * device-local list a child built up before passports existed becomes a
     * list they can carry to another device.
     *
     * Claiming by token is no escalation: whoever holds the token can already
     * delete the album. An album that already has an owner keeps it — the
     * claimer joins as an editor instead.
     */
    claimAlbums(personId: string, tokens: unknown): number {
      if (!Array.isArray(tokens)) return 0;
      let claimed = 0;
      db.transaction(() => {
        for (const token of tokens.slice(0, 50)) {
          const row = q.albumByToken.get(String(token)) as AlbumRow | undefined;
          if (!row) continue;
          const isOwner = q.setOwner.run(personId, row.id).changes > 0;
          q.insertMember.run(newId(), row.id, personId, isOwner ? 'owner' : 'editor', new Date().toISOString());
          claimed++;
        }
      })();
      return claimed;
    },

    /** Pages, slots and images all cascade from the album row. Returns the id so the caller can clean up its photo files. */
    deleteAlbum(token: string): string {
      const row = requireAlbumRow(token);
      q.deleteAlbum.run(row.id);
      return row.id;
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
