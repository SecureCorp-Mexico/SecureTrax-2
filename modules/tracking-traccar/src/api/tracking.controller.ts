import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  SetMetadata,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { TrackingService } from './tracking.service.js';
import { IngestPositionDto, UpsertAssetDto } from './dto.js';

const RequirePermissions = (...perms: string[]) =>
  SetMetadata('securetrax:permissions', perms);

@ApiTags('tracking')
@ApiBearerAuth()
@Controller('v1/tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Get('assets')
  @RequirePermissions('tracking.assets.read')
  @ApiOperation({ summary: 'List tracked assets (RLS-scoped to caller tenant).' })
  async listAssets() {
    return { items: await this.tracking.listAssets() };
  }

  @Put('assets/:id')
  @RequirePermissions('tracking.assets.write')
  @ApiOperation({ summary: 'Create or update an asset.' })
  async upsertAsset(@Param('id') id: string, @Body() body: UpsertAssetDto) {
    return await this.tracking.upsertAsset({
      id,
      name: body.name,
      category: body.category as never,
      siteId: body.siteId ?? null,
      groupId: body.groupId ?? null,
      tags: body.tags ?? [],
      cameraBindings: body.cameraBindings ?? [],
      attrs: {},
    });
  }

  @Get('positions/latest')
  @RequirePermissions('tracking.assets.read')
  @ApiOperation({ summary: 'Latest position per tracked asset.' })
  async latest() {
    return { items: await this.tracking.latestPositions() };
  }

  @Get('assets/:id/positions')
  @RequirePermissions('tracking.assets.read')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'since', required: false, type: Number, description: 'epoch ms' })
  @ApiOperation({ summary: 'Position history for an asset (newest first).' })
  async history(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    const items = await this.tracking.positionHistory(id, {
      limit: limit ? Number(limit) : undefined,
      sinceMs: since ? Number(since) : undefined,
    });
    return { items };
  }

  @Post('assets/:id/positions')
  @RequirePermissions('tracking.assets.write')
  @ApiOperation({
    summary:
      'Ingest a position for an asset. Traccar adapter, MQTT mapping engine, and the simulator all funnel through this same path.',
  })
  async ingest(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: IngestPositionDto,
  ) {
    if (!req.principal) throw new NotFoundException('not authenticated');
    return await this.tracking.ingestPosition({
      tenantId: req.principal.tenantId,
      assetId: id,
      ts: body.ts,
      lat: body.lat,
      lon: body.lon,
      alt: body.alt,
      speed: body.speed,
      heading: body.heading,
      attrs: {},
    });
  }
}
