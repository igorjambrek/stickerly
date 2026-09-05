import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { Album, Person } from '@album/shared';
import { AVATARS, formatCode, isCode } from '@album/shared';
import { createApp } from '../src/app.ts';
import type { Db } from '../src/db/index.ts';
import { createTestDb } from '../src/db/index.ts';

let app: FastifyInstance;
let base: string;
let dataDir: string;
let db: Db;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'nalepko-passport-'));
  process.env.DATA_DIR = dataDir;
  db = createTestDb();
  app = await createApp({ db, serveWeb: false });
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

/**
 * Every call optionally carries a passport, exactly as the editor does — and,
 * like the editor, only announces a JSON body when it is actually sending one.
 */
const call = (method: string, url: string, key?: string, body?: unknown) =>
  fetch(base + url, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(key ? { 'x-nalepko-device': key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

interface Passport {
  person: Person;
  deviceKey: string;
}

async function newPassport(body: Record<string, unknown> = {}): Promise<Passport> {
  const res = await call('POST', '/api/people', undefined, body);
  assert.equal(res.status, 201);
  return (await res.json()) as Passport;
}

async function newAlbum(key?: string): Promise<{ token: string; album: Album }> {
  const body = (await json(
    await call('POST', '/api/albums', key, { templateId: 'space', title: 'Тест албум' }),
  )) as { editToken: string; album: Album };
  return { token: body.editToken, album: body.album };
}

describe('making a passport', () => {
  it('names a child who has typed nothing at all', async () => {
    const { person, deviceKey } = await newPassport();

    assert.ok(person.id);
    assert.ok(person.nickname.length > 0, 'a passport is never nameless');
    assert.equal(person.nickname.split(' ').length, 2);
    assert.ok(AVATARS.some((a) => a.id === person.avatar));
    assert.ok(deviceKey.length >= 20, 'the device key must not be guessable');
  });

  it('generates the name in the language the child is reading', async () => {
    const { person } = await newPassport({ lang: 'en' });
    assert.match(person.nickname, /^[A-Za-z]+ [A-Za-z]+$/, `${person.nickname} is not English`);
  });

  it('keeps a name the child chose, and trims it', async () => {
    const { person } = await newPassport({ nickname: '  Мила  ', avatar: 'fox' });
    assert.equal(person.nickname, 'Мила');
    assert.equal(person.avatar, 'fox');
  });

  it('ignores an avatar that does not exist', async () => {
    const { person } = await newPassport({ avatar: 'gremlin' });
    assert.ok(AVATARS.some((a) => a.id === person.avatar));
  });

  /**
   * The property that matters if the database is ever copied: it holds hashes,
   * so it cannot hand anybody a working passport.
   */
  it('never stores the device key it just handed out', async () => {
    const { deviceKey } = await newPassport();
    const rows = db.prepare('SELECT key_hash FROM devices').all() as { key_hash: string }[];
    assert.ok(rows.length > 0);
    assert.ok(!rows.some((r) => r.key_hash === deviceKey), 'the raw key is in the database');
    assert.ok(rows.every((r) => /^[0-9a-f]{64}$/.test(r.key_hash)));
  });
});

describe('/api/me', () => {
  it('refuses a caller with no passport', async () => {
    assert.equal((await call('GET', '/api/me')).status, 401);
  });

  it('refuses a passport that was never issued', async () => {
    assert.equal((await call('GET', '/api/me', 'not-a-real-key')).status, 401);
  });

  it('lists the albums a child made', async () => {
    const { deviceKey, person } = await newPassport();
    const { token } = await newAlbum(deviceKey);

    const me = (await json(await call('GET', '/api/me', deviceKey))) as {
      person: Person;
      albums: { editToken: string; role: string }[];
    };

    assert.equal(me.person.id, person.id);
    assert.deepEqual(
      me.albums.map((a) => [a.editToken, a.role]),
      [[token, 'owner']],
    );
  });

  it('renames a child everywhere at once, and never leaves them blank', async () => {
    const { deviceKey } = await newPassport();
    const { token } = await newAlbum(deviceKey);

    const named = (await json(await call('PATCH', '/api/me', deviceKey, { nickname: 'Лена', avatar: 'bee' }))) as {
      person: Person;
    };
    assert.equal(named.person.nickname, 'Лена');

    // The roster joins `people` live, so the album already knows.
    const { album } = (await json(await call('GET', `/api/albums/${token}`, deviceKey))) as { album: Album };
    assert.deepEqual(
      album.members.map((m) => [m.nickname, m.avatar, m.role]),
      [['Лена', 'bee', 'owner']],
    );

    const cleared = (await json(await call('PATCH', '/api/me', deviceKey, { nickname: '   ' }))) as {
      person: Person;
    };
    assert.ok(cleared.person.nickname.length > 0, 'clearing a name regenerates one');
  });
});

describe('adding a second device', () => {
  it('gives the same child a second key, without taking the first away', async () => {
    const first = await newPassport({ nickname: 'Вук' });
    const { token } = await newAlbum(first.deviceKey);

    const pairing = (await json(await call('POST', '/api/me/pairings', first.deviceKey))) as {
      code: string;
      expiresAt: string;
    };
    assert.ok(isCode(pairing.code), `${pairing.code} is not a readable code`);
    assert.equal(formatCode(pairing.code).length, 7);

    const second = (await json(
      await call('POST', `/api/pairings/${pairing.code}/claim`),
    )) as Passport;

    assert.equal(second.person.id, first.person.id, 'it is the same child');
    assert.equal(second.person.nickname, 'Вук');
    assert.notEqual(second.deviceKey, first.deviceKey, 'each device gets its own key');

    // The whole point: the albums came with them.
    const me = (await json(await call('GET', '/api/me', second.deviceKey))) as {
      albums: { editToken: string }[];
    };
    assert.deepEqual(me.albums.map((a) => a.editToken), [token]);

    // And device A is untouched.
    assert.equal((await call('GET', '/api/me', first.deviceKey)).status, 200);
  });

  it('accepts the code however the child types it', async () => {
    const { deviceKey } = await newPassport();
    const { code } = (await json(await call('POST', '/api/me/pairings', deviceKey))) as { code: string };

    const res = await call('POST', `/api/pairings/${formatCode(code).toLowerCase()}/claim`);
    assert.equal(res.status, 200);
  });

  it('lets a code be used once', async () => {
    const { deviceKey } = await newPassport();
    const { code } = (await json(await call('POST', '/api/me/pairings', deviceKey))) as { code: string };

    assert.equal((await call('POST', `/api/pairings/${code}/claim`)).status, 200);
    assert.equal((await call('POST', `/api/pairings/${code}/claim`)).status, 404);
  });

  it('will not claim a code that has run out of time', async () => {
    const { deviceKey } = await newPassport();
    const { code } = (await json(await call('POST', '/api/me/pairings', deviceKey))) as { code: string };

    db.prepare('UPDATE pairings SET expires_at = ? WHERE code = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      code,
    );
    assert.equal((await call('POST', `/api/pairings/${code}/claim`)).status, 404);
  });

  /**
   * An expired code and a code that never existed must be indistinguishable, or
   * a caller learns which of their guesses were real.
   */
  it('answers a wrong code exactly as it answers a stale one', async () => {
    const res = await call('POST', '/api/pairings/ZZ9ZZ9/claim');
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'code not found' });
  });

  it('rejects something that is not a code at all', async () => {
    assert.equal((await call('POST', '/api/pairings/hello/claim')).status, 400);
  });

  it('burns a code that keeps being retried', async () => {
    const { deviceKey } = await newPassport();
    const { code } = (await json(await call('POST', '/api/me/pairings', deviceKey))) as { code: string };

    db.prepare('UPDATE pairings SET attempts = 5 WHERE code = ?').run(code);
    assert.equal((await call('POST', `/api/pairings/${code}/claim`)).status, 404);
  });
});

describe('joining a friend’s album', () => {
  it('puts the friend on the roster and hands them the album', async () => {
    const mila = await newPassport({ nickname: 'Мила', avatar: 'fox' });
    const vuk = await newPassport({ nickname: 'Вук', avatar: 'bear' });
    const { token } = await newAlbum(mila.deviceKey);

    const invite = (await json(await call('POST', `/api/albums/${token}/invites`, mila.deviceKey))) as {
      code: string;
    };
    assert.ok(isCode(invite.code));

    const joined = (await json(await call('POST', `/api/invites/${invite.code}/claim`, vuk.deviceKey))) as {
      album: Album;
      editToken: string;
    };

    assert.equal(joined.editToken, token, 'joining hands over the album link');
    assert.deepEqual(
      joined.album.members.map((m) => [m.nickname, m.role]),
      [
        ['Мила', 'owner'],
        ['Вук', 'editor'],
      ],
    );

    // And it is now one of Вук's albums too.
    const me = (await json(await call('GET', '/api/me', vuk.deviceKey))) as {
      albums: { editToken: string; role: string }[];
    };
    assert.deepEqual(me.albums.map((a) => [a.editToken, a.role]), [[token, 'editor']]);
  });

  it('needs a passport, because joining is the one thing that is about who you are', async () => {
    const { deviceKey } = await newPassport();
    const { token } = await newAlbum(deviceKey);
    const { code } = (await json(await call('POST', `/api/albums/${token}/invites`, deviceKey))) as {
      code: string;
    };

    assert.equal((await call('POST', `/api/invites/${code}/claim`)).status, 401);
  });

  it('does not add the same child to an album twice', async () => {
    const mila = await newPassport({ nickname: 'Мила' });
    const vuk = await newPassport({ nickname: 'Вук' });
    const { token } = await newAlbum(mila.deviceKey);

    for (let i = 0; i < 2; i++) {
      const { code } = (await json(await call('POST', `/api/albums/${token}/invites`, mila.deviceKey))) as {
        code: string;
      };
      await json(await call('POST', `/api/invites/${code}/claim`, vuk.deviceKey));
    }

    const { album } = (await json(await call('GET', `/api/albums/${token}`))) as { album: Album };
    assert.equal(album.members.length, 2);
  });
});

describe('adopting the albums a browser already had', () => {
  it('makes a device-local list into one a child can carry', async () => {
    // An album made before this child had a passport, as every existing one was.
    const { token } = await newAlbum();
    const { deviceKey } = await newPassport();

    const claimed = (await json(
      await call('POST', '/api/me/albums/claim', deviceKey, { tokens: [token, 'no-such-token'] }),
    )) as { claimed: number; albums: { editToken: string; role: string }[] };

    assert.equal(claimed.claimed, 1, 'a token that matches nothing is skipped, not an error');
    assert.deepEqual(claimed.albums.map((a) => [a.editToken, a.role]), [[token, 'owner']]);
  });

  it('does not take an album that already belongs to someone', async () => {
    const mila = await newPassport({ nickname: 'Мила' });
    const vuk = await newPassport({ nickname: 'Вук' });
    const { token } = await newAlbum(mila.deviceKey);

    await json(await call('POST', '/api/me/albums/claim', vuk.deviceKey, { tokens: [token] }));

    const { album } = (await json(await call('GET', `/api/albums/${token}`))) as { album: Album };
    assert.equal(album.ownerPersonId, mila.person.id, 'the first owner keeps it');
    assert.deepEqual(
      album.members.map((m) => [m.nickname, m.role]),
      [
        ['Мила', 'owner'],
        ['Вук', 'editor'],
      ],
    );
  });
});

describe('who filled a sticker', () => {
  it('records the child who put the photo there, and clears it when emptied', async () => {
    const { deviceKey, person } = await newPassport({ nickname: 'Мила' });
    const { token, album } = await newAlbum(deviceKey);
    const slotId = album.pages[0]!.slots[0]!.id;

    // A photo has to exist in the album before a slot can hold it.
    const imageId = (
      db.prepare('SELECT id FROM images WHERE album_id = ?').get(album.id) as { id: string } | undefined
    )?.id;
    assert.equal(imageId, undefined, 'a new album has no photos yet');

    // Labelling alone attributes nothing: a sticker is a photo.
    const labelled = (await json(
      await call('PUT', `/api/albums/${token}/slots/${slotId}`, deviceKey, { label: 'Ана' }),
    )) as { album: Album };
    assert.equal(labelled.album.pages[0]!.slots[0]!.filledBy, null);

    // Put a photo in by hand, since uploading one is another test's job.
    db.prepare('INSERT INTO images (id, album_id, w, h, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'img-1',
      album.id,
      600,
      840,
      new Date().toISOString(),
    );

    const filled = (await json(
      await call('PUT', `/api/albums/${token}/slots/${slotId}`, deviceKey, { imageId: 'img-1' }),
    )) as { album: Album };
    assert.equal(filled.album.pages[0]!.slots[0]!.filledBy, person.id);

    // Someone else re-cropping it does not make the sticker theirs.
    const other = await newPassport();
    const recropped = (await json(
      await call('PUT', `/api/albums/${token}/slots/${slotId}`, other.deviceKey, {
        crop: { x: 0.4, y: 0.6, scale: 1.2 },
      }),
    )) as { album: Album };
    assert.equal(recropped.album.pages[0]!.slots[0]!.filledBy, person.id);

    const emptied = (await json(
      await call('PUT', `/api/albums/${token}/slots/${slotId}`, deviceKey, { imageId: null }),
    )) as { album: Album };
    assert.equal(emptied.album.pages[0]!.slots[0]!.filledBy, null);
  });

  it('follows the sticker when two slots are swapped', async () => {
    const { deviceKey, person } = await newPassport();
    const { token, album } = await newAlbum(deviceKey);
    const [first, second] = album.pages[0]!.slots;

    db.prepare('INSERT INTO images (id, album_id, w, h, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'img-2',
      album.id,
      600,
      840,
      new Date().toISOString(),
    );
    await json(await call('PUT', `/api/albums/${token}/slots/${first!.id}`, deviceKey, { imageId: 'img-2' }));

    const swapped = (await json(
      await call('POST', `/api/albums/${token}/slots/${first!.id}/swap`, deviceKey, { withId: second!.id }),
    )) as { album: Album };

    const slots = swapped.album.pages[0]!.slots;
    assert.equal(slots[0]!.filledBy, null);
    assert.equal(slots[1]!.filledBy, person.id, 'attribution travels with the photo');
  });

  it('still lets a child with no passport build an album', async () => {
    const { token, album } = await newAlbum();
    const slotId = album.pages[0]!.slots[0]!.id;

    const res = await call('PUT', `/api/albums/${token}/slots/${slotId}`, undefined, { label: 'Ана' });
    const body = (await json(res)) as { album: Album };

    assert.equal(body.album.pages[0]!.slots[0]!.label, 'Ана');
    assert.equal(body.album.ownerPersonId, null);
    assert.deepEqual(body.album.members, []);
  });
});
