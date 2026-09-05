/**
 * What the deployed process does that a test process usually skips.
 *
 * Everywhere else the app is built on an in-memory database and told not to
 * serve the frontend, which is fast and hides three things that only exist for
 * real: the database is a file on a mounted volume, the photos are files beside
 * it, and the same process hands out the editor that reads them. A container
 * restart goes through all three at once, and it is the one event this app has
 * to survive without anybody being told about it.
 *
 * So this file boots an app the way `index.ts` does, stops it, and boots
 * another one onto the same directory — a restart, as far as the data is
 * concerned — and asks whether the album came back.
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import type { Album, Person } from '@album/shared';
import { dbPath, imagesDir } from '../src/config.ts';
import { getDb, migrate, type Db } from '../src/db/index.ts';
import { makeFixturePhoto } from '../src/testing/fixtures.ts';
import { browser, type Browser } from './helpers/http.ts';
import { startServer, type TestServer } from './helpers/server.ts';

interface AlbumReply {
  album: Album;
  rev: number;
}

interface CreateReply extends AlbumReply {
  editToken: string;
}

describe('the database file', () => {
  let dir: string;

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'nalepko-migrate-'));
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('applies every migration once, and then leaves them alone', () => {
    const db = new Database(path.join(dir, 'album.sqlite'));

    const first = migrate(db);
    assert.ok(first.length > 0, 'a fresh database has migrations to run');
    assert.deepEqual([...first].sort(), first, 'they are applied in filename order');
    assert.deepEqual(migrate(db), [], 'booting again runs nothing a second time');

    // The boot the container actually does, rather than the one this test did.
    assert.ok(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).some(
        (t) => t.name === 'albums',
      ),
    );
    db.close();
  });
});

/**
 * One album, carried across a restart.
 *
 * The first process is booted through `getDb()`, so the file, the WAL and the
 * migrations are the ones a container gets. The second opens the same file by
 * hand — `getDb()` memoises its handle, which is right for a process and wrong
 * for a test pretending to be two of them.
 */
