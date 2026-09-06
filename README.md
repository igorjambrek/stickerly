# Налепко — a sticker album maker for kids

Make your own Panini-style sticker album, then print it with one click.

A child makes four choices — a theme, a cover, how big the album is and how many
stickers go on a page — then fills the numbered slots and presses **Print the
album**. A slot takes a photo dragged in from a desktop, one taken or chosen on a
phone, or one found by saying out loud what should be on it. Three PDFs come
back:

| PDF | Paper | What it is |
| --- | --- | --- |
| `<album> - cover.pdf` | one sheet, double-sided | the cover, folded around the block |
| `<album> - pages.pdf` | sheets, double-sided | the album pages, imposed so folding puts them in order |
| `<album> - stickers.pdf` | A4 sticker paper, double-sided | the stickers, with their numbers on the backing side (or on the picture, if you ask) |

Each file is named after the album, with a suffix — `cover` / `pages` / `stickers`
in English, `korice` / `strane` / `nalepnice` in Serbian, and so on — in the
album's own language, so three downloads never land on the same name.

The cover and pages print on A3 for a big album and A4 for a small one; sticker
sheets are always A4, because a sticker is always 50 × 70 mm.

**The child never sees a formatting control** — no margins, page setup, DPI,
bleed or "fit to page". Every one of those decisions is made by the code.

---

## The rule everything else follows

The editor and the PDF generator must agree on geometry to the millimetre. If
they drift, stickers do not fit their slots and the product is worthless. So all
layout maths lives once in [`packages/shared`](packages/shared/src) and is
consumed twice:

- [`apps/web/src/components/PageSheet.tsx`](apps/web/src/components/PageSheet.tsx) turns millimetres into CSS percentages
- [`apps/server/src/pdf/canvas.ts`](apps/server/src/pdf/canvas.ts) turns the same millimetres into PDF points

No layout constant is written twice. Artwork is the same: a theme is [shape
data](packages/shared/src/shapes.ts), drawn as SVG in the browser and as vector
paths in the PDF.

```text
sticker      50 ×  70 mm   the classic Panini size, fixed in every album
             70 ×  50 mm   the same sticker lying down, for a team photo
big album   210 × 297 mm   A4 pages, printed two-up on A3 landscape sheets
small album 148 × 210 mm   A5 pages, printed two-up on A4 landscape sheets
```

**Two coordinate systems share every page.** Artwork and chrome — cover art,
page backgrounds, the title band, the page number — are authored once against a
reference A4 page and drawn through a uniform scale, so an A5 page is the same
design at 71%, not a second one. The sticker grid is never scaled: a slot must
measure exactly 50 × 70 mm on paper, so a smaller album gets *fewer* slots, not
smaller ones. That is why "how many stickers on a page" is a real choice:

| Album | Stickers standing up | Stickers lying down |
| --- | --- | --- |
| small (A4 paper, A5 pages) | 2 or 4 per page | 2 per page |
| big (A3 paper, A4 pages) | 4, 6 or 9 per page | 4, 6 or 8 per page |

A sticker can also be turned on its side — the same 50 × 70 rectangle, lying
down. That is the third choice made when the album is created, and unlike the
other two it is only a starting point: it sets the shape of the cells and of
every sticker made in them.

**Any one sticker can then be turned inside the album, and a turned one takes
the room of two.** This is the team photo. A lying sticker is 70 mm across and
the grid is cut into 50 mm cells, so the only place one fits is across two of
them: turning a sticker swallows the sticker beside it — the editor asks first
when there is a photo to lose — and standing it back up hands that cell out
again as a fresh empty sticker. On the sticker sheet it is printed lying inside
an ordinary upright cell, so the sheet keeps one grid and one cut pitch; whoever
cuts it out turns it.

