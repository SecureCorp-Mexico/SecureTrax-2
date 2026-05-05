import { Inject, Injectable } from '@nestjs/common';
import {
  POSITIONS_REPOSITORY,
  type IPositionsRepository,
} from '@securetrax/core';
import type { ToolHandler, ToolHandlerContext } from './types.js';

interface GetPositionHistoryInput {
  assetId: string;
  sinceMs?: number;
  limit?: number;
}

@Injectable()
export class GetPositionHistoryTool implements ToolHandler {
  readonly definition = {
    name: 'get_position_history',
    description:
      'Position history for a single asset, newest-first. Returns lat/lon/ts/speed/heading. RLS-scoped — passing an assetId outside the caller\'s tenant returns an empty list.',
    inputSchema: {
      type: 'object',
      required: ['assetId'],
      properties: {
        assetId: { type: 'string' },
        sinceMs: { type: 'integer', description: 'Epoch milliseconds — only positions after this.' },
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
      },
    },
    permission: 'ai.tools.get_position_history',
  };

  constructor(
    @Inject(POSITIONS_REPOSITORY) private readonly positions: IPositionsRepository,
  ) {}

  async execute(
    rawInput: unknown,
    _ctx: ToolHandlerContext,
  ): Promise<unknown> {
    const input = rawInput as GetPositionHistoryInput;
    if (!input?.assetId) throw new Error('assetId is required');
    const items = await this.positions.history(input.assetId, {
      limit: Math.min(input.limit ?? 100, 1000),
      sinceMs: input.sinceMs,
    });
    return { assetId: input.assetId, items, count: items.length };
  }
}
