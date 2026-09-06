/**
 * Two whole journeys, end to end.
 *
 * Every other test here stands one layer up and stubs its neighbours: the print
 * tests build PDFs from a fixture album, the attribution tests put an image row
 * in by hand, the live tests only ever rename. That is the right way to test a
 * layer, and it leaves exactly one thing untested — that the layers add up.
 *
 * So nothing below is stubbed. A photo is really uploaded over multipart,
 * really normalised onto disk, really placed in a numbered slot, really
 * announced to the other child's socket and really printed into a PDF, and the
 * assertions are about the seams: that the sheet count the dialog promises is
 * the number of pages that comes out, that the album the API answers with is
 * the album it stored, that a sticker Вук filled says Вук on Мила's screen.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import type { Album, Person, PrintPart } from '@album/shared';
import { numbersAreContiguous, printFileName } from '@album/shared';
import { makeFixturePhoto } from '../src/testing/fixtures.ts';
import { browser, type Browser } from './helpers/http.ts';
import { LiveClient } from './helpers/live.ts';
import { startServer, type TestServer } from './helpers/server.ts';

let server: TestServer;

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.stop();
});

interface Passport {
  person: Person;
  deviceKey: string;
}

interface AlbumReply {
  album: Album;
  rev: number;
}

interface CreateReply extends AlbumReply {
  editToken: string;
}

interface AlbumList {
  albums: { editToken: string; role: string; title: string }[];
}

interface PrintSummary {
  stickerCount: number;
  pageCount: number;
  fillerCount: number;
  coverSheets: number;
  pageSheets: number;
  stickerSheets: number;
  sheetPaper: string;
  stickerPaper: string;
}

/** A child, and the browser that carries their passport on every call. */
async function newChild(nickname: string, avatar: string): Promise<{ passport: Passport; browser: Browser }> {
  const passport = await browser(server.base).post<Passport>('/api/people', { nickname, avatar, lang: 'sr-Cyrl' });
  return { passport, browser: browser(server.base, { deviceKey: passport.deviceKey }) };
}

const slotsOf = (album: Album) => album.pages.flatMap((p) => p.slots);

/**
 * A photo the way a phone hands one over: stored sideways, with the EXIF that
 * says which way up it goes — and the camera's own notes about who took it,
 * which is exactly what a children's app must not keep.
 */
const sidewaysPhoto = async (index: number): Promise<Buffer> =>
  sharp(await makeFixturePhoto(index))
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Artist: 'Мила', Software: 'a phone' } })
    .jpeg()
    .toBuffer();

/** What the printer is actually handed: how many sides, on what, called what. */
async function readPdf(who: Browser, token: string, part: PrintPart) {
  const res = await who.raw('GET', `/api/albums/${token}/print/${part}.pdf`);
  assert.ok(res.ok, `${part}.pdf answered ${res.status}`);
  const doc = await PDFDocument.load(Buffer.from(await res.arrayBuffer()));
  return {
    pages: doc.getPageCount(),
    subject: doc.getSubject() ?? '',
    disposition: res.headers.get('content-disposition') ?? '',
  };
}

/**
 * Journey one: a child on her own.
 *
 * Made, filled, rearranged and printed. The journey runs once in `before` so
 * that each test below asks one question about the album it produced, rather
 * than repeating the whole thing to get somewhere worth asking from.
 */
