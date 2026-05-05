import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

/**
 * Owns the PG pool and the Drizzle handle. Per-request scoping is done via
 * `withTenant` / `withSystem` which lease a client, set the session-local
 * `app.tenant_id` (or `app.bypass_rls`) inside a transaction, and run the
 * caller's work. RLS does the rest at layer 3.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DbService.name);
  private pool!: Pool;
  private _db!: Db;

  onModuleInit(): void {
    const connectionString =
      process.env.DATABASE_URL ??
      'postgres://securetrax:securetrax@localhost:5432/securetrax';
    this.pool = new Pool({ connectionString });
    this._db = drizzle(this.pool, { schema });
    this.log.log(`db pool initialized for ${redact(connectionString)}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  /** Convenience for boot-time work that runs without RLS scoping yet. */
  raw(): Db {
    return this._db;
  }

  /**
   * Run `fn` inside a transaction with `app.tenant_id` set to `tenantId`.
   * Every read/write inside the callback is filtered by RLS to that tenant.
   */
  async withTenant<T>(tenantId: string, fn: (db: Db) => Promise<T>): Promise<T> {
    return await this.runWithSettings({ 'app.tenant_id': tenantId }, fn);
  }

  /**
   * Run `fn` with RLS bypassed — only used by migrations and tenant bootstrap.
   * Every callsite in product code MUST go through `withTenant`.
   */
  async withSystem<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    return await this.runWithSettings({ 'app.bypass_rls': 'on' }, fn);
  }

  private async runWithSettings<T>(
    settings: Record<string, string>,
    fn: (db: Db) => Promise<T>,
  ): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(settings)) {
        await client.query(`SET LOCAL "${key}" = $1`, [value]);
      }
      const txDb = drizzle(client, { schema });
      const result = await fn(txDb);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

function redact(url: string): string {
  return url.replace(/:[^:@/]*@/, ':***@');
}
