import { defineModule } from '@securetrax/module-contracts';

export const manifest = defineModule({
  id: 'aircraft-qgc',
  name: 'Aircraft / QGroundControl',
  version: '0.1.0',
  category: 'aircraft',
  description:
    'Cube Orange / ArduPilot integration via MAVLink-over-MQTT. Ingests every flight datum into typed canonical events; ships a flight-plan editor + N-of-M Ed25519 approval workflow + signed RemoteMissionDeploy with pre-flight checks. Compatible with QGroundControl on the ground (the onboard sidecar multiplexes MAVLink so QGC keeps working).',
  requires: [],
  mapLayers: ['aircraft', 'flight-plans'],
  api: {
    rest: '/v1/aircraft',
    ws: ['aircraft/+/mavlink/+', 'aircraft/+/status', 'flights/+/commands'],
    mqtt: ['securetrax/+/+/mavlink/#'],
    webhooks: [
      'flight.plan.authored',
      'flight.plan.approved',
      'flight.deployed',
      'flight.aborted',
    ],
    permissions: [
      'aircraft.plans.read',
      'aircraft.plans.author',
      'aircraft.plans.approve',
      'aircraft.deploy.execute',
      'aircraft.abort',
    ],
  },
});
