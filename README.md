# Налепко — a sticker album maker for kids

Make your own Panini-style sticker album, then print it with one click.

A child makes four choices — a theme, a cover, how big the album is and how
many stickers go on a page — then drops photos into numbered slots and presses
**Штампај албум**. Three PDFs come back:

| PDF | Paper | What it is |
| --- | --- | --- |
| `korice.pdf` | one sheet, double-sided | the cover, folded around the block |
| `strane.pdf` | sheets, double-sided | the album pages, imposed so folding puts them in order |
| `nalepnice.pdf` | A4 sticker paper | the stickers, numbered to match their slots |

The cover and pages print on A3 for a big album and A4 for a small one. The
sticker sheets are always A4, because a sticker is always 50 × 70 mm.

**The child never sees a formatting control.** No margins, no page setup, no DPI,
no bleed, no "fit to page". Every one of those decisions is made by the code.

---

## The rule everything else follows

The editor and the PDF generator must agree on geometry to the millimetre. If
they drift, stickers do not fit their slots and the product is worthless.

So all layout maths lives in one place — [`packages/shared`](packages/shared/src) —
and is consumed twice:

- [`apps/web/src/components/PageSheet.tsx`](apps/web/src/components/PageSheet.tsx) turns millimetres into CSS percentages
- [`apps/server/src/pdf/canvas.ts`](apps/server/src/pdf/canvas.ts) turns the same millimetres into PDF points

No layout constant is ever written twice. The same applies to the artwork: a
theme describes itself as [shape data](packages/shared/src/shapes.ts), which
the browser draws as SVG and the PDF draws as vector paths.

```text
sticker      50 ×  70 mm   the classic Panini size, fixed in every album
big album   210 × 297 mm   A4 pages, printed two-up on A3 landscape sheets
small album 148 × 210 mm   A5 pages, printed two-up on A4 landscape sheets
```

### Two coordinate systems on one page

A page is drawn in reference millimetres *and* in real ones, and knowing which
is which is most of understanding this codebase.

**Artwork and chrome** — cover art, page backgrounds, the title band, the page
number — are authored once against a reference A4 page and drawn through a
uniform scale. The A series keeps its proportions when halved, so an A5 page is
the same design at 71%, not a second design. `Panel.scaled()` on the PDF side
and a scale factor on the editor side are the only places that know about it.

**The sticker grid** is never scaled. A slot outline has to measure exactly
50 × 70 mm on paper or the sticker will not fit it. So a smaller album gets
*fewer* slots, never smaller ones — which is exactly why "how many stickers on
a page" is a real choice rather than a zoom level:

| Album | Choices |
| --- | --- |
| small (A4 paper, A5 pages) | 2 or 4 per page |
| big (A3 paper, A4 pages) | 4, 6 or 9 per page |

The count is *per page*, and every page in the album gets it. An album is read
two pages at a time, so it is also half of what a child sees at once: nine per
page is eighteen facing them whenever the album is open. Both the picker and
the editor draw two pages, and say the doubled number, rather than leaving that
to be discovered on paper.

Both are chosen once, when the album is created, and cannot change afterwards:
either would add or destroy slots in an album that already has photos in them.
The cover is the opposite — it is meant to be played with, and can be changed
at any time.

---

## Running it

Requires Node 22+ (developed on 24).

```bash
npm install
npm run dev          # API on :3000, editor on :5173
```

Open <http://localhost:5173>.

| Command | What it does |
| --- | --- |
| `npm run dev` | API and editor with hot reload |
| `npm test` | geometry, imposition, numbering, canvas, print and API tests |
| `npm run typecheck` | TypeScript across the whole workspace |
| `npm run build` | build the frontend into `apps/web/dist` |
| `npm start` | one process serving API **and** the built frontend on :3000 |
| `npm run pdf:sample [theme] [cover] [size] [perPage] [lang]` | write the three PDFs to `tmp/` from fixture data |
| `npm run pdf:sample covers` | write every cover in the app to `tmp/covers.pdf`, one per page |

`npm run pdf:sample` exists so the print output can be checked on real paper
without touching the UI:

```bash
npm run pdf:sample football champions a3 9
npm run pdf:sample unicorns candy a4 2 en
```

Themes: `football`, `space`, `dinos`, `unicorns`, `pets`, `class`. Each has four
or five covers; `pdf:sample` lists them if you name one that does not exist.

`npm run pdf:sample covers` is the design review: twenty-odd covers are
impossible to judge one at a time, and a set that does not hang together is
worse than any single cover being weak.

---

## Printing

The dialog says this in the child's language; here it is for the grown-up:

1. **Actual size / 100%.** Turn *fit to page* and *shrink to printable area* off.
   This is the only setting that matters — everything else is already correct.
2. **Three files, three papers.** The table below; the dialog badges every
   download with its own, in colour, because this is the thing a copy shop
   gets wrong.
3. **Double-sided, flip on the short edge** for the cover and the pages — the
   imposition assumes it. Sticker sheets are single-sided.
