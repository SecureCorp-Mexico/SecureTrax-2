import { Module } from '@nestjs/common';
import { MqttClientService } from './mqtt-client.service.js';
import { TelemetryMqttRuntime } from './runtime.service.js';
import { TelemetryController } from './telemetry.controller.js';

@Module({
  controllers: [TelemetryController],
  providers: [MqttClientService, TelemetryMqttRuntime],
  exports: [MqttClientService, TelemetryMqttRuntime],
})
export class TelemetryMqttModule {}
