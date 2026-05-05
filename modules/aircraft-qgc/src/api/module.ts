import { Module } from '@nestjs/common';
import { AircraftController } from './aircraft.controller.js';
import { DeployService } from './deploy.service.js';
import { MavlinkRuntime } from './mavlink.runtime.js';
import { PlansService } from './plans.service.js';

@Module({
  controllers: [AircraftController],
  providers: [PlansService, DeployService, MavlinkRuntime],
  exports: [PlansService, DeployService],
})
export class AircraftQgcModule {}
