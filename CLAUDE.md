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
npm run pictures:check [query] [lang]   # ask the configured picture provider from the CLI, then fetch the first hit
```

Tests use Node's built-in test runner via `tsx`, not a separate test framework:

```bash
# single file
node --import tsx --test packages/shared/test/geometry.test.ts
# single test by name (--test-name-pattern is a regex)
node --import tsx --test --test-name-pattern "imposition" apps/server/test/print.test.ts
```

There is no lint script configured; `npm run typecheck` is the correctness gate besides tests.

Two kinds of test file live in `apps/server/test`. Most take one module or one
group of routes and stub the neighbours. Two do not:
[journeys.test.ts](apps/server/test/journeys.test.ts) walks a whole album from
creation to three PDFs, and a friend into it by invite, over real HTTP and a
real socket; [deployment.test.ts](apps/server/test/deployment.test.ts) boots the
app on a file-backed database, restarts it onto the same directory, and serves
the built frontend. Their harness — a listening app, a browser holding one
child's passport and socket, a live client — is
[apps/server/test/helpers](apps/server/test/helpers); reuse it rather than
opening sockets by hand. Both run in `npm test`, and CI runs `typecheck`, the
tests and the frontend build on every pull request.

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

- **The editor shows two pages at once** — `spreads()` in `imposition.ts` pairs them the way the folded sheets do (page 1 faces the inside cover, even pages sit on the left), so a page is never judged out of the company it prints in. On a phone the pair becomes a scroll-snapping track instead: one half fills the screen and the other is a swipe away, which keeps the pairing without shrinking a sticker below a fingertip.
- **A phone is a different shape, not a smaller screen** — most of it is CSS (`styles.css` is organised by area, with each area's phone rules beside its own), but three places need different markup rather than a rearrangement of the same markup, and those ask `useMedia(PHONE)` in JS: the editor's toolbar (a bar, or a `⋯` sheet), the spread, and the home screen's sticky "make it" bar. The album's actions are described once as an `actions` array in `Editor.tsx` and rendered both ways from it, so a new action cannot exist on one and not the other.
- **Sticker numbers are never stored** — a slot's number is its reading-order position, recomputed on every read (`packages/shared/src/numbering.ts`).
- **Album size and stickers-per-page are locked at creation** — changing either would add/destroy slots in an album that may already have photos.
- **The theme is not locked** — it is only paint, so `PUT /api/albums/:token/cover` takes a `templateId` beside the cover and the editor's cover dialog offers both (`components/ThemePicker.tsx`). Cover ids belong to their theme, so changing theme has to choose a cover too: `carryCover` in `templates.ts` keeps a photo cover a photo cover and otherwise falls to the new theme's own. Nothing about pages, slots, photos or numbering is touched.
- **A cover is data**: a palette override + four artwork functions in `packages/shared/src/covers.ts`; `buildCover` composes all 30 from one skeleton (gradient sky, wash, texture, scene, emblem). Adding a cover = one entry there.
- **Albums are reached by secret link, not account** — `apps/server/src/repo.ts` scopes all SQLite access by an album's secret token; photos are served through the same token.
- **Passports are a layer on top, never a gate** — a person is an avatar plus a generated nickname, authenticated by a device key hashed into `devices` and sent as the `x-nalepko-device` header. `req.person` is resolved for every request and required by almost none: album routes read it only to record who did something, so an anonymous child with a link still works. Identity lives in `apps/server/src/identity.ts`; `album_members` stays with the album data in `repo.ts`.
- **The passport is asked for before the first album, and pre-filled** — a genuinely first visit to `/` (no device key, no albums this browser remembers) gets `screens/Welcome.tsx` instead of the album steps, and an invite link asks the same two things on the join screen. Both come with a face and a name already chosen, so either costs one tap, and both mint on that tap rather than on arrival — a bare page view still creates nobody. `components/PassportForm.tsx` is that form in all three places it appears; the passport screen is the third, and the only one that saves as it goes rather than holding a draft.
- **Nicknames are generated, and gendered** — `packages/shared/src/nicknames.ts` puts an adjective in front of the avatar's own noun, and Serbian/Russian adjectives must agree with that noun's gender, so avatars carry a gender per language and adjectives carry three forms. Never generate one from `rng.ts` (seeded, for artwork); the caller supplies real entropy.
- **A second device is added by QR, and this app has no scanner** — the QR holds an ordinary `/join/<code>` link that the other device's camera app opens. Codes (`packages/shared/src/codes.ts`) are six characters from an alphabet with no look-alikes, single-use, ten minutes, and safe only because of the rate limiter in `apps/server/src/ratelimit.ts`.
- **Every mutation endpoint returns the whole album** — the editor never merges partial responses into local state.
- **And says the same thing to everybody else** — `apps/server/src/realtime.ts` is a SignalR-style hub over `@fastify/websocket`: sockets grouped by album, every mutation route ending in `live.publish(req, token)`, which returns the response body *and* broadcasts it. Nothing is sent up the socket; edits stay HTTP. Every album on the wire carries a monotonic `rev` (seeded from the clock, in memory, per process) and the editor drops readings older than the one it has; the editor that caused a change is excluded by naming its socket in `x-nalepko-socket`. Conflicts are last-writer-wins by design.
- **Paper is data too** (`packages/shared/src/printing.ts`) — which paper, how many sheets and which sides each of the three PDFs wants is described once and said three times: as a badge in the print dialog, as a note for a copy shop (also its own page, `/a/<token>/print`), and in each PDF's `Subject` metadata.
- **Uploads are normalised on arrival** (`apps/server/src/storage.ts`) — auto-rotated from EXIF, EXIF stripped (privacy — this is a children's app), resized and re-encoded as JPEG.
- **A picture can be found, not only owned** — an empty sticker offers every way in this device actually has: the drop zone on a desktop, camera and gallery as two buttons on a phone (`capture` is one attribute and cannot be both), and on either, "say what you want". The speech is the browser's own Web Speech API (`apps/web/src/voice.ts`), which is not local — the audio goes to the browser vendor — so it never starts on its own and the typed box beside it is always there. `PICTURE_SEARCH=off` removes the door; the editor asks `/api/features` once (`apps/web/src/features.ts`) rather than offering one that opens onto nothing.
- **The shelf is a provider seam** (`apps/server/src/pictures.ts`) — Openverse (keyless, openly licensed, the default because it works with no configuration) or Google CSE (when `GOOGLE_API_KEY` and `GOOGLE_CSE_ID` are both set). Adding a third is one `search` function and one line in `providerFor`. Openverse caps an anonymous page at 20 and indexes mostly English titles; Google's page is 10 and its results carry no licence. A result carries the licence either way, because these albums get printed.
- **A found picture is never fetched by address** — a result carries a `pick`, the address signed by this process with a per-process key and good for fifteen minutes, and the fetch route will only go and get a picture for a `pick` it signed itself. `apps/server/src/remotefetch.ts` is the guard behind that: https only, resolved addresses checked against the private ranges *and the socket pinned to the address that was checked* (resolving twice is the rebinding hole), redirects followed by hand through the same checks, byte cap enforced during the read. Everything from there on is the ordinary upload path — same `storeImage`, same stripping, same `live.publish`.
- **Artwork randomness is a seeded PRNG** (`packages/shared/src/rng.ts`), never `Math.random`, so browser and PDF scatter decorations identically.
- **Gradients are stacked opaque bands** (`gradientBands`) because `pdf-lib` has no native gradient support; bands must fully overlap the previous one or antialiasing shows seams.

Directory map beyond what's obvious from the names:

```text
packages/shared/src/
  geometry.ts     paper sizes, reference page, every grid position
  imposition.ts   which album page prints where on which folded sheet
  art.ts          theme/cover-variant types; templates.ts has the seven themes
  avatars.ts      the 24 passport pictures, each noun gendered per language
  nicknames.ts    adjective + that avatar's noun, agreeing in gender
  codes.ts        the six-character code format, shared by both sides
  realtime.ts     what the live socket says in both directions, and `rev`
  pictures.ts     what a found picture is, and the tag the recogniser wants