describe('a child makes an album, fills it and prints it', () => {
  let mila: Browser;
  let passport: Passport;
  let token: string;
  let last: AlbumReply;
  let summary: PrintSummary;
  const photos: { id: string; w: number; h: number }[] = [];

  before(async () => {
    ({ passport, browser: mila } = await newChild('Мила', 'fox'));

    const created = await mila.post<CreateReply>('/api/albums', {
      templateId: 'space',
      coverVariantId: 'moon',
      title: 'Моја свемирска екипа',
      ownerName: 'Мила',
      size: 'a4',
    });
    token = created.editToken;

    // Three photos off her phone, into the first three slots in reading order,
    // each labelled with whoever is on it.
    for (const [index, name] of ['Ана', 'Вук', 'Лена'].entries()) {
      const uploaded = await mila.upload<{ image: { id: string; w: number; h: number } }>(
        `/api/albums/${token}/images`,
        index === 2 ? await sidewaysPhoto(index) : await makeFixturePhoto(index),
      );
      photos.push(uploaded.image);
      last = await mila.put<AlbumReply>(`/api/albums/${token}/slots/${slotsOf(created.album)[index]!.id}`, {
        imageId: uploaded.image.id,
        label: name,
        crop: { x: 0.5, y: 0.5, scale: 1.2 },
      });
    }

    // A fourth page, then that page dragged to the front: the two edits that
    // renumber every sticker in the album.
    last = await mila.post<AlbumReply>(`/api/albums/${token}/pages`);
    const added = last.album.pages.at(-1)!;
    last = await mila.patch<AlbumReply>(`/api/albums/${token}/pages/${added.id}`, { position: 0 });

    summary = await mila.get<PrintSummary>(`/api/albums/${token}/print/summary`);
  });

  it('answers with the album it stored, not a version of it', async () => {
    const read = await mila.get<CreateReply>(`/api/albums/${token}`);
    assert.deepEqual(read.album, last.album, 'a mutation returns the whole album, and it is the stored one');
    assert.equal(read.rev, last.rev, 'and the revision the editor is meant to keep');
  });

  it('renumbers the stickers by where they now sit, not by when they arrived', () => {
    assert.ok(numbersAreContiguous(last.album.pages));

    // The three photos went onto what was page one; an empty page now sits in
    // front of it, so they are numbered from the top of the second page.
    const filled = slotsOf(last.album).filter((s) => s.imageId);
    const perPage = last.album.slotsPerPage;
    assert.deepEqual(filled.map((s) => s.label), ['Ана', 'Вук', 'Лена']);
    assert.deepEqual(filled.map((s) => s.number), [perPage + 1, perPage + 2, perPage + 3]);
  });

  it('records the child who filled each sticker', () => {
    const filled = slotsOf(last.album).filter((s) => s.imageId);
    assert.equal(filled.length, 3);
    for (const slot of filled) assert.equal(slot.filledBy, passport.person.id, `sticker ${slot.number}`);
  });

  it('keeps every photo it was given, and serves each one back', async () => {
    assert.deepEqual(
      last.album.images.map((i) => i.id).sort(),
      photos.map((p) => p.id).sort(),
      'the album carries the photos that were uploaded into it',
    );

    for (const photo of photos) {
      for (const query of ['', '?size=thumb']) {
        const res = await mila.raw('GET', `/api/albums/${token}/images/${photo.id}${query}`);
        assert.ok(res.ok, `${photo.id}${query}`);
        assert.equal(res.headers.get('content-type'), 'image/jpeg');
        const bytes = Buffer.from(await res.arrayBuffer());
        assert.equal(bytes.subarray(0, 2).toString('hex'), 'ffd8', `${photo.id}${query} is a JPEG`);
      }
    }
  });

  it('turns a sideways photo the right way up, and keeps none of its EXIF', async () => {
    const [upright, , sideways] = photos;
    assert.deepEqual({ w: upright!.w, h: upright!.h }, { w: 600, h: 840 });
    assert.deepEqual(
      { w: sideways!.w, h: sideways!.h },
      { w: 840, h: 600 },
      'the phone said it was on its side, so the stored photo is not',
    );

    // Both derivatives, because a thumbnail is a second encode and a second
    // chance to carry the camera's notes along with it.
    for (const query of ['', '?size=thumb']) {
      const res = await mila.raw('GET', `/api/albums/${token}/images/${sideways!.id}${query}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      assert.ok(!bytes.includes(Buffer.from('Exif')), `EXIF survived into ${query || 'the print copy'}`);
    }
  });

  it('prints exactly the sheets the print dialog promised', async () => {
    assert.equal(summary.pageCount, 5);
    assert.equal(summary.fillerCount, 3, 'five pages do not fold, so three blanks are added');
    assert.equal(summary.stickerCount, 3);

    const [cover, pages, stickers] = await Promise.all([
      readPdf(mila, token, 'cover'),
      readPdf(mila, token, 'pages'),
      readPdf(mila, token, 'stickers'),
    ]);

    // Every sheet is two PDF pages, one per side through the printer — the
    // sticker sheet included, because its numbers print on the backing paper.
    assert.equal(cover.pages, summary.coverSheets * 2);
    assert.equal(pages.pages, summary.pageSheets * 2);
    assert.equal(stickers.pages, summary.stickerSheets * 2);
    assert.ok(summary.stickerSheets >= 1, 'three stickers need a sheet to be printed on');
  });

  it('sends each PDF out knowing its own name and paper', async () => {
    for (const part of ['cover', 'pages', 'stickers'] as const) {
      const pdf = await readPdf(mila, token, part);
      const filename = printFileName(last.album.title, part, last.album.lang);

      assert.ok(pdf.disposition.includes(filename), `${part}: offered as ${filename}, got ${pdf.disposition}`);
      // The file leaves the app on its own, so it has to carry the paper the
      // dialog quoted — a print shop only ever sees the PDF.
      assert.ok(pdf.subject.includes(filename), `${part}: names its own file in its metadata`);
      assert.ok(
        pdf.subject.includes(part === 'stickers' ? summary.stickerPaper : summary.sheetPaper),
        `${part}: asks for the paper the dialog quoted`,
      );
    }
  });

  it('is one of her albums now, and hers to own', async () => {
    const me = await mila.get<AlbumList & { person: Person }>('/api/me');

    assert.equal(me.person.id, passport.person.id);
    assert.deepEqual(
      me.albums.map((a) => [a.editToken, a.role, a.title]),
      [[token, 'owner', 'Моја свемирска екипа']],
    );
    assert.deepEqual(last.album.members.map((m) => [m.nickname, m.role]), [['Мила', 'owner']]);
  });
});

/**
 * Journey two: a friend, invited into the same album.
 *
 * Nothing about the album changes when a second child arrives — the same token,
 * the same slots, the same PDFs — except that from then on everything happens
 * twice: once as an answer, and once as a push to everybody else.
 */
describe('a friend joins by invite and fills a sticker', () => {
  let mila: Browser;
  let vuk: Browser;
  let milaPassport: Passport;
  let vukPassport: Passport;
  let token: string;
  let joined: CreateReply;
  let watching: LiveClient;
  let vukSocket: LiveClient;
  /** The album as Мила's socket heard it when Вук filled his sticker. */
  let pushed: { rev: number; album: Album };

  before(async () => {
    ({ passport: milaPassport, browser: mila } = await newChild('Мила', 'fox'));
    ({ passport: vukPassport, browser: vuk } = await newChild('Вук', 'bear'));

    const created = await mila.post<CreateReply>('/api/albums', {
      templateId: 'football',
      title: 'Наш албум',
      ownerName: 'Мила',
    });
    token = created.editToken;

    // Мила has the album open while she invites him, which is the whole reason
    // the roster is pushed rather than waited for.
    watching = await LiveClient.ready(server.wsBase, token, milaPassport.deviceKey);

    const invite = await mila.post<{ code: string }>(`/api/albums/${token}/invites`);
    joined = await vuk.post<CreateReply>(`/api/invites/${invite.code}/claim`);

    vukSocket = await LiveClient.ready(server.wsBase, token, vukPassport.deviceKey);
    // From the moment he has a socket, every call he makes names it — the
    // editor attaches the header to all of them, uploads included.
    vuk = vuk.withSocket(vukSocket.id);

    // A photo of his own, into the third sticker.
    const uploaded = await vuk.upload<{ image: { id: string } }>(
      `/api/albums/${token}/images`,
      await makeFixturePhoto(2),
    );
    await vuk.put<AlbumReply>(`/api/albums/${token}/slots/${slotsOf(joined.album)[2]!.id}`, {
      imageId: uploaded.image.id,
      label: 'Вук',
    });

    // The claim, the upload and the placing are three pushes; this is the one
    // that carries the sticker.
    pushed = await watching.until('album', (m) => slotsOf(m.album).some((s) => s.imageId));
  });

  after(() => {
    watching.close();
    vukSocket.close();
  });

  it('hands the friend the very same album, by the very same link', () => {
    assert.equal(joined.editToken, token, 'joining is being given the link, not a copy of the album');
    assert.deepEqual(
      joined.album.members.map((m) => [m.nickname, m.role]),
      [
        ['Мила', 'owner'],
        ['Вук', 'editor'],
      ],
    );
  });

  it('tells the owner who filled the sticker, without her asking', () => {
    const filled = slotsOf(pushed.album).filter((s) => s.imageId);

    assert.equal(filled.length, 1);
    assert.equal(filled[0]!.label, 'Вук');
    assert.equal(filled[0]!.filledBy, vukPassport.person.id, 'the sticker is his on her screen too');
    assert.ok(pushed.rev > joined.rev, 'and it arrives at a revision above the one she had');
    assert.ok(pushed.album.pages.length > 0, 'as a whole album, never a patch');
  });

  it('does not send the friend his own edit back', async () => {
    await vukSocket.hearsNo('album');
  });

  it('shows both children in the room', async () => {
    const peers = await watching.until('peers', (m) => m.peers.filter((p) => p.person).length === 2);
    assert.deepEqual(
      peers.peers.map((p) => p.person?.nickname).filter(Boolean).sort(),
      ['Вук', 'Мила'],
    );
  });

  it('is in both children’s album lists, with the role each of them has', async () => {
    const hers = await mila.get<AlbumList>('/api/me');
    const his = await vuk.get<AlbumList>('/api/me');

    assert.deepEqual(hers.albums.map((a) => [a.editToken, a.role]), [[token, 'owner']]);
    assert.deepEqual(his.albums.map((a) => [a.editToken, a.role]), [[token, 'editor']]);
  });

  it('prints the friend’s sticker onto the owner’s sheet', async () => {
    const summary = await mila.get<PrintSummary>(`/api/albums/${token}/print/summary`);
    assert.equal(summary.stickerCount, 1, 'the album has one sticker, whoever put it there');

    const stickers = await readPdf(mila, token, 'stickers');
    assert.equal(summary.stickerSheets, 1);
    assert.equal(stickers.pages, 2, 'one sheet: the sticker on the front, its number on the back');
  });
});
