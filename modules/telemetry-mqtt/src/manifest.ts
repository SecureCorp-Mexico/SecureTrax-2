import { defineModule } from '@securetrax/module-contracts';

export const manifest = defineModule({
  id: 'telemetry-mqtt',
  name: 'MQTT telemetry',
  version: '0.1.0',
  category: 'core',
  description:
    'Mosquitto subscriber that mirrors every message into the mqtt_messages archive (powering the AI assistant\'s mqtt_search) and a per-tenant topic→canonical-event mapping engine that lets non-Traccar devices land on the map.',
  requires: [],
  mapLayers: [],
  api: {
    rest: '/v1/telemetry',
    ws: ['mqtt/+/+'],
    mqtt: ['securetrax/+/+/#'],
    webhooks: ['mqtt.archived', 'mapping.matched'],
    permissions: [
      'telemetry.mappings.read',
      'telemetry.mappings.write',
      'telemetry.archive.read',
      'mqtt.topics.subscribe',
    ],
  },
});
