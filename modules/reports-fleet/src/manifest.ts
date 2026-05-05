import { defineModule } from '@securetrax/module-contracts';

export const manifest = defineModule({
  id: 'reports-fleet',
  name: 'Fleet reports',
  version: '0.1.0',
  category: 'core',
  description:
    'Fleet management reports: trips, distance, moving/idle time, max speed. Computes per-asset summaries from the positions hypertable. CSV/JSON output via REST.',
  requires: [],
  mapLayers: [],
  api: {
    rest: '/v1/reports',
    ws: [],
    mqtt: [],
    webhooks: ['report.ready'],
    permissions: [
      'reports.fleet.read',
      'reports.fleet.run',
    ],
  },
});
