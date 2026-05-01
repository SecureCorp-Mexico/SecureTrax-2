import { Inject, Injectable } from '@nestjs/common';
import {
  ASSETS_REPOSITORY,
  POSITIONS_REPOSITORY,
  SYSTEM_MQTT_ARCHIVER,
  type IAssetsRepository,
  type IMqttArchiver,
  type IPositionsRepository,
} from '@securetrax/core';
import type { ToolHandler, ToolHandlerContext } from './types.js';

type Domain = 'assets' | 'positions' | 'mqtt';

interface QueryDataInput {
  domain: Domain;
  filter?: Record<string, unknown>;
  sinceMs?: number;
  untilMs?: number;
  limit?: number;
}

/**
 * Generic structured-search tool — the "any data requested" surface from the
 * plan. Fans out to the canonical repositories per domain. The LLM never
 * writes SQL itself; the service owns all queries and enforces RBAC + RLS.
 */
@Injectable()
export class QueryDataTool implements ToolHandler {
  readonly definition = {
    name: 'query_data',
    description:
      'Generic structured search across the SecureTrax-2 data plane. `domain` selects which canonical store to search (assets / positions / mqtt). `filter` is a domain-specific JSON object. Always RLS-scoped to the caller; results are typed and citable.',
    inputSchema: {
      type: 'object',
      required: ['domain'],
      properties: {
        domain: {
          type: 'string',
          enum: ['assets', 'positions', 'mqtt'],
          description:
            "assets: list of devices/vehicles/cameras; positions: time-series GPS; mqtt: rolling MQTT message archive.",
        },
        filter: {
          type: 'object',
          description:
            "Domain-specific filter. assets: {category, tag, status, idLike}. positions: {assetId}. mqtt: {topicLike}.",
        },
        sinceMs: { type: 'integer' },
        untilMs: { type: 'integer' },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
      },
    },
    permission: 'ai.tools.query_data',
  };

  constructor(
    @Inject(ASSETS_REPOSITORY) private readonly assets: IAssetsRepository,
    @Inject(POSITIONS_REPOSITORY) private readonly positions: IPositionsRepository,
    @Inject(SYSTEM_MQTT_ARCHIVER) private readonly archive: IMqttArchiver,
  ) {}

  async execute(rawInput: unknown, ctx: ToolHandlerContext): Promise<unknown> {
    const input = rawInput as QueryDataInput;
    const limit = Math.min(input?.limit ?? 50, 500);
    switch (input?.domain) {
      case 'assets': {
        const all = await this.assets.list();
        const f = (input.filter ?? {}) as {
          category?: string;
          tag?: string;
          status?: string;
          idLike?: string;
        };
        const items = all
          .filter((a) => !f.category || a.category === f.category)
          .filter((a) => !f.tag || a.tags.includes(f.tag))
          .filter((a) => !f.status || a.status === f.status)
          .filter((a) => !f.idLike || a.id.includes(f.idLike))
          .slice(0, limit);
        return { domain: 'assets', items, count: items.length };
      }
      case 'positions': {
        const f = (input.filter ?? {}) as { assetId?: string };
        if (!f.assetId) throw new Error('positions query requires filter.assetId');
        const items = await this.positions.history(f.assetId, {
          limit,
          sinceMs: input.sinceMs,
        });
        return { domain: 'positions', assetId: f.assetId, items, count: items.length };
      }
      case 'mqtt': {
        const f = (input.filter ?? {}) as { topicLike?: string };
        const items = await this.archive.search({
          tenantId: ctx.tenantId,
          topicLike: f.topicLike,
          sinceMs: input.sinceMs,
          untilMs: input.untilMs,
          limit,
        });
        return { domain: 'mqtt', items, count: items.length };
      }
      default:
        throw new Error(`unsupported domain: ${String(input?.domain)}`);
    }
  }
}
