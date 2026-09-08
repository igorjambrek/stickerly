/**
 * What a dragged picture really points at.
 *
 * The commonest way a picture gets into an album is not the file dialog: a
 * child opens an image search in another window and drags a result across. The
 * browser is helpful about that and hands over a file — but the file is the
 * bytes the *results page* was showing, which is a thumbnail two or three
 * hundred pixels wide. It arrives looking fine on glass and prints as a
 * mosaic, and nothing about the drop says so.
 *
 * The drag carries more than the file, though. Alongside it are `text/uri-list`
 * — the link the picture sat inside, not the picture — and `text/html`, the
 * dragged element's own markup. An image search puts the original's address in
 * that link, as a query parameter it uses to build its preview panel, and any
 * page at all may name bigger copies in a `srcset`. Either is a better picture
 * than the one in hand.
 *
 * So this reads those two flavours and answers one question: is there a bigger
 * original than the bytes the browser gave us? Nothing here fetches anything or
 * knows what a DataTransfer is — it is string work, so that it can be tested
 * without a browser. The web side reads the drop, this decides, and the server
 * decides whether it is willing to go there.
 */

/**
 * Image searches that wrap each result in a link naming the original.
 *
 * Dragging a linked image gives the *link* in `text/uri-list`, which is what
 * makes this work at all: the child drags a thumbnail and the browser quietly
 * hands over the address of the full-size picture behind it.
 */
const WRAPPERS: readonly { host: RegExp; param: string }[] = [
  // google.com, google.co.uk, google.rs ... /imgres?imgurl=<original>
  { host: /(^|\.)google(\.[a-z]{2,3}){1,2}$/, param: 'imgurl' },
  { host: /(^|\.)bing\.com$/, param: 'mediaurl' },
  // DuckDuckGo proxies the picture itself: /iu/?u=<original>
  { host: /(^|\.)duckduckgo\.com$/, param: 'u' },
  { host: /(^|\.)yandex(\.[a-z]{2,3}){1,2}$/, param: 'img_url' },
];

/** Only https, because that is all the server will go and fetch anyway. */
const usable = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The original a search engine's result link is standing in front of.
 *
 * Returns nothing for an ordinary link, which is the common case and not a
 * failure: most drags are not from a search engine.
 */
export function unwrapSearchLink(link: string): string | undefined {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return undefined;
  }
  for (const { host, param } of WRAPPERS) {
    if (!host.test(url.hostname)) continue;
    const inner = url.searchParams.get(param);
    if (inner) return usable(inner);
  }
  return undefined;
}

/** One `srcset` candidate: an address and how big the page says it is. */
interface Candidate {
  url: string;
  width: number;
}

/**
 * The widest picture a `srcset` offers.
 *
 * Both descriptor kinds are read — `1200w` says how many pixels across, `2x`
 * says how many times the layout size — and compared on the only thing that
 * matters here, which is which one has the most pixels. A bare candidate with
 * no descriptor is the 1x one.
 *
 * Splitting on commas is not quite enough on its own: a data URI is allowed to
 * contain commas, and so is a query string. Candidates are separated by a comma
 * that is followed by whitespace and then a non-space, which is what the
 * grammar actually requires, so that is what is split on.
 *
 * Candidates we could not fetch anyway — relative addresses, `data:`, plain
 * http — are dropped before the comparison rather than after it, so a page
 * whose biggest copy is unusable still offers up its next biggest.
 */
export function widestInSrcset(srcset: string): string | undefined {
  const best = srcset
    .split(/,\s+(?=\S)/)
    .map((part): Candidate | undefined => {
      const [raw, descriptor] = part.trim().split(/\s+/, 2);
      const url = raw ? usable(raw) : undefined;
      if (!url) return undefined;
      const match = /^(\d+(?:\.\d+)?)([wx])$/.exec(descriptor ?? '');
      // No descriptor at all is the 1x candidate. `2x` and `1200w` are not
      // comparable in any real sense, but a page never mixes them, and within
      // either kind bigger is bigger — which is the only ordering wanted here.
      return { url, width: match ? Number(match[1]) : 1 };
    })
    .filter((c): c is Candidate => c !== undefined)
    .reduce<Candidate | undefined>((a, b) => (a && a.width >= b.width ? a : b), undefined);

  return best?.url;
}

const attribute = (html: string, name: string): string | undefined => {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(html);
  return match?.[2] ?? match?.[3];
};

/**
 * A bigger original than the bytes the browser handed over, or nothing.
 *
 * Nothing is the right answer more often than not, and it means "upload the
 * file you already have" rather than "this drop failed": dragging a picture off
 * an ordinary page gives a file that already *is* the full picture, and going
 * back out to the network for a second copy of it would cost a round trip to
 * arrive exactly where we started.
 *
 * `uriList` and `html` are the drag's `text/uri-list` and `text/html` flavours,
 * verbatim. Both may be empty — a drag from the desktop carries neither.
 */
export function betterPictureUrl(uriList: string, html: string): string | undefined {
  // RFC 2483: one URL per line, and lines starting with # are comments.
  const link = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'));

  // A search result names its original outright; nothing beats being told.
  const unwrapped = link ? unwrapSearchLink(link) : undefined;
  if (unwrapped) return unwrapped;

  // Otherwise the page may be offering bigger copies of what was dragged.
  const srcset = attribute(html, 'srcset');
  if (!srcset) return undefined;

  const widest = widestInSrcset(srcset);
  // Only worth a fetch if it is a different picture from the one already in
  // hand. Both sides go through `usable` so that the same address written two
  // ways does not read as two pictures.
  const src = usable(attribute(html, 'src') ?? '');
  return widest && widest !== src ? widest : undefined;
}
