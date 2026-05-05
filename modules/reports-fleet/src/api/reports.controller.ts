import {
  Controller,
  Get,
  Inject,
  Query,
  Res,
  SetMetadata,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ASSETS_REPOSITORY,
  POSITIONS_REPOSITORY,
  type IAssetsRepository,
  type IPositionsRepository,
} from '@securetrax/core';
import {
  rowsToCsv,
  summarizePositions,
  type FleetReportRow,
} from './analytics.js';

const RequirePermissions = (...perms: string[]) =>
  SetMetadata('securetrax:permissions', perms);

@ApiTags('reports-fleet')
@ApiBearerAuth()
@Controller('v1/reports')
export class ReportsController {
  constructor(
    @Inject(ASSETS_REPOSITORY) private readonly assets: IAssetsRepository,
    @Inject(POSITIONS_REPOSITORY) private readonly positions: IPositionsRepository,
  ) {}

  @Get('fleet')
  @RequirePermissions('reports.fleet.run')
  @ApiOperation({
    summary:
      'Run a fleet report over the given time window. Returns per-asset trip count, distance, moving/idle time, and max speed.',
  })
  @ApiQuery({ name: 'sinceMs', required: false, type: Number, description: 'Default: 24h ago.' })
  @ApiQuery({ name: 'untilMs', required: false, type: Number })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Filter to one asset category.' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'] })
  async run(
    @Res() res: Response,
    @Query('sinceMs') sinceMsRaw?: string,
    @Query('untilMs') untilMsRaw?: string,
    @Query('category') category?: string,
    @Query('format') format: 'json' | 'csv' = 'json',
  ): Promise<void> {
    const now = Date.now();
    const sinceMs = sinceMsRaw ? Number(sinceMsRaw) : now - 24 * 3600 * 1000;
    const untilMs = untilMsRaw ? Number(untilMsRaw) : now;

    const allAssets = await this.assets.list();
    const target = allAssets.filter(
      (a) => !category || a.category === category,
    );

    const rows: FleetReportRow[] = [];
    for (const a of target) {
      const positions = await this.positions.history(a.id, {
        sinceMs,
        limit: 5000,
      });
      const inWindow = positions.filter(
        (p) => p.ts >= sinceMs && p.ts <= untilMs,
      );
      const { row } = summarizePositions(a.id, inWindow);
      rows.push(row);
    }

    if (format === 'csv') {
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader(
        'content-disposition',
        `attachment; filename="fleet-${new Date(sinceMs).toISOString().slice(0, 10)}.csv"`,
      );
      res.send(rowsToCsv(rows));
      return;
    }
    res.json({ sinceMs, untilMs, rows });
  }
}
