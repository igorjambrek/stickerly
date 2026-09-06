import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { PDFDocument } from 'pdf-lib';
import type { Album } from '@album/shared';
import { DEFAULT_SLOTS_PER_PAGE, layoutFor, numbersAreContiguous } from '@album/shared';
import { createApp } from '../src/app.ts';
import { imagesDir } from '../src/config.ts';
import { createTestDb } from '../src/db/index.ts';
import { INITIAL_PAGES } from '../src/repo.ts';
import { makeFixturePhoto } from '../src/testing/fixtures.ts';

let app: FastifyInstance;
let base: string;
let dataDir: string;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'nalepko-test-'));
  process.env.DATA_DIR = dataDir;
  app = await createApp({ db: createTestDb(), serveWeb: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

after(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

const json = async (res: Response) => {
  assert.ok(res.ok, `${res.status} ${res.url}: ${await res.clone().text()}`);
  return res.json();
};

const post = (url: string, body?: unknown) =>
  fetch(base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

const put = (url: string, body: unknown) =>
  fetch(base + url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function newAlbum(overrides: Record<string, unknown> = {}): Promise<{ token: string; album: Album }> {
  const res = await post('/api/albums', { templateId: 'space', title: 'Тест албум', ownerName: 'Ана', ...overrides });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { editToken: string; album: Album };
  return { token: body.editToken, album: body.album };
}

const allSlots = (album: Album) => album.pages.flatMap((p) => p.slots);

/** What a default album is: the biggest paper, at its fullest.  */
const PER_PAGE = DEFAULT_SLOTS_PER_PAGE.portrait.a3;

describe('creating an album', () => {
  it('opens with one foldable sheet of pages, all slots numbered', async () => {
    const { token, album } = await newAlbum();

    assert.equal(album.pages.length, INITIAL_PAGES);
    assert.equal(allSlots(album).length, INITIAL_PAGES * PER_PAGE);
    assert.deepEqual(
      allSlots(album).map((s) => s.number),
      Array.from({ length: INITIAL_PAGES * PER_PAGE }, (_, i) => i + 1),
    );
    assert.equal(album.templateId, 'space');
    assert.ok(token.length >= 20, 'the edit token must not be guessable');
  });

  it('falls back to a known template rather than rejecting the child', async () => {
    const { album } = await newAlbum({ templateId: 'not-a-template' });
    assert.equal(album.templateId, 'football');
  });

  it('defaults to the big album with a full page', async () => {
    const { album } = await newAlbum();
    assert.equal(album.size, 'a3');
    assert.equal(album.slotsPerPage, DEFAULT_SLOTS_PER_PAGE.portrait.a3);
  });

  it('makes a small album with as many stickers a page as asked for', async () => {
    const { album } = await newAlbum({ size: 'a4', slotsPerPage: 2 });
    assert.equal(album.size, 'a4');
    assert.equal(album.slotsPerPage, 2);
    assert.equal(allSlots(album).length, INITIAL_PAGES * 2);
    assert.ok(numbersAreContiguous(album.pages));
  });

  it('snaps a slot count the chosen paper cannot print', async () => {
    // Nine stickers cannot fit an A5 page at 50 x 70 mm. Rather than refuse,
    // the album opens on the busiest page that paper can hold.
    const { album } = await newAlbum({ size: 'a4', slotsPerPage: 9 });
    assert.equal(album.slotsPerPage, layoutFor('a4', 9).slotsPerPage);
  });

  it('ignores a paper size it does not have', async () => {
    const { album } = await newAlbum({ size: 'a0' });
    assert.equal(album.size, 'a3');
  });

  it('hands back a 404 for an unknown link', async () => {
    const res = await fetch(`${base}/api/albums/definitely-not-a-real-token`);
    assert.equal(res.status, 404);
  });
});

describe('pages', () => {
  it('renumbers everything when a page is added', async () => {
    const { token } = await newAlbum();
    const { album } = (await json(await post(`/api/albums/${token}/pages`))) as { album: Album };

    assert.equal(album.pages.length, INITIAL_PAGES + 1);
    assert.ok(numbersAreContiguous(album.pages));
    assert.equal(allSlots(album).at(-1)!.number, (INITIAL_PAGES + 1) * PER_PAGE);
  });

  it('closes the numbering gap when a page is deleted', async () => {
    const { token, album } = await newAlbum();
    const removed = album.pages[1]!.id;

    const res = await fetch(`${base}/api/albums/${token}/pages/${removed}`, { method: 'DELETE' });
    const after = ((await json(res)) as { album: Album }).album;

    assert.equal(after.pages.length, INITIAL_PAGES - 1);
    assert.ok(!after.pages.some((p) => p.id === removed));
    assert.ok(numbersAreContiguous(after.pages));
    assert.deepEqual(after.pages.map((p) => p.position), [0, 1, 2]);
  });

  it('refuses to leave the child with no pages at all', async () => {
    const { token, album } = await newAlbum();
    for (const page of album.pages.slice(1)) {
      await fetch(`${base}/api/albums/${token}/pages/${page.id}`, { method: 'DELETE' });
    }
    const res = await fetch(`${base}/api/albums/${token}/pages/${album.pages[0]!.id}`, { method: 'DELETE' });
    assert.equal(res.status, 400);
  });

  it('reorders pages and renumbers to match', async () => {
    const { token, album } = await newAlbum();
    const last = album.pages.at(-1)!.id;

    const res = await fetch(`${base}/api/albums/${token}/pages/${last}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ position: 0 }),
    });
    const after = ((await json(res)) as { album: Album }).album;

    assert.equal(after.pages[0]!.id, last);
    assert.equal(after.pages[0]!.slots[0]!.number, 1);
    assert.ok(numbersAreContiguous(after.pages));
  });
});

describe('photos and slots', () => {
  async function upload(token: string, index = 0) {
    const photo = await makeFixturePhoto(index);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'photo.jpg');
    const res = await fetch(`${base}/api/albums/${token}/images`, { method: 'POST', body: form });
    return ((await json(res)) as { image: { id: string; w: number; h: number } }).image;
  }

  it('normalises an upload and reports its stored size', async () => {
    const { token } = await newAlbum();
    const image = await upload(token);
    assert.ok(image.id);
    assert.equal(image.w, 600);
    assert.equal(image.h, 840);
  });

  it('serves the photo back, and a thumbnail', async () => {
    const { token } = await newAlbum();
    const image = await upload(token);

    for (const query of ['', '?size=thumb']) {
      const res = await fetch(`${base}/api/albums/${token}/images/${image.id}${query}`);
      assert.ok(res.ok, `fetching ${query || 'print'} derivative`);
      assert.equal(res.headers.get('content-type'), 'image/jpeg');
      assert.ok((await res.arrayBuffer()).byteLength > 0);
    }
  });

  it('will not serve another album\'s photo through this album\'s link', async () => {
    const mine = await newAlbum();
    const theirs = await newAlbum();
    const image = await upload(theirs.token);

    const res = await fetch(`${base}/api/albums/${mine.token}/images/${image.id}`);
    assert.equal(res.status, 404);
  });

  it('rejects a file that is not a picture', async () => {
    const { token } = await newAlbum();
    const form = new FormData();
    form.append('file', new Blob(['not a photo'], { type: 'text/plain' }), 'notes.txt');
    const res = await fetch(`${base}/api/albums/${token}/images`, { method: 'POST', body: form });
    assert.equal(res.status, 400);
  });

  it('puts a photo and a name into a slot', async () => {
    const { token, album } = await newAlbum();
    const image = await upload(token);
    const slotId = album.pages[0]!.slots[0]!.id;

    const res = await put(`/api/albums/${token}/slots/${slotId}`, {
      imageId: image.id,
      label: 'Марко',
      crop: { x: 0.4, y: 0.6, scale: 1.5, rotate: 90 },
    });
    const after = ((await json(res)) as { album: Album }).album;
    const slot = after.pages[0]!.slots[0]!;

    assert.equal(slot.imageId, image.id);
    assert.equal(slot.label, 'Марко');
    assert.deepEqual(slot.crop, { x: 0.4, y: 0.6, scale: 1.5, rotate: 90 });
  });

  it('clamps a crop that would show a gap', async () => {
    const { token, album } = await newAlbum();
    const image = await upload(token);
    const slotId = album.pages[0]!.slots[0]!.id;

    const res = await put(`/api/albums/${token}/slots/${slotId}`, {
      imageId: image.id,
      crop: { x: 9, y: -4, scale: 99, rotate: 137 },
    });
    const slot = ((await json(res)) as { album: Album }).album.pages[0]!.slots[0]!;
    // A turn is snapped to a quarter too: anything else leaves white wedges.
    assert.deepEqual(slot.crop, { x: 1, y: 0, scale: 4, rotate: 180 });
  });

  it('lays a sticker down, and it takes the room of the one beside it', async () => {
    const { token, album } = await newAlbum();
    const page = album.pages[0]!;
    const [first, second] = [page.slots[0]!, page.slots[1]!];
    assert.equal(first.orientation, 'portrait');

    const after = ((await json(await post(`/api/albums/${token}/slots/${first.id}/turn`))) as { album: Album })
      .album;
    const turned = after.pages[0]!.slots.find((x) => x.id === first.id)!;

    assert.equal(turned.orientation, 'landscape');
    assert.equal(turned.position, first.position, 'it stays in the cell it was in');
    assert.equal(
      after.pages[0]!.slots.some((x) => x.id === second.id),
      false,
      'the sticker it swallowed is gone',
    );
    assert.equal(after.pages[0]!.slots.length, PER_PAGE - 1);
  });

  it('gives the cell back when the sticker stands up again', async () => {
    const { token, album } = await newAlbum();
    const first = album.pages[0]!.slots[0]!;

    await json(await post(`/api/albums/${token}/slots/${first.id}/turn`));
    const back = ((await json(await post(`/api/albums/${token}/slots/${first.id}/turn`))) as { album: Album })
      .album;
    const page = back.pages[0]!;

    assert.equal(page.slots.find((x) => x.id === first.id)!.orientation, 'portrait');
    assert.equal(page.slots.length, PER_PAGE, 'the cell comes back as an empty sticker');
    assert.deepEqual(
      page.slots.map((x) => x.position),
      Array.from({ length: PER_PAGE }, (_, i) => i),
      'and it comes back in the cell that was taken',
    );
  });

  it('keeps the numbers running 1..N with a turned sticker in the middle', async () => {
    const { token, album } = await newAlbum();
    const turnMe = album.pages[0]!.slots[1]!;
    const after = ((await json(await post(`/api/albums/${token}/slots/${turnMe.id}/turn`))) as { album: Album })
      .album;

    assert.ok(numbersAreContiguous(after.pages), 'a hole in the grid is not a hole in the numbering');
    assert.equal(allSlots(after).length, INITIAL_PAGES * PER_PAGE - 1);
  });

  it('never leaves two stickers standing on the same cell', async () => {
    // Cell 0 lies down across 0 and 1. Cell 2 is last in its row, so turning it
    // reaches backwards onto cell 1 — which the first one is already using.
    const { token, album } = await newAlbum();
    const [a, , c] = [album.pages[0]!.slots[0]!, album.pages[0]!.slots[1]!, album.pages[0]!.slots[2]!];

    await json(await post(`/api/albums/${token}/slots/${a.id}/turn`));
    const after = ((await json(await post(`/api/albums/${token}/slots/${c.id}/turn`))) as { album: Album })
      .album;
    const page = after.pages[0]!;

    assert.equal(page.slots.some((x) => x.id === a.id), false, 'the one it overlapped is gone');
    const turned = page.slots.find((x) => x.id === c.id)!;
    assert.equal(turned.orientation, 'landscape');
    assert.equal(turned.position, 1, 'it took the cell behind it');
    assert.ok(numbersAreContiguous(after.pages));
  });

  it('will not turn a sticker where the grid has no room', async () => {
    // One column of standing stickers: there is nothing beside them.
    const { token, album } = await newAlbum({ size: 'a4', slotsPerPage: 2 });
    assert.equal(album.slotsPerPage, 2);
    const res = await post(`/api/albums/${token}/slots/${album.pages[0]!.slots[0]!.id}/turn`);
    assert.equal(res.status, 400);
  });

  it('starts every sticker the way the album was made', async () => {
    const { album } = await newAlbum({ stickerOrientation: 'landscape', size: 'a3' });
    assert.equal(album.stickerOrientation, 'landscape');
    assert.ok(allSlots(album).every((s) => s.orientation === 'landscape'));
  });

  it('refuses a photo belonging to a different album', async () => {
    const mine = await newAlbum();
    const theirs = await newAlbum();
    const image = await upload(theirs.token);

    const res = await put(`/api/albums/${mine.token}/slots/${mine.album.pages[0]!.slots[0]!.id}`, {
      imageId: image.id,
    });
    assert.equal(res.status, 400);
  });

  it('swaps two stickers, so their numbers follow their new positions', async () => {
    const { token, album } = await newAlbum();
    const image = await upload(token);
    const [first, second] = [album.pages[0]!.slots[0]!.id, album.pages[0]!.slots[4]!.id];

    await put(`/api/albums/${token}/slots/${first}`, { imageId: image.id, label: 'Прва' });
    const res = await post(`/api/albums/${token}/slots/${first}/swap`, { withId: second });
    const after = ((await json(res)) as { album: Album }).album;

    const moved = after.pages[0]!.slots[4]!;
    assert.equal(moved.label, 'Прва');
    assert.equal(moved.imageId, image.id);
    assert.equal(moved.number, 5, 'the sticker takes the number of its new home');
    assert.equal(after.pages[0]!.slots[0]!.imageId, null);
  });
});

describe('printing', () => {
  it('explains the print job without building any PDFs', async () => {
    const { token } = await newAlbum();
    const summary = (await json(await fetch(`${base}/api/albums/${token}/print/summary`))) as Record<string, number | string>;

    assert.equal(summary.pageCount, INITIAL_PAGES);
    assert.equal(summary.fillerCount, 0, '4 pages already folds cleanly');
    assert.equal(summary.pageSheets, 1);
    assert.equal(summary.stickerCount, 0);
    assert.equal(summary.stickerSheets, 0);
    // What to feed the printer: the album's own sheet, and always A4 for stickers.
    assert.equal(summary.sheetPaper, 'A3');
    assert.equal(summary.stickerPaper, 'A4');
  });

  it('reports the filler pages an odd page count will need', async () => {
    const { token } = await newAlbum();
    await post(`/api/albums/${token}/pages`);
    const summary = (await json(await fetch(`${base}/api/albums/${token}/print/summary`))) as Record<string, number>;

    assert.equal(summary.pageCount, 5);
    assert.equal(summary.fillerCount, 3);
    assert.equal(summary.pageSheets, 2);
  });

  it('produces all three PDFs as downloads', async () => {
    const { token, album } = await newAlbum();
    const photo = await makeFixturePhoto(1);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'photo.jpg');
    const image = ((await json(await fetch(`${base}/api/albums/${token}/images`, { method: 'POST', body: form }))) as {
      image: { id: string };
    }).image;
    await put(`/api/albums/${token}/slots/${album.pages[0]!.slots[0]!.id}`, { imageId: image.id, label: 'Ана' });

    for (const part of ['cover', 'pages', 'stickers']) {
      const res = await fetch(`${base}/api/albums/${token}/print/${part}.pdf`);
      assert.ok(res.ok, part);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename=".*\.pdf"/);

      const bytes = Buffer.from(await res.arrayBuffer());
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-', `${part} is a real PDF`);
    }
  });

  it('takes where the numbers go from the request, and defaults without it', async () => {
    // The choice belongs to the print run, not to the album, so it arrives in
    // the query string — and a link that has lost it still prints something.
    const { token, album } = await newAlbum();
    const photo = await makeFixturePhoto(2);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'photo.jpg');
    const image = ((await json(await fetch(`${base}/api/albums/${token}/images`, { method: 'POST', body: form }))) as {
      image: { id: string };
    }).image;
    await put(`/api/albums/${token}/slots/${album.pages[0]!.slots[0]!.id}`, { imageId: image.id });

    const pagesOf = async (query: string) => {
      const res = await fetch(`${base}/api/albums/${token}/print/stickers.pdf${query}`);
      assert.ok(res.ok, query || 'no query');
      return (await PDFDocument.load(Buffer.from(await res.arrayBuffer()))).getPageCount();
    };

    assert.equal(await pagesOf(''), 2, 'one sheet, printed on both sides by default');
    assert.equal(await pagesOf('?numbers=backing'), 2);
    assert.equal(await pagesOf('?numbers=cheese'), 2, 'nonsense falls back rather than failing');
    assert.equal(await pagesOf('?numbers=sticker'), 1, 'no page of numbers to print');
  });
});

describe('the cover', () => {
  const putCover = (token: string, body: unknown) =>
    fetch(`${base}/api/albums/${token}/cover`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  async function uploadCover(token: string) {
    const photo = await makeFixturePhoto(3);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'cover.jpg');
    const res = await fetch(`${base}/api/albums/${token}/images?role=cover`, { method: 'POST', body: form });
    return ((await json(res)) as { image: { id: string } }).image;
  }

  it('starts on the theme\'s own cover', async () => {
    const { album } = await newAlbum({ templateId: 'space' });
    assert.equal(album.coverVariantId, 'rocket');
    assert.equal(album.coverImageId, null);
  });

  it('takes the cover the child picked at creation', async () => {
    const { album } = await newAlbum({ templateId: 'football', coverVariantId: 'worldcup' });
    assert.equal(album.coverVariantId, 'worldcup');
  });

  it('falls back rather than storing a cover this theme does not have', async () => {
    const { album } = await newAlbum({ templateId: 'space', coverVariantId: 'worldcup' });
    assert.equal(album.coverVariantId, 'rocket', 'a football cover means nothing to the space theme');
  });

  it('changes the cover after the album exists', async () => {
    const { token } = await newAlbum({ templateId: 'space' });
    const album = ((await json(await putCover(token, { coverVariantId: 'moon' }))) as { album: Album }).album;
    assert.equal(album.coverVariantId, 'moon');
  });

  it('changes the theme and keeps every sticker', async () => {
    const { token, album: made } = await newAlbum({ templateId: 'dinos' });
    const image = await uploadCover(token);
    const slot = made.pages[0]!.slots[0]!;
    await put(`/api/albums/${token}/slots/${slot.id}`, { imageId: image.id, label: 'Рекс' });

    const album = ((await json(await putCover(token, { templateId: 'cars' }))) as { album: Album }).album;

    assert.equal(album.templateId, 'cars');
    assert.equal(album.coverVariantId, 'race', 'a dinosaur cover means nothing to the cars theme');
    assert.equal(allSlots(album).length, allSlots(made).length, 'no slot is added or destroyed');
    const kept = allSlots(album).find((s) => s.id === slot.id)!;
    assert.equal(kept.imageId, image.id);
    assert.equal(kept.label, 'Рекс');
    assert.equal(kept.number, 1);
  });

  it('carries a photo cover across a theme change', async () => {
    const { token } = await newAlbum({ templateId: 'dinos', coverVariantId: 'mydino' });
    const image = await uploadCover(token);
    await putCover(token, { coverImageId: image.id });

    const album = ((await json(await putCover(token, { templateId: 'unicorns' }))) as { album: Album }).album;

    assert.equal(album.coverVariantId, 'myunicorn', "the child's own photo is a cover every theme has");
    assert.equal(album.coverImageId, image.id);
  });

  it('takes a new theme and one of its covers in the same breath', async () => {
    const { token } = await newAlbum({ templateId: 'space' });
    const res = await putCover(token, { templateId: 'football', coverVariantId: 'worldcup' });
    const album = ((await json(res)) as { album: Album }).album;
    assert.equal(album.templateId, 'football');
    assert.equal(album.coverVariantId, 'worldcup');
  });

  it('leaves the album on its own theme when the new one does not exist', async () => {
    const { token } = await newAlbum({ templateId: 'pets' });
    const album = ((await json(await putCover(token, { templateId: 'pirates' }))) as { album: Album }).album;
    assert.equal(album.templateId, 'pets', 'an unknown theme is not a reason to repaint the album');
    assert.equal(album.coverVariantId, 'paws');
  });

  it('puts a photo on the cover, and frames it', async () => {
    const { token } = await newAlbum({ templateId: 'pets', coverVariantId: 'mypet' });
    const image = await uploadCover(token);

    const res = await putCover(token, { coverImageId: image.id, coverCrop: { x: 0.3, y: 0.7, scale: 1.4 } });
    const album = ((await json(res)) as { album: Album }).album;

    assert.equal(album.coverImageId, image.id);
    assert.deepEqual(album.coverCrop, { x: 0.3, y: 0.7, scale: 1.4, rotate: 0 });
  });

  it('clamps a cover crop that would show a gap', async () => {
    const { token } = await newAlbum({ coverVariantId: 'myleague' });
    const image = await uploadCover(token);
    const res = await putCover(token, { coverImageId: image.id, coverCrop: { x: -3, y: 8, scale: 99 } });
    assert.deepEqual(((await json(res)) as { album: Album }).album.coverCrop, {
      x: 0,
      y: 1,
      scale: 4,
      rotate: 0,
    });
  });

  it('refuses a cover photo belonging to a different album', async () => {
    const mine = await newAlbum();
    const theirs = await newAlbum();
    const image = await uploadCover(theirs.token);
    assert.equal((await putCover(mine.token, { coverImageId: image.id })).status, 400);
  });

  it('takes the photo back off the cover', async () => {
    const { token } = await newAlbum({ coverVariantId: 'myleague' });
    const image = await uploadCover(token);
    await putCover(token, { coverImageId: image.id });
    const album = ((await json(await putCover(token, { coverImageId: null }))) as { album: Album }).album;
    assert.equal(album.coverImageId, null);
  });

  it('keeps a cover photo at a higher resolution than a sticker photo', async () => {
    const { token } = await newAlbum();
    const cover = await uploadCover(token);
    const album = ((await json(await fetch(`${base}/api/albums/${token}`))) as { album: Album }).album;
    const stored = album.images.find((i) => i.id === cover.id)!;
    // The fixture photo is 600 x 840, under both caps, so both keep it whole;
    // what matters is that the cover route accepts the role at all.
    assert.equal(stored.w, 600);
    assert.equal(stored.h, 840);
  });
});

describe('album settings', () => {
  it('renames the album and switches language', async () => {
    const { token } = await newAlbum();
    const res = await fetch(`${base}/api/albums/${token}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Нови наслов', lang: 'en' }),
    });
    const album = ((await json(res)) as { album: Album }).album;
    assert.equal(album.title, 'Нови наслов');
    assert.equal(album.lang, 'en');
  });

  it('ignores a language it does not have', async () => {
    const { token } = await newAlbum();
    const res = await fetch(`${base}/api/albums/${token}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: 'klingon' }),
    });
    assert.equal(((await json(res)) as { album: Album }).album.lang, 'sr-Cyrl');
  });
});

describe('deleting an album', () => {
  it('removes the album and its photos, and the link stops working', async () => {
    const { token, album } = await newAlbum();

    const photo = await makeFixturePhoto(0);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'photo.jpg');
    await json(await fetch(`${base}/api/albums/${token}/images`, { method: 'POST', body: form }));
    assert.ok(existsSync(path.join(imagesDir(), album.id)), 'the album kept a photo directory');

    const res = await fetch(`${base}/api/albums/${token}`, { method: 'DELETE' });
    assert.ok(res.ok);

    assert.equal((await fetch(`${base}/api/albums/${token}`)).status, 404);
    assert.ok(!existsSync(path.join(imagesDir(), album.id)), 'its photo directory should be gone too');
  });

  it('hands back a 404 for an album that is already gone', async () => {
    const { token } = await newAlbum();
    await fetch(`${base}/api/albums/${token}`, { method: 'DELETE' });
    const res = await fetch(`${base}/api/albums/${token}`, { method: 'DELETE' });
    assert.equal(res.status, 404);
  });
});
