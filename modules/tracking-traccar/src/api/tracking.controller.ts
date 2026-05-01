import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TrackingService } from './tracking.service.js';

@ApiTags('tracking')
@Controller('v1/tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Get('assets')
  @ApiOperation({ summary: 'List tracked assets' })
  listAssets() {
    return { items: this.tracking.listAssets() };
  }
}
