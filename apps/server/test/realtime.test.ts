/**
 * The live half of an album: what a second child sees while a first one edits.
 *
 * These talk to a real socket on a real port rather than to the hub directly,
 * because the things that break here are the joins — the route, the exclusion
 * header, the close code — and none of those are visible from inside the
 * module. The client end connects through `livePath()`, the same helper the
 * editor uses, so the URL cannot drift apart from the route that serves it.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { Album } from '@album/shared';
import { LIVE_CLOSE_GONE, SOCKET_HEADER } from '@album/shared';
import { createApp } from '../src/app.ts';
import { createTestDb } from '../src/db/index.ts';
import { LiveClient } from './helpers/live.ts';

let app: FastifyInstance;
let base: string;
let wsBase: string;
let dataDir: string;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'nalepko-live-'));
  process.env.DATA_DIR = dataDir;
  app = await createApp({ db: createTestDb(), serveWeb: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
  wsBase = `ws://127.0.0.1:${port}`;
});

after(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

/**
 * The socket client lives in `helpers/live.ts`, because the journeys use it
 * too; bound to this file's port so every test below reads as it always did.
 */
const Client = {
  open: (token: string) => LiveClient.open(wsBase, token),
  ready: (token: string, deviceKey?: string) => LiveClient.ready(wsBase, token, deviceKey),
};

const json = async (res: Response) => {
  assert.ok(res.ok, `${res.status} ${res.url}: ${await res.clone().text()}`);
  return res.json();
};

async function newAlbum(): Promise<{ token: string; album: Album; rev: number }> {
  const body = (await json(
    await fetch(`${base}/api/albums`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId: 'space', title: 'Заједнички албум', ownerName: 'Ана' }),
    }),
  )) as { editToken: string; album: Album; rev: number };
  return { token: body.editToken, album: body.album, rev: body.rev };
}

/** An edit, optionally owned up to by a socket that should not hear about it. */
const rename = (token: string, title: string, socketId?: string) =>
  fetch(`${base}/api/albums/${token}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(socketId ? { [SOCKET_HEADER]: socketId } : {}) },
    body: JSON.stringify({ title }),
  });

describe('joining an album', () => {
  it('says who you are and where the album is up to', async () => {
    const { token } = await newAlbum();
    const client = await Client.open(token);

    const welcome = await client.next('welcome');
    assert.ok(welcome.id, 'a connection needs a name for the exclusion header to work');
    assert.equal(welcome.rev, 0, 'an album nobody has touched yet is at revision zero');
    assert.deepEqual(welcome.peers, [{ id: welcome.id, person: null }]);

    client.close();
  });

  it('turns away a link that is not an album, rather than waiting for one', async () => {
    const client = await Client.open('definitely-not-a-real-token');
    assert.equal(await client.closeCode(), LIVE_CLOSE_GONE);
  });
});

describe('an edit by somebody else', () => {
  it('arrives as the whole album, at a revision above the last', async () => {
    const { token, rev } = await newAlbum();
    const watcher = await Client.ready(token);

    await json(await rename(token, 'Ново име'));

    const pushed = await watcher.next('album');
    assert.equal(pushed.album.title, 'Ново име');
    assert.ok(pushed.rev > rev, 'a change must carry a revision above the one before it');
    assert.ok(pushed.album.pages.length > 0, 'the push is a whole album, not a patch');

    watcher.close();
  });

  it('is not echoed to the socket that caused it', async () => {
    const { token } = await newAlbum();
    const editor = await Client.ready(token);
    const watcher = await Client.ready(token);
    // The editor is told about the watcher arriving; that is not the echo.
    await editor.next('peers');

    await json(await rename(token, 'Тихо', editor.id));

    assert.equal((await watcher.next('album')).album.title, 'Тихо');
    await editor.hearsNothing();

    editor.close();
    watcher.close();
  });

  it('stays inside its own album', async () => {
    const mine = await newAlbum();
    const theirs = await newAlbum();
    const bystander = await Client.ready(theirs.token);

    await json(await rename(mine.token, 'Само мој'));
    await bystander.hearsNothing();

    bystander.close();
  });

  it('leaves the revision where the next reader can find it', async () => {
    const { token } = await newAlbum();
    const edited = (await json(await rename(token, 'Први пут'))) as { rev: number };
    const read = (await json(await fetch(`${base}/api/albums/${token}`))) as { rev: number };

    assert.equal(read.rev, edited.rev, 'a plain read reports the revision, it does not invent one');

    const again = (await json(await rename(token, 'Други пут'))) as { rev: number };
    assert.ok(again.rev > edited.rev, 'revisions only ever go up');
  });
});

describe('who is here', () => {
  it('names a child with a passport, and counts one without', async () => {
    const { token } = await newAlbum();
    const passport = (await json(
      await fetch(`${base}/api/people`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lang: 'sr-Cyrl' }),
      }),
    )) as { person: { id: string; nickname: string }; deviceKey: string };

    const anonymous = await Client.ready(token);
    const named = await Client.ready(token, passport.deviceKey);

    // The passport arrives after the handshake, so the roster is sent twice:
    // once for the socket appearing, once for it acquiring a face.
    const withFace = async () => {
      for (;;) {
        const { peers } = await anonymous.next('peers');
        if (peers.some((p) => p.person)) return peers;
      }
    };

    const peers = await withFace();
    assert.equal(peers.length, 2);
    assert.equal(peers.filter((p) => p.person === null).length, 1, 'a child without a passport still counts');
    assert.equal(peers.find((p) => p.person)?.person?.id, passport.person.id);

    named.close();
    assert.deepEqual(
      (await anonymous.next('peers')).peers.map((p) => p.id),
      [anonymous.id],
      'a socket that leaves stops being in the room',
    );

    anonymous.close();
  });
});

describe('deleting the album', () => {
  it('tells everyone watching, then shows them the door', async () => {
    const { token } = await newAlbum();
    const watcher = await Client.ready(token);

    await json(await fetch(`${base}/api/albums/${token}`, { method: 'DELETE' }));

    await watcher.next('gone');
    assert.equal(await watcher.closeCode(), LIVE_CLOSE_GONE);
  });
});
