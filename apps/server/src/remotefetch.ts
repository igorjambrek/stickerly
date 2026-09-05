/**
 * Downloading a picture from somewhere that is not us.
 *
 * Picture search ends with the server fetching bytes at an address that came
 * back from a third party, which is the classic way a server is talked into
 * reading its own network. Everything here exists to stop that:
 *
 *  - only `https`, and only ports 443/8443 — no `file:`, no unencrypted hop
 *    where a middlebox could swap the answer;
 *  - every address the hostname resolves to is checked before the socket is
 *    opened, and the socket is then pinned to the address that was checked.
 *    Validating the name and letting Node resolve it again is the DNS-rebinding
 *    hole, and it is the one people leave open;
 *  - redirects are followed by hand, at most three, each going through the same
 *    two checks — a public host answering `302 http://169.254.169.254/` is the
 *    other half of the same attack;
 *  - the response must announce itself as an image, and the read is abandoned
 *    the moment it grows past the cap rather than after.
 *
 * None of this depends on the caller being careful. `storage.ts` still decides
 * whether the bytes really are a picture; this only decides whether we were
 * allowed to go and get them.
 */

import { lookup as dnsLookup } from 'node:dns';
import { request } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

export class BlockedAddress extends Error {}
export class NotAPicture extends Error {}
export class TooBig extends Error {}

const ALLOWED_PORTS = new Set(['', '443', '8443']);
const MAX_REDIRECTS = 3;

/**
 * True for an address on the public internet.
 *
 * Written as an exclusion list of every range that is *not* out there: this
 * host, this network, the link, the carrier's shared space, and the cloud
 * metadata service that lives at 169.254.169.254 and hands out credentials to
 * anything that asks it from inside.
 */
export function isPublicAddress(address: string): boolean {
  const kind = isIP(address);

  if (kind === 4) {
    const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return false; // this host, private, loopback
    if (a === 169 && b === 254) return false; // link-local, and cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 168) return false; // private
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // protocol assignments, test
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    if (a >= 224) return false; // multicast, reserved, broadcast
    return true;
  }

  if (kind === 6) {
    const v6 = address.toLowerCase().replace(/^\[|\]$/g, '');
    // An IPv4 address wearing an IPv6 hat is still that IPv4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
    if (mapped) return isPublicAddress(mapped[1]!);
    if (v6 === '::' || v6 === '::1') return false; // unspecified, loopback
    if (/^f[cd]/.test(v6)) return false; // unique local, fc00::/7
    if (/^fe[89ab]/.test(v6)) return false; // link-local, fe80::/10
    if (v6.startsWith('ff')) return false; // multicast
    if (v6.startsWith('64:ff9b:')) return false; // NAT64, a way back to v4
    return true;
  }

  return false;
}

/**
 * A DNS lookup that refuses to answer with an address we would not connect to.
 *
 * Handed to the request itself, so the address that was checked is the address
 * the socket goes to. There is no window between the two for the name to change
 * its mind.
 */
const pinnedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...(options as object), all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const safe = addresses.filter((a) => isPublicAddress(a.address));
    if (safe.length === 0) {
      return callback(new BlockedAddress(`${hostname} is not a public address`), '', 0);
    }
    // `all` is what the caller asked for, not what we asked DNS for.
    if ((options as { all?: boolean }).all) {
      return (callback as unknown as (e: Error | null, a: typeof safe) => void)(null, safe);
    }
    callback(null, safe[0]!.address, safe[0]!.family);
  });
};

function assertFetchable(target: URL): void {
  if (target.protocol !== 'https:') throw new BlockedAddress('only https pictures can be fetched');
  if (!ALLOWED_PORTS.has(target.port)) throw new BlockedAddress(`port ${target.port} is not allowed`);
  // A literal address in the URL never reaches DNS, so it is checked here.
  const literal = target.hostname.replace(/^\[|\]$/g, '');
  if (isIP(literal) && !isPublicAddress(literal)) throw new BlockedAddress('that address is not public');
}

export interface FetchedImage {
  bytes: Buffer;
  contentType: string;
}

export interface FetchOptions {
  maxBytes: number;
  timeoutMs: number;
  userAgent: string;
}

/** One hop: either the bytes, or where we are being sent next. */
function hop(target: URL, options: FetchOptions): Promise<FetchedImage | { redirect: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      target,
      {
        method: 'GET',
        lookup: pinnedLookup,
        headers: {
          accept: 'image/*',
          'user-agent': options.userAgent,
          // Some hosts serve a placeholder, or refuse outright, without one.
          referer: `${target.protocol}//${target.host}/`,
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;

        if (status >= 300 && status < 400 && res.headers.location) {
          res.destroy();
          return resolve({ redirect: new URL(res.headers.location, target).toString() });
        }
        if (status !== 200) {
          res.destroy();
          return reject(new NotAPicture(`the picture answered ${status}`));
        }

        const contentType = String(res.headers['content-type'] ?? '')
          .split(';')[0]!
          .trim();
        if (!contentType.startsWith('image/')) {
          res.destroy();
          return reject(new NotAPicture(`that is not a picture (${contentType || 'no type'})`));
        }
        // A length that is already too big saves us reading it to find out.
        if (Number(res.headers['content-length'] ?? 0) > options.maxBytes) {
          res.destroy();
          return reject(new TooBig('that picture is too big'));
        }

        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            res.destroy();
            return reject(new TooBig('that picture is too big'));
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ bytes: Buffer.concat(chunks), contentType }));
        res.on('error', reject);
      },
    );

    req.setTimeout(options.timeoutMs, () => req.destroy(new NotAPicture('the picture took too long')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch one picture, following a few redirects, refusing anything that is not a
 * public https image inside the cap.
 */
export async function fetchPicture(url: string, options: FetchOptions): Promise<FetchedImage> {
  let target = new URL(url);
  for (let redirects = 0; ; redirects++) {
    assertFetchable(target);
    const result = await hop(target, options);
    if (!('redirect' in result)) return result;
    if (redirects >= MAX_REDIRECTS) throw new NotAPicture('that picture redirects too many times');
    target = new URL(result.redirect);
  }
}
