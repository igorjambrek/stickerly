# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Налепко is a sticker-album maker for kids: a child picks a theme, cover, album
size and stickers-per-page, drops photos into numbered slots, and prints three
PDFs (cover, pages, sticker sheets). See [README.md](README.md) for the full
product description, printing instructions and deployment notes — don't
duplicate it here, read it when you need that context.

## Workspace layout

npm workspaces, three packages:

- `packages/shared` — geometry, imposition, numbering, themes, i18n. Framework-free, imported by both other packages as `@album/shared` (path-aliased to `src/index.ts`, not built).
- `apps/server` — Fastify API, SQLite (better-sqlite3), PDF generation (pdf-lib). Serves the API and, in production, the built frontend.
- `apps/web` — React 18 + Vite editor UI, Zustand for state, `@dnd-kit` for drag-and-drop.

## Commands

Run from the repo root (Node 22+ required):

```bash
npm install
npm run dev              # server on :3000 + web on :5173, both hot-reloading
npm test                 # all tests: shared + server
npm run typecheck        # tsc --noEmit across the whole workspace
npm run build             # builds apps/web into apps/web/dist
npm start                 # one process serving API + built frontend on :3000
npm run pdf:sample [theme] [cover] [size] [perPage] [lang]   # write korice/strane/nalepnice PDFs to tmp/ from fixture data
npm run pdf:sample covers  # every cover in the app, one per page, to tmp/covers.pdf — the way to review cover art changes
```

Tests use Node's built-in test runner via `tsx`, not a separate test framework:

```bash
# single file
node --import tsx --test packages/shared/test/geometry.test.ts
# single test by name (--test-name-pattern is a regex)
node --import tsx --test --test-name-pattern "imposition" apps/server/test/print.test.ts
```

There is no lint script configured; `npm run typecheck` is the correctness gate besides tests.

## Architecture

**The one rule everything follows: editor and PDF generator must agree on
geometry to the millimetre**, so all layout math lives once in
[packages/shared](packages/shared/src) and is consumed twice — by
[apps/web/src/components/PageSheet.tsx](apps/web/src/components/PageSheet.tsx)
(mm → CSS %) and [apps/server/src/pdf/canvas.ts](apps/server/src/pdf/canvas.ts)
(mm → PDF points). Themes and covers are likewise shape *data*
([packages/shared/src/shapes.ts](packages/shared/src/shapes.ts)), drawn as SVG
in the browser and as vector paths in the PDF from the same description. When
touching layout or artwork, changes normally start in `packages/shared` and
must be checked against both renderers.

Two coordinate systems coexist on every page: artwork/chrome (cover art, page
background, title band, page number) is authored once against a reference A4
page and uniformly scaled per album size (`Panel.scaled()` on the PDF side, a
scale factor in the editor); the sticker grid is never scaled — a slot is
always exactly 50×70mm, so a smaller album gets fewer slots, not smaller ones.

