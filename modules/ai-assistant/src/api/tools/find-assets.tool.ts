import { Inject, Injectable } from '@nestjs/common';
import {
  ASSETS_REPOSITORY,
  type IAssetsRepository,
} from '@securetrax/core';
import type { ToolHandler, ToolHandlerContext } from './types.js';

interface FindAssetsInput {
  category?: string;
  tag?: string;
  status?: 'online' | 'offline' | 'degraded' | 'unknown';
  limit?: number;
}

/**
 * Typed convenience tool — equivalent to `query_data` against the assets table
 * but with a tighter input shape so the model is more likely to use it for
 * common questions ("which trucks are online?", "all fixed cameras at site A").
 */
@Injectable()
export class FindAssetsTool implements ToolHandler {
  readonly definition = {
    name: 'find_assets',
    description:
      'List tracked assets matching simple filters. Returns id, name, category, status, lat, lon, lastSeenAt, tags. RLS-scoped to the caller — only assets in the caller\'s scope are returned.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: [
            'vehicle',
            'fixed-camera',
            'aircraft',
            'router',
            'intercom',
            'access-control',
            'sensor',
            'other',
          ],
        },
        tag: { type: 'string', description: 'Tag the asset must carry (e.g. `traccar`, `securevu`).' },
        status: { type: 'string', enum: ['online', 'offline', 'degraded', 'unknown'] },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
    },
    permission: 'ai.tools.find_assets',
  };

  constructor(
    @Inject(ASSETS_REPOSITORY) private readonly assets: IAssetsRepository,
  ) {}

  async execute(rawInput: unknown, _ctx: ToolHandlerContext): Promise<unknown> {
    const input = (rawInput ?? {}) as FindAssetsInput;
    const limit = Math.min(input.limit ?? 50, 200);
    const all = await this.assets.list();
    const matched = all
      .filter((a) => !input.category || a.category === input.category)
      .filter((a) => !input.tag || a.tags.includes(input.tag))
      .filter((a) => !input.status || a.status === input.status)
      .slice(0, limit)
      .map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        status: a.status,
        lat: a.lat ?? null,
        lon: a.lon ?? null,
        lastSeenAt: a.lastSeenAt ?? null,
        tags: a.tags,
      }));
    return { items: matched, total: matched.length };
  }
}