apps/server/src/
  pdf/            canvas.ts (mm -> points) + cover/pages/stickers builders
  repo.ts         SQLite access, scoped to an album's secret token
  identity.ts     people, devices, pairing and invite codes
  ratelimit.ts    in-memory sliding window; the real defence for short codes
  realtime.ts     the hub: album groups, revisions, presence, the heartbeat
  pictures.ts     the providers, and the signing that makes a `pick`
  remotefetch.ts  fetching bytes from a host we do not control, safely
  db/migrations/  numbered .sql files, applied at boot
apps/web/src/
  components/PageSheet, CoverSheet  mirror what the PDF prints, at editor zoom
                  InsideCoverSheet  the cover panel facing page 1 / the last page
                  QrCode, InviteDialog  showing a code; nothing here reads one
                  Dialog            the one modal: a card, or a phone bottom sheet
                  LangSwitch        the four languages, named or abbreviated
                  Presence          the roster, with whoever is here right now lit
                  PictureSearch     the microphone, the shelf, and the credits
                  ThemePicker       the seven themes, for an album that exists
                  PassportForm      a face and a name, and when they are written down
  live.ts         the album's socket: reconnect, catch up, write to the store
  voice.ts        the browser's speech recognition, and whether there is any
  features.ts     what this server can do, asked once
  useMedia.ts     the one breakpoint the components and the stylesheet share
  screens/        Home (four choices, live preview), Welcome (who are you, on
                  a first visit; rendered by Home, not routed to), Editor,
                  PrintNotice (the print-shop sheet at /a/<token>/print),
                  Passport (/me), Join (/join/<code> from your own device,
                  /i/<code> from a friend)
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

Passports, invites, per-child attribution, live pushes and presence all exist.
What the live half still lacks: it is one process's memory (no second instance),
nothing is shown mid-edit (no cursors, no "typing"), and conflicts are
last-writer-wins with no merge. Three further gaps, documented at more length in
[README.md](README.md)'s "Not built yet": album access is still the edit token
(so removing a member does not revoke them), a lost sole device cannot be
recovered, and there are no editor/viewer roles.

Picture search has one of its own: nothing translates the query, so a Serbian
child searches a mostly English index unless the deployment has Google keys.
