import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  ASSETS_REPOSITORY,
  type Asset,
  type IAssetsRepository,
} from '@securetrax/core';
import { UpsertCameraDto } from './dto.js';

const RequirePermissions = (...perms: string[]) =>
  SetMetadata('securetrax:permissions', perms);

const FRIGATE_URL = process.env.FRIGATE_URL ?? 'http://securevu:5000';
const GO2RTC_HTTP_URL = process.env.GO2RTC_URL ?? 'http://localhost:1984';
const GO2RTC_WS_URL =
  process.env.GO2RTC_WS_URL ?? GO2RTC_HTTP_URL.replace(/^http/, 'ws');

interface CameraView {
  id: string;
  name: string;
  frigateName: string;
  streamId: string;
  lat: number | null;
  lon: number | null;
  status: string;
  lastSeenAt: number | null;
  /** Browser-friendly URLs for the popup player (set by the controller). */
  webrtcUrl: string;
  hlsUrl: string;
  snapshotUrl: string;
}

@ApiTags('video-securevu')
@ApiBearerAuth()
@Controller('v1/video')
export class SecureVuController {
  constructor(
    @Inject(ASSETS_REPOSITORY) private readonly assets: IAssetsRepository,
  ) {}

  @Get('cameras')
  @RequirePermissions('video.cameras.read')
  @ApiOperation({ summary: 'List fixed cameras (RLS-scoped to caller tenant).' })
  async list() {
    const all = await this.assets.list();
    const cams = all.filter((a) => a.category === 'fixed-camera');
    return { items: cams.map(toCameraView) };
  }

  @Put('cameras/:id')
  @RequirePermissions('video.cameras.write')
  @ApiOperation({
    summary: 'Register or update a fixed camera (location + Frigate binding).',
  })
  async upsert(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpsertCameraDto,
  ) {
    const tenantId = req.principal?.tenantId;
    if (!tenantId) throw new UnauthorizedException();
    const streamId = body.streamId ?? body.frigateName;
    const asset: Omit<Asset, 'tenantId'> = {
      id,
      siteId: body.siteId ?? null,
      groupId: null,
      name: body.name,
      category: 'fixed-camera',
      tags: ['securevu'],
      cameraBindings: [streamId],
      attrs: { frigateName: body.frigateName, streamId },
      lat: body.lat,
      lon: body.lon,
      status: 'unknown',
    };
    await this.assets.upsert(asset);
    const stored = await this.assets.get(id);
    if (!stored) throw new Error('camera upsert returned no row');
    return toCameraView(stored);
  }

  @Get('cameras/:id/snapshot')
  @RequirePermissions('video.live.view')
  @ApiOperation({
    summary:
      'Reverse-proxy the latest snapshot from Frigate, with auth + RLS enforced.',
  })
  async snapshot(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const cam = await this.assets.get(id);
    if (!cam || cam.category !== 'fixed-camera') {
      res.status(404).json({ error: 'camera not found' });
      return;
    }
    const frigateName = (cam.attrs?.frigateName as string) ?? id;
    const url = `${FRIGATE_URL}/api/${encodeURIComponent(frigateName)}/latest.jpg`;
    try {
      const upstream = await fetch(url);
      if (!upstream.ok || !upstream.body) {
        res.status(502).json({ error: `frigate snapshot failed: ${upstream.status}` });
        return;
      }
      res.setHeader('content-type', 'image/jpeg');
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }
}

function toCameraView(a: Asset): CameraView {
  const streamId =
    (a.attrs?.streamId as string) ?? (a.attrs?.frigateName as string) ?? a.id;
  return {
    id: a.id,
    name: a.name,
    frigateName: (a.attrs?.frigateName as string) ?? a.id,
    streamId,
    lat: a.lat ?? null,
    lon: a.lon ?? null,
    status: a.status ?? 'unknown',
    lastSeenAt: a.lastSeenAt ?? null,
    webrtcUrl: `${GO2RTC_WS_URL}/api/ws?src=${encodeURIComponent(streamId)}`,
    hlsUrl: `${GO2RTC_HTTP_URL}/api/stream.m3u8?src=${encodeURIComponent(streamId)}`,
    snapshotUrl: `/api/v1/video/cameras/${encodeURIComponent(a.id)}/snapshot`,
  };
}
