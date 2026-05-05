import { defineModule } from '@securetrax/module-contracts';

export const manifest = defineModule({
  id: 'video-securevu',
  name: 'SecureVu video',
  version: '0.1.0',
  category: 'fixed',
  description:
    'SecureVu (Frigate fork) integration: MQTT event ingest + online/offline camera status + go2rtc WebRTC popup playback. Registers fixed cameras as assets with lat/lon, recolors markers from frigate/<cam>/available, and serves the stream URL clients use to mount a low-latency <video>.',
  requires: [],
  mapLayers: ['fixed-cameras'],
  api: {
    rest: '/v1/video',
    ws: ['cameras/+/status', 'cameras/+/event'],
    mqtt: ['frigate/+/available', 'frigate/events'],
    webhooks: ['camera.online', 'camera.offline', 'camera.event'],
    permissions: [
      'video.cameras.read',
      'video.cameras.write',
      'video.live.view',
      'video.export.create',
    ],
  },
});
