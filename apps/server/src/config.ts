/** Runtime configuration. Everything has a working default so `npm run dev` just runs. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',

  /**
   * Which forwarding proxies to believe about the caller's address.
   *
   * This decides what `req.ip` is, and `req.ip` is what the rate limiter on the
   * pairing and invite codes counts. Behind Caddy without it, every request
   * looks like it came from the proxy, so one child mistyping a code would
   * throttle everybody. Believing a forwarded header when nothing is actually
   * forwarding is the opposite mistake — a caller could then claim any address
   * they like and never be limited at all.
   *
   * So it is off unless the deployment says otherwise. `TRUST_PROXY=1` means
   * "a proxy on a private address", which is what docker-compose gives us:
   * Caddy on the internal network, and no other way in. Anything else is passed
   * through as a proxy-addr spec, so an operator can name exact subnets.
   */
  get trustProxy(): string | boolean {
    const setting = process.env.TRUST_PROXY;
    if (!setting || setting === '0' || setting === 'false') return false;
    return setting === '1' || setting === 'true' ? 'uniquelocal' : setting;
  },

  /**
   * Everything that must survive a container restart lives here.
   * Read lazily so a test can redirect storage after this module has loaded.
   */
  get dataDir(): string {
    return process.env.DATA_DIR ?? path.join(repoRoot, 'data');
  },

  /** Built frontend, served by the same process in production. */
  get webDist(): string {
    return process.env.WEB_DIST ?? path.join(repoRoot, 'apps', 'web', 'dist');
  },

  /** Photos are resized down to this before storage; big enough to zoom into. */
  maxImageDimension: 1400,
  /** A cover photo fills a whole page, so it needs more pixels than a sticker. */
  maxCoverDimension: 2400,
  jpegQuality: 84,
  thumbDimension: 320,

  /** A phone photo is comfortably under this. */
  maxUploadBytes: 20 * 1024 * 1024,

  /** Guard rails so one album cannot fill the disk. */
  maxPagesPerAlbum: 40,
  maxImagesPerAlbum: 500,

  /**
   * Pairing and invite codes are six characters because a child has to copy
   * them off a screen. That is only safe while they are short-lived, single-use
   * and attempt-capped, so these three numbers are load-bearing, not tuning.
   */
  codeTtlMs: 10 * 60 * 1000,
  maxCodeAttempts: 5,
  /** Claim attempts allowed from one address per minute, across all codes. */
  maxClaimsPerMinute: 20,
} as const;

export const imagesDir = () => path.join(config.dataDir, 'images');
export const dbPath = () => path.join(config.dataDir, 'album.sqlite');
