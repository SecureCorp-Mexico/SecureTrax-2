import { Global, Module } from '@nestjs/common';
import { MQTT_CLIENT } from '@securetrax/core';
import { MqttClientService } from './mqtt-client.service.js';

/**
 * Global MQTT infrastructure. The api owns one physical broker connection;
 * modules consume it via the IMqttClient abstraction (MQTT_CLIENT symbol).
 */
@Global()
@Module({
  providers: [
    MqttClientService,
    { provide: MQTT_CLIENT, useExisting: MqttClientService },
  ],
  exports: [MqttClientService, MQTT_CLIENT],
})
export class MqttModule {}
