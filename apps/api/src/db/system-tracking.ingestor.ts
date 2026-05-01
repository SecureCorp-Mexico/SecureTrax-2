import { Inject, Injectable, Optional } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import {
  BROADCASTER,
  type Asset,
  type AssetCategory,
  type IBroadcaster,
  type Position,
} from '@securetrax/core';
import { SystemContextService } from './system-context.service.js';
import { assets, positions } from './schema.js';

/**
 * Background-context tracking ingestor. Same pipeline shape as
 * TrackingService (persist + broadcast) but takes tenantId explicitly so it
 * can be called from a long-running connection (e.g. the Traccar WS adapter)
 * that has no HTTP request to derive the principal from.
 */
@Injectable()
export class SystemTrackingIngestor {
  constructor(
    private readonly sys: SystemContextService,
    @Optional() @Inject(BROADCASTER) private readonly broadcaster?: IBroadcaster,
  ) {}

  async upsertAsset(
    tenantId: string,
    input: Omit<Asset, 'tenantId'>,
  ): Promise<void> {
    await this.sys.withTenant(tenantId, async (db) => {
      const values = {
        id: input.id,
        tenantId,
        siteId: input.siteId ?? null,
        groupId: input.groupId ?? null,
        name: input.name,
        category: input.category as AssetCategory,
        tags: input.tags,
        cameraBindings: input.cameraBindings,
        attrs: input.attrs,
      };
      await db
        .insert(assets)
        .values(values)
        .onConflictDoUpdate({
          target: assets.id,
          set: {
            siteId: values.siteId,
            groupId: values.groupId,
            name: values.name,
            category: values.category,
            tags: values.tags,
            cameraBindings: values.cameraBindings,
            attrs: values.attrs,
            updatedAt: new Date(),
          },
        });
    });
  }

  /** Look up asset id by an `attrs.<key>` jsonb match. */
  async findAssetByAttr(
    tenantId: string,
    key: string,
    value: string | number,
  ): Promise<string | undefined> {
    return this.sys.withTenant(tenantId, async (db) => {
      const target = String(value);
      const result = await db.execute<{ id: string }>(sql`
        SELECT id FROM ${assets}
        WHERE attrs @> jsonb_build_object(${key}::text, ${target}::text)
        LIMIT 1
      `);
      return result.rows[0]?.id;
    });
  }

  async ingestPosition(
    tenantId: string,
    p: Position,
  ): Promise<void> {
    await this.sys.withTenant(tenantId, async (db) => {
      await db
        .insert(positions)
        .values({
          tenantId,
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
    this.broadcaster?.broadcast(`assets/${p.assetId}/position`, {
      ...p,
      tenantId,
    });
  }
}
