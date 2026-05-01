/**
 * SQL migration runner — applies every `drizzle/*.sql` file in lexical order
 * inside a transaction with `app.bypass_rls = on`. We use a hand-rolled
 * runner instead of `drizzle-orm/node-postgres/migrator` because our 0000
 * migration is hand-authored (hypertables, RLS, plpgsql).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = resolve(here, '..', '..', 'drizzle');
  if (!existsSync(dir)) {
    console.error(`migration dir not found: ${dir}`);
    process.exit(1);
  }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    console.log('no migrations found');
    return;
  }

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://securetrax:securetrax@localhost:5432/securetrax',
  });
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    for (const file of files) {
      const { rows } = await client.query(
        'SELECT name FROM schema_migrations WHERE name = $1',
        [file],
      );
      if (rows.length > 0) {
        console.log(`✓ already applied: ${file}`);
        continue;
      }
      const sql = readFileSync(join(dir, file), 'utf8');
      console.log(`→ applying: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL "app.bypass_rls" = 'on'`);
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✓ applied: ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('migration failed:', err);
  process.exit(1);
});
