import { Module } from '@nestjs/common';
import { TelemetryMqttRuntime } from './runtime.service.js';
import { TelemetryController } from './telemetry.controller.js';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryMqttRuntime],
  exports: [TelemetryMqttRuntime],
})
export class TelemetryMqttModule {}
