import { defineModule } from '@securetrax/module-contracts';

export const manifest = defineModule({
  id: 'videowall',
  name: 'Videowall',
  version: '0.1.0',
  category: 'core',
  description:
    'Multi-stream grid for cameras and any device that advertises a videowall-capable stream. Configurable layouts (1×1, 2×2, 3×3, 4×4, 1+5, 1+7, custom CSS-grid), tour rotation, kiosk route, multi-monitor sync. License-gated independently of video-securevu so customers can drop their existing VMS into the wall.',
  requires: [],
  mapLayers: [],
  api: {
    rest: '/v1/videowall',
    ws: ['videowall/+/sync'],
    mqtt: [],
    webhooks: ['videowall.layout.updated'],
    permissions: [
      'videowall.layouts.read',
      'videowall.layouts.write',
      'videowall.kiosk.view',
    ],
  },
});