The count is per page and applies to every page. Album size and stickers-per-page
are both locked at creation — either would add or destroy slots in an album that
already has photos. The theme and the cover can be changed at any time, from the
same button: a theme is paint, and repainting moves no sticker.

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
| `npm test` | geometry, imposition, numbering, canvas, print, API and end-to-end tests |
| `npm run typecheck` | TypeScript across the whole workspace |
| `npm run build` | build the frontend into `apps/web/dist` |
| `npm start` | one process serving API **and** the built frontend on :3000 |
| `npm run pdf:sample [theme] [cover] [size] [perPage] [lang]` | write the three PDFs to `tmp/` from fixture data |
| `npm run pdf:sample covers` | write every cover to `tmp/covers.pdf`, one per page — the design review |

```bash
npm run pdf:sample football champions a3 9
npm run pdf:sample unicorns candy a4 2 en
```

Themes: `football`, `space`, `dinos`, `cars`, `unicorns`, `pets`, `class`;
`pdf:sample` lists a theme's covers if you name one that does not exist.

---

## Printing

The print dialog says this in the child's language; here it is for the grown-up:

1. **Actual size / 100%.** Turn *fit to page* and *shrink to printable area*
   off. This is the only setting that matters.
2. **Three files, three papers** (table below). The dialog badges every download
   with its own, because this is what a copy shop gets wrong.
3. **Double-sided, flip on the short edge** — all three files, and the
   imposition assumes that flip. The sticker sheet is double-sided too: the
   numbers print on the backing paper, behind their own stickers. If your
   printer will not take sticker paper twice, the dialog's other option puts
   the number back in the corner of the picture and the sheet becomes
   single-sided.
4. Fold the page sheets in half, nest them with the cover outermost, staple
   twice along the fold.
5. Check with a ruler: the bar in the bottom margin of a sticker sheet must
   measure exactly **50 mm**. If it does, nothing was scaled.

| file | paper | sheet | sides |
| --- | --- | --- | --- |
| `<album> - cover.pdf` | card, **200–250 g/m²** | A3 landscape (A4 for a small album) | both, short-edge flip |
| `<album> - pages.pdf` | **120–160 g/m²** — 80 g/m² office paper shows the photo through the sticker | A3 landscape (A4 for a small album) | both, short-edge flip |
| `<album> - stickers.pdf` | **self-adhesive**, matte | A4 portrait, always | both, short-edge flip — numbers on the back; one side if you print them on the picture |

The file name leads with the album's own name (Cyrillic titles transliterated to
stay ASCII) and ends with the part in the album's language.

Saddle stitching needs a page count divisible by four, so the app appends
autograph and swap pages at print time and says so in one sentence.

`/a/<token>/print` is the paper note as a page of its own — open it on a phone at
the copy-shop counter, or send the link. It sits behind the album's secret
token, so nobody needs an account. That description is written once in
[packages/shared/src/printing.ts](packages/shared/src/printing.ts) and said three
times: the download badge, that page, and each PDF's `Subject` metadata. The same
file also builds each download's name — the album's title, then the part, in the
album's language — so the browser, the `content-disposition` header and the PDF's
metadata all agree on what the file is called.

---

## Deploying

One container plus a volume, comfortable in 512 MB.

```bash
cp .env.example .env       # set SITE_ADDRESS and API_ADDRESS to your domains
docker compose up -d --build
```

Caddy terminates TLS and gets certificates for both names automatically.
Everything that must survive a restart — the SQLite database and uploaded photos
— lives in the `album-data` volume at `/data`. Back it up by copying the volume:

```bash
docker run --rm -v nalepko_album-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/album-backup.tar.gz -C /data .
```

(`docker volume ls` shows the real prefix — `nalepko_` or `album_`, depending on
the checkout directory.)

### Two names, one origin

`SITE_ADDRESS` serves the album. `API_ADDRESS` serves the same container's `/api`
under a name of its own and 404s everything else. The editor is *not* pointed at
`API_ADDRESS` — it calls `/api` with relative paths, staying on one origin with
the API, which is what makes the passport header safe to send and CSRF a
non-question (see `DEVICE_HEADER` in `apps/server/src/app.ts`). `API_ADDRESS` is
for callers that are not the editor.

The live socket is an `/api` route, so both names carry it and Caddy upgrades it
without being told to. Behind another proxy, the one thing to check is that it
forwards `Upgrade` — one that does not fails quietly.

### Finding pictures

Picture search works with no configuration, and better with some.