4. Fold the page sheets in half, nest them inside one another with the cover
   outermost, staple twice along the fold.
5. Check with a ruler: the bar in the bottom margin of a sticker sheet must
   measure exactly **50 mm**. If it does, the printer did not scale the page and
   every sticker will fit its slot.

| file | paper | sheet | sides |
| --- | --- | --- | --- |
| `…-korice.pdf` | card, **200–250 g/m²** | A3 landscape (A4 for a small album) | both, short-edge flip |
| `…-strane.pdf` | **120–160 g/m²** — 80 g/m² office paper is too thin, the photo behind shows through the sticker | A3 landscape (A4 for a small album) | both, short-edge flip |
| `…-nalepnice.pdf` | **self-adhesive**, matte | A4 portrait, always | one |

Saddle stitching needs a page count divisible by four. Rather than teach an
eight-year-old that, the app appends autograph and swap pages at print time and
mentions it in one sentence.

### Handing it to a print shop

Most of these albums are not printed at home, and a copy shop is given the
three PDFs and not the dialog that explained them. So the paper is stated three
times over from the single description in
[packages/shared/src/printing.ts](packages/shared/src/printing.ts): as the badge
on each download, as a note the whole job fits into — ready to paste into a
message — and in each PDF's own `Subject` metadata, which travels with the file.

`/a/<token>/print` is that note as a page of its own: open it on a phone at the
counter and show it, or send the link to whoever is doing the printing. The
print dialog links to it and can copy the link. It sits behind the album's
secret token like everything else, so nobody needs an account to open it.

---

## Deploying

One container plus a volume. Runs comfortably in 512 MB.

```bash
cp .env.example .env       # set SITE_ADDRESS to your domain
docker compose up -d --build
```

Caddy terminates TLS and gets a certificate for `SITE_ADDRESS` automatically.
Everything that must survive a restart — the SQLite database and uploaded
photos — lives in the `album-data` volume at `/data`.

This has been kept deliberately cheap to host. PDFs are drawn with `pdf-lib`
rather than rendered through headless Chrome, so there is no browser in the
image and no 1 GB memory floor — the whole image is about 490 MB, most of it
the Node base and `sharp`. A Hetzner CX22 (about €4/month) is more than enough;
any host that gives you a persistent volume will do. Free tiers that wipe the
disk on restart will not, because both the database and the photos are files.

`better-sqlite3` has no prebuilt binary for this Node version, so the Dockerfile
compiles it in a separate `deps` stage and copies the result forward. The
runtime image never gets a compiler.

Back up by copying the volume:

```bash
docker run --rm -v album_album-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/album-backup.tar.gz -C /data .
```

---

## How it is put together

```text
packages/shared/         geometry, imposition, numbering, themes, i18n
  geometry.ts            paper sizes, the reference page, and every grid position
  imposition.ts          which album page prints where on which folded sheet
  numbering.ts           sticker numbers, derived from position and nothing else
  shapes.ts              the drawing primitives both renderers understand
  motifs.ts              colour maths, gradients, glows and abstract motifs
  figures.ts             the characters: dinosaur, unicorn, rocket, cat, dog
  art.ts                 what a theme and a cover variant are, as types
  covers.ts              all 25 covers, built from one four-part composition
  templates.ts           the six themes: palettes, page artwork, cover lists
apps/server/
  pdf/                   canvas.ts (mm -> points), cover, pages, stickers
  routes/                albums, images, print
  repo.ts                SQLite access, scoped to an album's secret token
  db/migrations/         numbered .sql files, applied at boot
  storage.ts             upload normalising: auto-rotate, strip EXIF, resize
apps/web/src/
  components/PageSheet   the album page, at a different zoom to the printed one
  components/CoverSheet  the cover, mirroring what cover.ts prints
  components/CoverPicker the covers of one theme, as pictures
  screens/               Home (four choices, live preview), Editor, PrintNotice
  printing.ts            the print job described for a reader, from shared data
assets/fonts/            the OFL fonts the PDFs embed and the browser loads
```

### Decisions worth knowing about

**A sticker is never resized.** It is a physical object 50 × 70 mm, so the
sticker sheets are identical whatever size album they belong to, and a page
that cannot fit nine of them gets four instead. Everything else on a page
scales; this does not.

**Sticker numbers are never stored.** A slot's number is its position in reading
order, recomputed on every read. Adding a page, deleting one or dragging a
sticker somewhere else renumbers everything for free, and the number on screen
cannot drift from the number that gets printed.

**Every cover is data, like everything else.** A cover variant is a palette
override plus four artwork functions, so the browser draws the picker chip, the
live preview and the printed cover from one description. Adding a cover means
adding an entry to `covers.ts` and nothing else.

**Covers are composed, not drawn one at a time.** All 25 are built by
`buildCover` from the same skeleton — gradient sky, soft wash, fine texture, a
scene along the bottom, one bold emblem at the top — which is why they look
like a set. The two bands where the title plaque and the sticker count sit are
left deliberately quiet, so artwork can never make a title harder to read.