Other load-bearing decisions (don't relitigate these without reading
[README.md](README.md)'s "Decisions worth knowing about" section first):

- **The editor shows two pages at once** — `spreads()` in `imposition.ts` pairs them the way the folded sheets do (page 1 faces the inside cover, even pages sit on the left), so a page is never judged out of the company it prints in.
- **Sticker numbers are never stored** — a slot's number is its reading-order position, recomputed on every read (`packages/shared/src/numbering.ts`).
- **Album size and stickers-per-page are locked at creation** — changing either would add/destroy slots in an album that may already have photos.
- **A cover is data**: a palette override + four artwork functions in `packages/shared/src/covers.ts`; `buildCover` composes all 25 from one skeleton (gradient sky, wash, texture, scene, emblem). Adding a cover = one entry there.
- **Albums are reached by secret link, not account** — `apps/server/src/repo.ts` scopes all SQLite access by an album's secret token; photos are served through the same token.
- **Passports are a layer on top, never a gate** — a person is an avatar plus a generated nickname, authenticated by a device key hashed into `devices` and sent as the `x-nalepko-device` header. `req.person` is resolved for every request and required by almost none: album routes read it only to record who did something, so an anonymous child with a link still works. Identity lives in `apps/server/src/identity.ts`; `album_members` stays with the album data in `repo.ts`.
- **Nicknames are generated, and gendered** — `packages/shared/src/nicknames.ts` puts an adjective in front of the avatar's own noun, and Serbian/Russian adjectives must agree with that noun's gender, so avatars carry a gender per language and adjectives carry three forms. Never generate one from `rng.ts` (seeded, for artwork); the caller supplies real entropy.
- **A second device is added by QR, and this app has no scanner** — the QR holds an ordinary `/join/<code>` link that the other device's camera app opens. Codes (`packages/shared/src/codes.ts`) are six characters from an alphabet with no look-alikes, single-use, ten minutes, and safe only because of the rate limiter in `apps/server/src/ratelimit.ts`.
- **Every mutation endpoint returns the whole album** — the editor never merges partial responses into local state.
- **Paper is data too** (`packages/shared/src/printing.ts`) — which paper, how many sheets and which sides each of the three PDFs wants is described once and said three times: as a badge in the print dialog, as a note for a copy shop (also its own page, `/a/<token>/print`), and in each PDF's `Subject` metadata.
- **Uploads are normalised on arrival** (`apps/server/src/storage.ts`) — auto-rotated from EXIF, EXIF stripped (privacy — this is a children's app), resized and re-encoded as JPEG.
- **Artwork randomness is a seeded PRNG** (`packages/shared/src/rng.ts`), never `Math.random`, so browser and PDF scatter decorations identically.
- **Gradients are stacked opaque bands** (`gradientBands`) because `pdf-lib` has no native gradient support; bands must fully overlap the previous one or antialiasing shows seams.

Directory map beyond what's obvious from the names:

```text
packages/shared/src/
  geometry.ts     paper sizes, reference page, every grid position
  imposition.ts   which album page prints where on which folded sheet
  art.ts          theme/cover-variant types; templates.ts has the six themes
  avatars.ts      the 24 passport pictures, each noun gendered per language
  nicknames.ts    adjective + that avatar's noun, agreeing in gender
  codes.ts        the six-character code format, shared by both sides
apps/server/src/
  pdf/            canvas.ts (mm -> points) + cover/pages/stickers builders
  repo.ts         SQLite access, scoped to an album's secret token
  identity.ts     people, devices, pairing and invite codes
  ratelimit.ts    in-memory sliding window; the real defence for short codes
  db/migrations/  numbered .sql files, applied at boot
apps/web/src/
  components/PageSheet, CoverSheet  mirror what the PDF prints, at editor zoom
                  InsideCoverSheet  the cover panel facing page 1 / the last page
                  QrCode, InviteDialog  showing a code; nothing here reads one
  screens/        Home (four choices, live preview), Editor, PrintNotice
                  (the print-shop sheet at /a/<token>/print), Passport (/me),
                  Join (/join/<code> from your own device, /i/<code> from a friend)
  identity.ts     the passport store; deviceKey.ts is its localStorage half
```

### Fonts

`assets/fonts` holds static instances of Nunito and Comfortaa (SIL OFL),
generated from the upstream variable fonts specifically to cover Serbian
Cyrillic (`Ђ Ј Љ Њ Ћ Џ`) and Russian Cyrillic (`Ё Ъ Ы Э Ю`). PDF base-14 fonts
have no Cyrillic — using one prints blank text instead of an error, so if you
touch font selection in `apps/server/src/pdf/fonts.ts`, verify Cyrillic still
renders.

### Not built yet

Passports, invites and per-child attribution exist; the live half of
collaboration does not. There is no presence and no push, so two children in one
album see each other's work on reload. Three known gaps, documented at more
length in [README.md](README.md)'s "Not built yet": album access is still the
edit token (so removing a member does not revoke them), a lost sole device
cannot be recovered, and there are no editor/viewer roles.
