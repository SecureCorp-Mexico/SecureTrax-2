import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { IPositionsRepository, Position } from '@securetrax/core';
import { TenantContextService } from './tenant-context.service.js';
import { positions } from './schema.js';

@Injectable()
export class PositionsRepository implements IPositionsRepository {
  constructor(private readonly ctx: TenantContextService) {}

  async insert(p: Position & { tenantId: string }): Promise<void> {
    await this.ctx.withDb(async (db) => {
      await db
        .insert(positions)
        .values({
          tenantId: p.tenantId,
          assetId: p.assetId,
          ts: new Date(p.ts),
          lat: p.lat,
          lon: p.lon,
          alt: p.alt ?? null,
          speed: p.speed ?? null,
          heading: p.heading ?? null,
          attrs: p.attrs ?? {},
        })
        .onConflictDoNothing();
    });
  }

  async latestPerAsset(): Promise<Position[]> {
    return this.ctx.withDb(async (db) => {
      // DISTINCT ON (asset_id) ... ORDER BY asset_id, ts DESC — Postgres idiom
      // for "latest row per group". With (asset_id, ts) PK + tenant_id index
      // this is fast and RLS-filtered.
      const rows = await db.execute<{
        asset_id: string;
        ts: Date;
        lat: number;
        lon: number;
        alt: number | null;
        speed: number | null;
        heading: number | null;
        attrs: Record<string, unknown>;
      }>(sql`
        SELECT DISTINCT ON (asset_id)
          asset_id, ts, lat, lon, alt, speed, heading, attrs
        FROM ${positions}
        ORDER BY asset_id, ts DESC
      `);
      return rows.rows.map(rowToPosition);
    });
  }

  async history(
    assetId: string,
    opts?: { limit?: number; sinceMs?: number },
  ): Promise<Position[]> {
    const limit = Math.min(opts?.limit ?? 500, 5000);
    return this.ctx.withDb(async (db) => {
      const conds = [eq(positions.assetId, assetId)];
      if (opts?.sinceMs) conds.push(gte(positions.ts, new Date(opts.sinceMs)));
      const rows = await db
        .select()
        .from(positions)
        .where(and(...conds))
        .orderBy(desc(positions.ts))
        .limit(limit);
      return rows.map((r) => ({
        assetId: r.assetId,
        ts: r.ts.getTime(),
        lat: r.lat,
        lon: r.lon,
        alt: r.alt ?? undefined,
        speed: r.speed ?? undefined,
        heading: r.heading ?? undefined,
        attrs: r.attrs,
      }));
    });
  }
}

function rowToPosition(r: {
  asset_id: string;
  ts: Date;
  lat: number;
  lon: number;
  alt: number | null;
  speed: number | null;
  heading: number | null;
  attrs: Record<string, unknown>;
}): Position {
  return {
    assetId: r.asset_id,
    ts: r.ts.getTime(),
    lat: r.lat,
    lon: r.lon,
    alt: r.alt ?? undefined,
    speed: r.speed ?? undefined,
    heading: r.heading ?? undefined,
    attrs: r.attrs,
  };
}
