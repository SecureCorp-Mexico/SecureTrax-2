import { Inject, Injectable } from '@nestjs/common';
import {
  SYSTEM_MQTT_ARCHIVER,
  type IMqttArchiver,
} from '@securetrax/core';
import type { ToolHandler, ToolHandlerContext } from './types.js';

interface MqttSearchInput {
  topicLike?: string;
  sinceMs?: number;
  untilMs?: number;
  limit?: number;
}

@Injectable()
export class MqttSearchTool implements ToolHandler {
  readonly definition = {
    name: 'mqtt_search',
    description:
      "Search the rolling MQTT archive. Use this to answer 'did topic X ever publish Y today?' style questions. `topicLike` is a SQL LIKE pattern — use `%` for wildcards (e.g. `securetrax/%/router/%/lte_rsrp`). Time range is epoch ms. RLS-scoped per tenant.",
    inputSchema: {
      type: 'object',
      properties: {
        topicLike: { type: 'string', description: 'SQL LIKE pattern; use `%` for wildcards.' },
        sinceMs: { type: 'integer' },
        untilMs: { type: 'integer' },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
      },
    },
    permission: 'ai.tools.mqtt_search',
  };

  constructor(
    @Inject(SYSTEM_MQTT_ARCHIVER) private readonly archive: IMqttArchiver,
  ) {}

  async execute(rawInput: unknown, ctx: ToolHandlerContext): Promise<unknown> {
    const input = (rawInput ?? {}) as MqttSearchInput;
    const items = await this.archive.search({
      tenantId: ctx.tenantId,
      topicLike: input.topicLike,
      sinceMs: input.sinceMs,
      untilMs: input.untilMs,
      limit: Math.min(input.limit ?? 50, 500),
    });
    return { items, count: items.length };
  }
}
