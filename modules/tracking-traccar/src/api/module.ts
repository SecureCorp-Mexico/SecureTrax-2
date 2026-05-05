import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller.js';
import { TrackingService } from './tracking.service.js';
import { TraccarAdapter } from './traccar/adapter.js';

@Module({
  controllers: [TrackingController],
  providers: [TrackingService, TraccarAdapter],
  exports: [TrackingService, TraccarAdapter],
})
export class TrackingTraccarModule {}