**A cover photo is an ordinary album image.** Picking "my own" stores an image
id on the album, so the upload, the token scoping, the EXIF stripping and the
cleanup are all machinery that already existed. It is only kept at a higher
resolution, because it fills a whole page rather than a 50 mm window.

**Albums are reached by a secret link, not an account.** No sign-up for a child,
no personal data, and it is the foundation the sharing feature needs. Photos are
served through the same token, so an unshared link exposes nothing.

**A passport is a picture and a made-up name.** Children need telling apart —
for an album list that survives a new device, and so a shared album can say who
brought which sticker — but not with anything a child would have to remember or
a grown-up would have to type. A passport is an avatar, a nickname and a random
key the browser keeps; the server stores only the key's SHA-256. A new one
arrives already called `Брзи Лав`, which is the privacy feature as much as the
onboarding one: the easy path stops being "type your real name". The generator
lives in [`nicknames.ts`](packages/shared/src/nicknames.ts) and is the one place
in the app where translation is not enough — Serbian and Russian adjectives
agree with the noun's gender, so each avatar records its gender per language
and each adjective carries three forms.

**Another device is added by showing it a QR, not by signing in.** The passport
screen mints a six-character code that lives ten minutes and works once; the QR
wraps it as an ordinary `/join/<code>` link, so the second device reads it with
its own camera app and this app contains no scanner at all. The alphabet in
[`codes.ts`](packages/shared/src/codes.ts) leaves out `0 1 I L O U`, so a code
read correctly cannot be typed wrongly. Six characters is only safe because the
code expires, works once, and sits behind a rate limiter — the per-code attempt
counter cannot see a wrong guess, because a wrong guess matches no row.

**Losing the only device loses the passport.** Pairing needs the first device
working and present, and nothing else recovers an account — deliberately, since
every alternative (an email, a password, a security question) is either personal
data or something a six-year-old cannot do. The albums themselves survive: they
are still reachable by their own secret links.

**Membership is a roster, not a lock.** Joining by invite writes an
`album_members` row and hands over the album's edit token, which is what
actually grants access. So the roster records who is here and puts a face on
their stickers; it does not gate them, and removing someone cannot claw back a
token they already hold. Real revocation needs album access to stop being the
token — see "Not built yet".

**The editor shows a spread, not a page.** A finished album is read two pages at
a time, and the folded sheets decide which two: page 1 faces the inside of the
cover, and every even page sits on the left of an odd one. `spreads()` in
[`imposition.ts`](packages/shared/src/imposition.ts) states that rule once —
page artwork already mirrored its corner motif on it — and the editor lays the
two sheets out side by side accordingly, so nothing is ever judged out of the
company it prints in. One of the two is the *active* page: the one the page
strip selected, and the one renaming and deleting name.

**Every mutation returns the whole album.** It is a few kilobytes, and it means
the editor never merges a partial response into local state.

**Uploads are normalised on arrival** — rotated upright from EXIF, stripped of
metadata (phone photos carry GPS coordinates, and this is a children's app),
resized and re-encoded as JPEG.

**Artwork is deterministic.** Decorations are scattered from a seeded PRNG rather
than `Math.random`, so the browser and the PDF scatter them identically.

**Gradients are stacks of bands.** `pdf-lib` has no gradient, so `gradientBands`
lays down thin rectangles, each running to the far edge so it completely covers
the one before it. Bands that merely abut show a hairline seam wherever a
renderer antialiases their shared edge, which is visible as banding across a
full-bleed cover in both SVG and PDF.

### Fonts

`assets/fonts` holds static instances of Nunito and Comfortaa, generated from the
upstream variable fonts and verified to cover Serbian Cyrillic including
`Ђ Ј Љ Њ Ћ Џ`, plus the rest of Russian Cyrillic (`Ё Ъ Ы Э Ю` and friends). The
PDF base-14 fonts have no Cyrillic at all — miss this and text silently prints
blank. Both licences are in the same directory (SIL OFL).

---

## Not built yet

Sharing is the reason this app has a server rather than running entirely in the
browser. Children now have passports, invites put friends on an album's roster,
and a sticker remembers who brought it — but the live half of collaboration is
still missing: there is no presence, no updates arriving while you watch, and
two children editing the same album see each other's work only on reload.

Three more things the passport layer stops short of, in the order they matter:

- **Album access is still the token.** Making the device key the credential —
  and demoting the token to one kind of invite — is what would let an owner
  actually remove a member, and would stop the secret appearing in every
  `<img src>` and in browser history. The tables are shaped so this is a
  migration rather than a rewrite.
- **A printable passport card.** One page with the avatar, the nickname and a
  recovery QR, for the parent to keep. It is the answer to the lost-device gap
  above, and a natural fit for an app that already prints PDFs.
- **Editor and viewer roles**, and revoking an invite before it expires.
