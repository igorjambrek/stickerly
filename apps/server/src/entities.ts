/**
 * The name behind what a child said.
 *
 * A Serbian speech recogniser writes down Serbian. Asked for the footballer
 * Lamine Yamal it hears, correctly, `lamin Jamal` — Serbian spells that sound
 * with a `J` — and a picture index that matches words in English titles then
 * finds nothing at all. The child said the right name and the shelf came back
 * empty, which is the worst answer this feature can give: it reads as "no such
 * person" rather than "spelled differently over there".
 *
 * Wikipedia already solves this, because solving it is most of what an
 * encyclopedia's search box does. `lamin Jamal` finds `Ламин Јамал` on the
 * Serbian Wikipedia, that page carries a Wikidata id, and that item knows the
 * article is called `Lamine Yamal` in English. Two hops, and the query is
 * spelled the way the pictures are labelled.
 *
 * This runs only when the ordinary search found nothing, and that restraint is
 * the design rather than an optimisation:
 *
 *  - it is aimed at names, and names are exactly the queries that come back
 *    empty. A word like `lav` already returns twenty pictures, and running it
 *    through here makes it worse rather than better — full-text search ranks a
 *    singer called Taylor Love above the animal, so a child asking for a lion
 *    would be handed a stranger. Bad ranking and no results are different
 *    complaints and this only answers the second one;
 *  - an empty shelf is the one moment a slower answer costs nothing, because
 *    the alternative on offer is failure;
 *  - and Wikimedia rate-limits bursts, so the fewer times we knock, the more
 *    likely somebody is in when it matters.
 *
 * Nothing here throws. A lookup that fails leaves the child exactly where they
 * already were — in front of the empty shelf they had anyway. Being turned away
 * for asking too often is the one failure worth a second go, because every
 * child on this deployment shares one address and so shares one rate limit.
 */

import type { Lang } from '@album/shared';
import { config } from './config.ts';

/**
 * Which Wikipedia to ask. Both Serbian scripts are one Wikipedia, and it reads
 * either script, which is the same reason the recogniser takes one tag for both.
 */
const wikiFor = (lang: Lang): string => (lang === 'ru' ? 'ru' : lang === 'en' ? 'en' : 'sr');

/**
 * Statuses worth knocking again for: too many of us at once, and a server that
 * is briefly busy. Everything else is an answer, even when it is a refusal.
 */
const RETRY_STATUS = new Set([429, 503]);

/**
 * How long to wait before each further attempt.
 *
 * Wikimedia counts requests per address, and every child on this deployment
 * shares one — so a busy afternoon can meet a limit that no single search
 * deserved. Waiting a moment and asking again is usually all it takes.
 *
 * The length of this array is the number of retries, and the numbers in it are
 * a child's patience: this only runs when the shelf came back empty, so the
 * choice is a couple of seconds against certain failure.
 */
const BACKOFF_MS = [500, 1500];

/**
 * The whole lookup, both hops and every retry, is never worth more than this.
 * Without a shared budget a slow answer and a backoff can stack into a wait
 * nobody agreed to.
 */
const BUDGET_MS = 6000;

/** A `Retry-After` longer than this is a no, not an instruction to obey. */
const MAX_BACKOFF_MS = 3000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long to wait before knocking again.
 *
 * `Retry-After` is the server saying plainly when it will have us back, so it
 * wins over our own guess — but only within reason. Told to come back in five
 * minutes, we do not; a child is standing in front of an empty shelf, and the
 * honest answer at that point is that we could not help.
 */
function waitFor(res: Response, fallback: number): number | null {
  const header = res.headers.get('retry-after');
  if (!header) return fallback;

  // The header is either a number of seconds or an HTTP date; both happen.
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return fallback;

  return ms > MAX_BACKOFF_MS ? null : Math.max(ms, fallback);
}

/**
 * A Wikimedia call that answers with nothing rather than badly, and that tries
 * again when being turned away looks temporary.
 */
async function ask(url: string, deadline: number): Promise<Record<string, any> | null> {
  for (let attempt = 0; ; attempt++) {
    const left = deadline - Date.now();
    if (left <= 0) return null;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': config.pictures.userAgent },
        // Never longer than the budget has left, however patient the config is.
        signal: AbortSignal.timeout(Math.min(config.pictures.timeoutMs, left)),
      });
    } catch {
      // A timeout or a dead socket. Retrying that inside a request a child is
      // waiting on buys less than it costs.
      return null;
    }

    if (res.ok) {
      try {
        return (await res.json()) as Record<string, any>;
      } catch {
        return null;
      }
    }

    if (!RETRY_STATUS.has(res.status) || attempt >= BACKOFF_MS.length) return null;

    const wait = waitFor(res, BACKOFF_MS[attempt]!);
    if (wait === null || Date.now() + wait >= deadline) return null;
    await sleep(wait);
  }
}

/**
 * What this is called in English, or null if it is not a thing with a name.
 *
 * The English title is what we are after because that is the language picture
 * archives label things in — not because English is the point, but because a
 * Serbian query has to arrive somewhere the pictures can be found.
 */
export async function canonicalName(query: string, lang: Lang): Promise<string | null> {
  const wiki = wikiFor(lang);
  // One clock for the whole lookup, so a retry on the first hop cannot spend
  // what the second one still needs.
  const deadline = Date.now() + BUDGET_MS;

  // The top article for the query, and its Wikidata id, in one call.
  const search = await ask(
    `https://${wiki}.wikipedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1` +
      `&prop=pageprops&ppprop=wikibase_item&format=json`,
    deadline,
  );

  const pages = search?.query?.pages;
  const page = pages && typeof pages === 'object' ? Object.values(pages)[0] : null;
  const item = (page as Record<string, any> | null)?.pageprops?.wikibase_item;
  if (typeof item !== 'string' || !item) return null;

  // What that item's article is called on the English Wikipedia. An item with
  // no English article is not a dead end worth a third guess: whatever it is,
  // an English picture index has probably not heard of it either.
  const entity = await ask(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(item)}` +
      `&props=sitelinks&sitefilter=enwiki&format=json`,
    deadline,
  );

  const title = entity?.entities?.[item]?.sitelinks?.enwiki?.title;
  return typeof title === 'string' && title ? title : null;
}