| Provider | Set | What you get |
| --- | --- | --- |
| **Openverse** (default) | nothing | Openly licensed and public-domain pictures, keyless; every result carries its licence, which matters because the output is paper. Anonymous callers get a modest rate limit and at most 20 results a page. |
| **Google** | `GOOGLE_API_KEY` and `GOOGLE_CSE_ID` | The open web, `safe=active`, 100 searches a day free. Used automatically once both are set; results carry no licence, and the editor says so under each one. |

`PICTURE_SEARCH=off` switches the feature off entirely; the editor asks
`/api/features` on load and stops offering it.

Openverse's weakness is language: it indexes mostly English titles, so `лав`
finds a handful of lions where `lion` finds twenty. If your children search in
Serbian or Russian, the Google keys are worth setting. Check either from the
command line — the way to find out whether a key actually works:

```bash
npm run pictures:check                 # whatever is configured, looking for a lion
npm run pictures:check ракета ru
```

It goes the whole way — search, open the pick, fetch the first picture. Bing is
not an option: Microsoft retired the Bing Search APIs in August 2025.

Kept deliberately cheap to host: PDFs are drawn with `pdf-lib`, not headless
Chrome, so there is no browser in the image (~490 MB) and no 1 GB memory floor. A
Hetzner CX22 (~€4/month) or any host with a persistent volume is enough; free
tiers that wipe the disk on restart are not, because the database and the photos
are files. `better-sqlite3` has no prebuilt binary for this Node version, so the
Dockerfile compiles it in a `deps` stage and copies the result forward.

### On Oracle Cloud

[infra/oci](infra/oci) builds the whole thing with Terraform inside the Always
Free allowance (one `VM.Standard.A1.Flex`, 4 OCPUs, 24 GB, 50 GB boot volume):

```bash
terraform -chdir=infra/oci init
terraform -chdir=infra/oci apply      # prints the IP to put in DNS
infra/oci/deploy.sh                   # copy the tree up, build it there
```

Worth knowing: the public IP is reserved, not ephemeral, so DNS survives a
rebuild (the instance is made with `assign_public_ip = false` and the address
attached separately); two firewalls must agree — the VCN security list and the
instance's own iptables, so `cloud-init.yaml` opens 80 and 443 in both; and
Ampere capacity comes and goes per availability domain — on *out of host
capacity*, set `availability_domain` to 2 or 3 and retry.

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs `typecheck`, the tests
and the frontend build on every pull request and on every push to `main`, and
then — from `main` only — runs `infra/oci/deploy.sh` if all three pass. It needs
two repository secrets — `DEPLOY_SSH_KEY` (the private half of `ssh_public_key`)
and `DEPLOY_HOST` (the reserved IP) — and reads optional `SITE_ADDRESS` /
`API_ADDRESS` overrides from repository *variables*. Deploys are serialised; a
pull request, having none, is instead cancelled and restarted by its own next
commit.

---

## How it is put together

```text
packages/shared/         geometry, imposition, numbering, themes, i18n
  geometry.ts            paper sizes, the reference page, every grid position
  imposition.ts          which album page prints where on which folded sheet
  numbering.ts           sticker numbers, derived from position and nothing else
  shapes.ts              the drawing primitives both renderers understand
  covers.ts              all 30 covers, built from one four-part composition
  templates.ts           the seven themes: palettes, page artwork, cover lists
  realtime.ts            the live protocol: what the socket says, both ways
apps/server/
  pdf/                   canvas.ts (mm -> points), cover, pages, stickers
  routes/                albums, images, print
  repo.ts                SQLite access, scoped to an album's secret token
  realtime.ts            the hub: sockets grouped by album, and what they hear
  storage.ts             upload normalising: auto-rotate, strip EXIF, resize
apps/web/src/
  components/PageSheet   the album page, at a different zoom to the printed one
  components/CoverSheet  the cover, mirroring what cover.ts prints
  components/FramedPhoto a photo filling a window, turned as the child left it
  components/Presence    the roster, with whoever is here right now lit up
  screens/               Home, Editor, PrintNotice (the sheet at /a/<token>/print)
  live.ts                the album's socket: reconnecting, and into the store
```