describe('an album survives the process that made it', () => {
  let dataDir: string;
  let before1: TestServer;
  let after1: TestServer;
  let db1: Db;
  let db2: Db;
  let mila: Browser;
  let passport: { person: Person; deviceKey: string };
  let token: string;
  let stored: AlbumReply;
  let photoId: string;

  before(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'nalepko-restart-'));
    process.env.DATA_DIR = dataDir;

    db1 = getDb();
    assert.ok(existsSync(dbPath()), 'the database is a file on the volume');
    assert.equal(db1.pragma('journal_mode', { simple: true }), 'wal', 'so a print job can read mid-edit');

    before1 = await startServer({ db: db1, dataDir, keepDataDir: true });
    passport = await browser(before1.base).post('/api/people', { nickname: 'Мила', avatar: 'fox', lang: 'sr-Cyrl' });
    mila = browser(before1.base, { deviceKey: passport.deviceKey });

    const created = await mila.post<CreateReply>('/api/albums', {
      templateId: 'pets',
      title: 'Мој албум',
      ownerName: 'Мила',
      size: 'a4',
    });
    token = created.editToken;

    const uploaded = await mila.upload<{ image: { id: string } }>(
      `/api/albums/${token}/images`,
      await makeFixturePhoto(1),
    );
    photoId = uploaded.image.id;
    stored = await mila.put<AlbumReply>(`/api/albums/${token}/slots/${created.album.pages[0]!.slots[0]!.id}`, {
      imageId: photoId,
      label: 'Ана',
    });
    assert.ok(existsSync(path.join(imagesDir(), created.album.id)), 'the photo is a file beside the database');

    // The restart itself.
    await before1.stop();
    db1.close();

    db2 = new Database(dbPath());
    db2.pragma('foreign_keys = ON');
    assert.deepEqual(migrate(db2), [], 'a restart has no migrations left to run');
    after1 = await startServer({ db: db2, dataDir, keepDataDir: true });
    mila = browser(after1.base, { deviceKey: passport.deviceKey });
  });

  after(async () => {
    await after1.stop();
    db2.close();
    await rm(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('is still there, by the same link, sticker for sticker', async () => {
    const read = await mila.get<CreateReply>(`/api/albums/${token}`);
    assert.deepEqual(read.album, stored.album, 'the album is what it was before the process went away');
  });

  it('still has the photo, and still serves the bytes', async () => {
    for (const query of ['', '?size=thumb']) {
      const res = await mila.raw('GET', `/api/albums/${token}/images/${photoId}${query}`);
      assert.ok(res.ok, `${query || 'the print copy'} answered ${res.status}`);
      assert.ok((await res.arrayBuffer()).byteLength > 0);
    }
  });

  it('still knows the child holding the passport', async () => {
    const me = await mila.get<{ person: Person; albums: { editToken: string; role: string }[] }>('/api/me');
    assert.equal(me.person.id, passport.person.id, 'a device key outlives the process that issued it');
    assert.deepEqual(me.albums.map((a) => [a.editToken, a.role]), [[token, 'owner']]);
  });

  it('still prints', async () => {
    const summary = await mila.get<{ stickerCount: number; stickerSheets: number }>(
      `/api/albums/${token}/print/summary`,
    );
    assert.equal(summary.stickerCount, 1);

    const res = await mila.raw('GET', `/api/albums/${token}/print/stickers.pdf`);
    assert.ok(res.ok);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-', 'built from a photo read back off the volume');
  });

  it('hands out revisions above the ones it gave before it restarted', async () => {
    // Revisions live in this process's memory and are seeded from the clock, so
    // a restart cannot hand an editor that stayed open a number it will discard
    // as stale.
    const edited = await mila.patch<AlbumReply>(`/api/albums/${token}`, { title: 'Исти албум' });
    assert.ok(edited.rev > stored.rev, `${edited.rev} must be above the pre-restart ${stored.rev}`);
  });
});

/**
 * The other half of one process: in production this app is also the web server
 * for the editor, and the editor's screens are client-side routes. A path this
 * process does not have a handler for is therefore not a mistake — it is the
 * album screen, or the print-shop sheet — while a missing *API* path is.
 */
describe('serving the editor from the same process', () => {
  let server: TestServer;
  let anyone: Browser;
  let webDist: string;
  let token: string;

  const INDEX = '<!doctype html><title>Налепко</title><div id="root"></div>';

  before(async () => {
    webDist = await mkdtemp(path.join(tmpdir(), 'nalepko-dist-'));
    await writeFile(path.join(webDist, 'index.html'), INDEX, 'utf8');
    await mkdir(path.join(webDist, 'assets'), { recursive: true });
    await writeFile(path.join(webDist, 'assets', 'app.js'), 'console.log("нalepko")', 'utf8');
    process.env.WEB_DIST = webDist;

    server = await startServer({ serveWeb: true });
    anyone = browser(server.base);
    token = (await anyone.post<CreateReply>('/api/albums', { templateId: 'space', title: 'Албум' })).editToken;
  });

  after(async () => {
    await server.stop();
    await rm(webDist, { recursive: true, force: true });
    delete process.env.WEB_DIST;
  });

  it('serves the editor at the root, and its assets', async () => {
    const page = await anyone.raw('GET', '/');
    assert.ok(page.ok);
    assert.equal(await page.text(), INDEX);

    const asset = await anyone.raw('GET', '/assets/app.js');
    assert.ok(asset.ok, 'the built bundle is served beside the page');
  });

  it('hands every screen of the editor the same page to boot from', async () => {
    for (const url of [`/a/${token}`, `/a/${token}/print`, '/me', '/join/ABC123', '/i/ABC123']) {
      const res = await anyone.raw('GET', url);
      assert.ok(res.ok, `${url} answered ${res.status}`);
      assert.equal(await res.text(), INDEX, `${url} is a screen, not a 404`);
    }
  });

  it('still says no to an API path that does not exist', async () => {
    const res = await anyone.raw('GET', '/api/definitely-not-a-route');
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('content-type')?.split(';')[0], 'application/json');
    assert.deepEqual(await res.json(), { error: 'not found' });
  });

  it('answers the health check the container watches', async () => {
    assert.deepEqual(await anyone.get('/api/health'), { ok: true });
  });
});
