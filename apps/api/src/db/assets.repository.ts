import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Asset, AssetCategory, IAssetsRepository } from '@securetrax/core';
import { TenantContextService } from './tenant-context.service.js';
import { assets } from './schema.js';

/**
 * Drizzle-backed implementation of `IAssetsRepository`. Uses the
 * request-scoped TenantContextService so every query runs under RLS — even if
 * a caller forgets to filter by tenant the policy will return zero rows.
 */
@Injectable()
export class AssetsRepository implements IAssetsRepository {
  constructor(private readonly ctx: TenantContextService) {}

  async list(): Promise<Asset[]> {
    return this.ctx.withDb(async (db) => {
      const rows = await db.select().from(assets);
      return rows.map(toAsset);
    });
  }

  async get(id: string): Promise<Asset | undefined> {
    return this.ctx.withDb(async (db) => {
      const rows = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
      const r = rows[0];
      return r ? toAsset(r) : undefined;
    });
  }

  async upsert(input: Omit<Asset, 'tenantId'>): Promise<Asset> {
    const tenantId = this.ctx.tenantId();
    return this.ctx.withDb(async (db) => {
      const values = {
        id: input.id,
        tenantId,
        siteId: input.siteId ?? null,
        groupId: input.groupId ?? null,
        name: input.name,
        category: input.category,
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
      const out = await this.get(input.id);
      if (!out) throw new Error(`upsert returned no row for ${input.id}`);
      return out;
    });
  }
}

function toAsset(r: typeof assets.$inferSelect): Asset {
  return {
    id: r.id,
    tenantId: r.tenantId,
    siteId: r.siteId ?? null,
    groupId: r.groupId ?? null,
    name: r.name,
    category: r.category as AssetCategory,
    tags: r.tags,
    cameraBindings: r.cameraBindings,
    attrs: r.attrs,
  };
}