### Decisions worth knowing about

**A sticker is never resized — only turned.** It is a physical 50 × 70 mm
object, so sticker sheets are identical across album sizes and a page that
cannot fit nine of them gets four. Everything else on a page scales; this does
not. Turning one is the same rule seen from the other side: a lying sticker is
70 mm across, and the only room for that on a grid of 50 mm cells is two cells,
so a turned sticker costs the sticker beside it rather than being squeezed.
`slotSpanOf` in `geometry.ts` is that rule, and both renderers ask it where a
slot goes.

**Sticker numbers are never stored.** A number is a slot's position in reading
order, recomputed on every read, so adding a page, deleting one or dragging a
sticker renumbers everything for free and the screen cannot drift from the print.
A slot's *position* is stored, and it names a grid cell rather than a place in a
queue — a turned sticker leaves a cell behind that belongs to nobody, and closing
that gap would shove every sticker after it into the wrong square. The numbers
still run 1..N with nothing missing, which is the part a child counts.

**One sheet, one cut pitch.** A lying sticker is printed lying inside an upright
cell on an ordinary portrait A4 sticker sheet, rather than getting sheets of its
own. The paper that comes off the scissors is the same rectangle either way, so
sorting the shapes onto separate sheets would only buy part-empty paper and a
second calibration bar. `Panel.turned` pushes the quarter turn onto the PDF's own
graphics state, so the code that draws a sticker never learns about it.

**The number is printed on the backing paper, not on the picture.** A sticker's
number has one job — get it cut out and matched to its slot — and then it is in
the way for as long as the album lasts. So each sticker sheet is printed on both
sides: the stickers on the front, one big numeral in the middle of each cell on
the back, which is the liner the child peels off and throws away. The back is
the front mirrored top to bottom, because the whole job is printed with a
short-edge flip and the sticker sheet is the one upright sheet in it
(`stickerBackRect` in `geometry.ts`). The numbers are bare numerals rather than
the app's filled badges: the liner is silicone-coated and holds toner badly, and
a numeral alone on white is the most legible mark per drop of ink. The name band
across the foot of the sticker went from nearly solid to a wash for the same
reason — it is the foot of a child's photo before it is a label.

**...but that one is a choice, and it belongs to the print run.** Plenty of
printers will not feed self-adhesive paper a second time, and the Panini way —
the number in the corner of the picture — is the one every child already knows.
So the print dialog offers both, and picking the picture takes the sheet's
second side away with it. The choice is never stored: the same album can be
printed either way an hour apart, so it travels as `?numbers=` on the request
and in the print-shop sheet's own link, and all three PDFs are told, because the
cover's "how to stick them in" has to point a child at the right side. One
function, `duplexFor`, turns the choice into a number of sides — which is what
the download badges, the note for the copy shop and each PDF's own metadata all
read from, so none of them can end up describing a different job.

**Every cover is data.** A cover variant is a palette override plus four artwork
functions; all 30 are built by `buildCover` from one skeleton — gradient sky,
wash, texture, a scene along the bottom, one emblem at the top — which is why
they look like a set. Adding a cover is one entry in `covers.ts`. The bands where
the title plaque and the sticker count sit are left quiet, so artwork can never
make a title harder to read.

**A theme can be changed after the fact; a size cannot; a sticker's own turn
can.** Which way up the album stands its stickers is chosen with the size, but
only as a starting point — the grid it decides is fixed, while any one sticker
in it can be laid down or stood back up at any time.

**A theme can be changed after the fact; a size cannot.** A theme decides
colours and artwork and nothing else, so an album half full of dinosaur stickers
can become a cars album with every sticker, label and number where it was. It
lives behind the cover button because the two are one decision: cover ids belong
to their theme, so a new theme has to choose a cover with it —
[`carryCover`](packages/shared/src/templates.ts) keeps a photo cover a photo
cover and otherwise lands on the new theme's own. Size and stickers-per-page stay
locked, because those destroy slots.

**A cover photo is an ordinary album image**, just kept at higher resolution —
the upload, token scoping, EXIF stripping and cleanup are machinery that already
existed.

