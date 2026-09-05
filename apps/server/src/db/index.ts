/**
 * SQLite connection and migrations.
 *
 * One file on a mounted volume, no database server to pay for or operate.
 * Migrations are plain numbered .sql files applied at boot.
 */

import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config, dbPath } from '../config.ts';

export type Db = Database.Database;

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

let instance: Db | null = null;

export function getDb(): Db {
  if (instance) return instance;

  mkdirSync(config.dataDir, { recursive: true });
  const db = new Database(dbPath());

  // WAL lets a print job read while the editor keeps autosaving.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  migrate(db);
  instance = db;
  return db;
}

/** Apply any migration files this database has not seen yet, in filename order. */
export function migrate(db: Db): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r) => (r as { name: string }).name),
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    })();
    ran.push(file);
  }
  return ran;
}

/** Open an isolated in-memory database. Used by tests. */
export function createTestDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
