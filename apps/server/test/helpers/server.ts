/**
 * A running app, on a real port.
 *
 * The tests that use this are the ones that refuse to stub a neighbour: they
 * upload real bytes over real multipart, read the album back over HTTP, open a
 * real socket and build a real PDF. That needs the same three lines of setup
 * every time — a data directory of its own, an app, a listening port — so they
 * live here rather than at the top of every journey.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../src/app.ts';
import type { Db } from '../../src/db/index.ts';
import { createTestDb } from '../../src/db/index.ts';

export interface TestServerOptions {
  /** Defaults to a fresh in-memory database, which is what most tests want. */
  db?: Db;
  /** Photos, and a file-backed database, live here. A fresh one by default. */
  dataDir?: string;
  serveWeb?: boolean;
  /** Keep the directory on stop — a restart test opens the same one again. */
  keepDataDir?: boolean;
}

export interface TestServer {
  app: FastifyInstance;
  /** `http://127.0.0.1:<port>` */
  base: string;
  /** The same port, spelled the way a socket needs it. */
  wsBase: string;
  dataDir: string;
  stop(): Promise<void>;
}

export async function startServer(options: TestServerOptions = {}): Promise<TestServer> {
  const dataDir = options.dataDir ?? (await mkdtemp(path.join(tmpdir(), 'nalepko-test-')));
  // `config` reads this lazily, so setting it before the app is built is enough.
  process.env.DATA_DIR = dataDir;

  const app = await createApp({ db: options.db ?? createTestDb(), serveWeb: options.serveWeb ?? false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;

  return {
    app,
    dataDir,
    base: `http://127.0.0.1:${port}`,
    wsBase: `ws://127.0.0.1:${port}`,
    async stop() {
      await app.close();
      if (options.keepDataDir) return;
      await rm(dataDir, { recursive: true, force: true });
      delete process.env.DATA_DIR;
    },
  };
}