**Albums are reached by a secret link, not an account.** No sign-up for a child,
no personal data; photos are served through the same token, so an unshared link
exposes nothing. It is also the foundation the sharing feature needs.

**The passport is asked for once, on the way in.** A genuinely first visit — no
device key, no albums this browser remembers making — gets one screen before the
album steps: a face and a name, both boxes pre-filled, so it costs one tap and
the passport is minted on that tap rather than on arrival. It comes first because
everything later (whose name goes on the cover, who brought which sticker) wants
an answer that already exists. A child landing on a friend's invite link is asked
the same two things on the join screen. Everywhere else the passport stays lazy: a
child handed only an album link is never asked who they are.

**A passport is a picture and a made-up name.** It is an avatar, a nickname and a
random key the browser keeps; the server stores only the key's SHA-256. A new one
arrives already named (e.g. `Брзи Лав`), so the easy path stops being "type your
real name". Nicknames are the one place translation is not enough — Serbian and
Russian adjectives agree with the noun's gender, so each avatar records a gender
per language and each adjective carries three forms
([`nicknames.ts`](packages/shared/src/nicknames.ts)).

**Another device is added by showing it a QR, not by signing in.** The passport
screen mints a six-character code that lives ten minutes and works once; the QR
wraps it as an ordinary `/join/<code>` link, so the second device reads it with
its own camera app — this app has no scanner. The alphabet in
[`codes.ts`](packages/shared/src/codes.ts) leaves out `0 1 I L O U`. Six
characters is safe only because the code expires, works once, and sits behind a
rate limiter — a wrong guess matches no row, so the per-code counter never sees
it.

**Losing the only device loses the passport.** Pairing needs the first device
working and present, and nothing else recovers an account — every alternative (an
email, a password, a security question) is personal data or something a
six-year-old cannot do. The albums survive: they are still reachable by their
secret links.

**Membership is a roster, not a lock.** Joining by invite writes an
`album_members` row and hands over the album's edit token, which is what actually
grants access. So the roster records who is here and puts a face on their
stickers; it does not gate them, and removing someone cannot claw back a token
they already hold. Real revocation needs album access to stop being the token —
see "Not built yet".

**The editor shows a spread, not a page.** A finished album is read two pages at
a time, and the folded sheets decide which two: page 1 faces the inside of the
cover, and every even page sits on the left of an odd one. `spreads()` in
[`imposition.ts`](packages/shared/src/imposition.ts) states that rule once, and
the editor lays the two sheets out side by side accordingly. One of the two is
the *active* page — the one the page strip selected, and the one renaming and
deleting act on.

**A phone gets a different shape, not a smaller one.** Two A4 pages side by side
on a 390 px screen leave a sticker smaller than the finger that has to hit it. So
on a phone the spread becomes a track that snaps — one page fills the screen, the
facing one is a swipe away — sized from the height left over rather than the
width. Everywhere else the same three moves: dialogs rise from the bottom edge as
sheets, the editor's rarer actions fold into one `⋯` menu, and the home screen
grows a bar that follows the child down the page carrying the cover so far.
Almost all of it is CSS; the three places that need different markup share one
breakpoint through `useMedia.ts`.

**A finger drags differently from a mouse.** The editor runs a `MouseSensor` and
a `TouchSensor` rather than one `PointerSensor`: on a touch screen a sticker has
to be held still for a moment before it lifts, so a swipe that starts on one
scrolls the page instead of tearing a sticker off.

**Every mutation returns the whole album.** It is a few kilobytes, and it means
the editor never merges a partial response into local state.

**Everybody else is told the same thing, over a socket.**
[`realtime.ts`](apps/server/src/realtime.ts) is a hand-rolled hub over
`@fastify/websocket`: sockets grouped by album, the group broadcast to, the
client reconnecting on its own. Nothing is *sent* over the socket — edits stay
ordinary HTTP requests, where validation and the "saving / saved" note already
work — which is what makes a dropped connection dull: the album stops moving on
its own, and nothing stops working. Three things make it safe:

