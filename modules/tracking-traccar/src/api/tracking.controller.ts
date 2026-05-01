import { Controller, Get, SetMetadata } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TrackingService } from './tracking.service.js';

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
}
