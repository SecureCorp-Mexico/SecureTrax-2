import { defineModule } from '@securetrax/module-contracts';

export const manifest = defineModule({
  id: 'tracking-traccar',
  name: 'Traccar tracking',
  version: '0.1.0',
  category: 'vehicle',
  description:
    'Live GPS tracking via Traccar. Normalizes positions into the canonical pipeline and exposes them on REST + WS + MQTT.',
  requires: [],
  mapLayers: ['vehicles-live'],
  api: {
    rest: '/v1/tracking',
    ws: ['assets/+/position'],
    mqtt: ['securetrax/+/+/position'],
    webhooks: ['asset.position', 'asset.geofence-entered', 'asset.geofence-exited'],
    permissions: ['tracking.assets.read', 'tracking.assets.write'],
  },
});