- **A revision on every album that crosses the wire.** The same change reaches an
  editor twice — its own response, and the push for everyone else — in either
  order. Each reading carries the revision it was taken at, and an editor ignores
  anything older than what it has. Revisions are seeded from the wall clock, so
  they keep climbing across a restart.
- **The editor that caused a change is left out of it**, by naming its own socket
  in an `x-nalepko-socket` header.
- **The socket grants nothing.** It is opened with the album's edit token like
  every other route and says only what a `GET` of that album already would.

Presence rides along: the roster is who has ever joined, and the ones who have
the album open right now are lit. Both halves live in this one process's memory —
a second instance would need them somewhere both could see.

**Last writer wins, and that is the whole conflict story.** Two children on the
same sticker is rare enough — the album is a grid of numbered places — that it is
not worth a locking scheme a six-year-old would have to understand. The loser
sees their change replaced, not merged.

**Uploads are normalised on arrival** — rotated upright from EXIF, stripped of
metadata (phone photos carry GPS coordinates, and this is a children's app),
resized and re-encoded as JPEG.

**A picture can be found, not only owned.** A child who wants a lion has no
photograph of one, so an empty sticker offers a third way in beside the drag and
the camera: press the microphone, say `лав`, and pick one off a shelf. The speech
is the browser's own — no key, nothing added to the image — and the shelf comes
from a provider behind a seam (see *Finding pictures*). The way in is per device:
a desktop keeps the drop zone, a phone gets **Take a photo** and **From your
photos** as two buttons, because `capture` is the difference between opening the
camera and opening the camera roll and one attribute cannot be both.

**A found picture is never fetched by address.** A search result carries a `pick`
— the address, signed by this process, good for fifteen minutes — and the fetch
route will only go and get a picture for a `pick` it signed itself. The fetch
behind it ([`remotefetch.ts`](apps/server/src/remotefetch.ts)) is https only,
checks every resolved address against the private ranges *and pins the socket to
the address that was checked* (resolving twice is the DNS-rebinding hole),
follows redirects by hand through the same checks, and abandons the read at the
byte cap. From the row it writes onward, a found picture is exactly an uploaded
one.

**Artwork is deterministic.** Decorations are scattered from a seeded PRNG rather
than `Math.random`, so the browser and the PDF scatter them identically.

**Gradients are stacks of bands.** `pdf-lib` has no gradient, so `gradientBands`
lays down thin rectangles, each running to the far edge so it completely covers
the one before. Bands that merely abut show a hairline seam wherever a renderer
antialiases their shared edge.

### Fonts

`assets/fonts` holds static instances of Nunito and Comfortaa (SIL OFL),
generated from the upstream variable fonts to cover Serbian Cyrillic
(`Ђ Ј Љ Њ Ћ Џ`) and the rest of Russian Cyrillic (`Ё Ъ Ы Э Ю`). The PDF base-14
fonts have no Cyrillic at all — miss this and text silently prints blank.

---

## Not built yet

Sharing is the reason this app has a server rather than running entirely in the
browser. Children have passports, invites put friends on an album's roster, a
sticker remembers who brought it, and edits arrive while you watch, with the
faces of whoever else is in the album lit up beside them. What the live half
still stops short of:

- **It is one process's memory.** A second instance would see none of the first
  one's sockets — getting there is a message bus and a shared revision, not a
  rewrite.
- **Nothing is shown mid-edit** — no cursor, no "typing", no sign that somebody
  else is holding the sticker you are about to take.
- **Last writer wins**, with no merge and no undo of somebody else's overwrite.
- **Nothing translates the query.** A child searching in Serbian searches a
  mostly English index unless the deployment has Google keys.

Three more things the passport layer stops short of, in the order they matter:

- **Album access is still the token.** Making the device key the credential — and
  demoting the token to one kind of invite — is what would let an owner actually
  remove a member, and would keep the secret out of every `<img src>` and browser
  history. The tables are shaped so this is a migration, not a rewrite.
- **A printable passport card** — one page with the avatar, the nickname and a
  recovery QR, for the parent to keep. It answers the lost-device gap and is a
  natural fit for an app that already prints PDFs.
- **Editor and viewer roles**, and revoking an invite before it expires.
