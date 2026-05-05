import { describe, expect, it } from 'vitest';
import { evaluatePreflight, pointInPolygon } from './preflight.js';
import type { Asset } from '@securetrax/core';
import type { FlightPlan } from './types.js';

const aircraft: Asset = {
  id: 'DRONE-3',
  tenantId: 'default',
  siteId: null,
  groupId: null,
  name: 'Drone 3',
  category: 'aircraft',
  tags: [],
  cameraBindings: [],
  attrs: {},
  lat: 19.43,
  lon: -99.13,
  status: 'online',
  lastSeenAt: Date.now(),
};

const inWindow: Pick<FlightPlan, 'notBeforeMs' | 'notAfterMs'> = {
  notBeforeMs: Date.now() - 1000,
  notAfterMs: Date.now() + 60_000,
};

const plan: FlightPlan = {
  id: 'plan-1',
  tenantId: 'default',
  aircraftId: 'DRONE-3',
  name: 'p',
  authorId: 'alice',
  ...inWindow,
  waypoints: [{ seq: 0, lat: 19.43, lon: -99.13, alt: 50 }],
  hash: '',
  approvals: [],
  createdAtMs: 0,
  updatedAtMs: 0,
};

describe('evaluatePreflight', () => {
  it('all-green when conditions satisfied', () => {
    const checks = evaluatePreflight({
      plan,
      aircraft,
      batteryPercent: 90,
      gpsHdop: 1.0,
      armed: false,
      hasActiveMission: false,
    });
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it('flags low battery', () => {
    const checks = evaluatePreflight({
      plan,
      aircraft,
      batteryPercent: 10,
      gpsHdop: 1.0,
      armed: false,
    });
    expect(checks.find((c) => c.id === 'battery.threshold')?.ok).toBe(false);
  });

  it('flags HDOP > ceiling', () => {
    const checks = evaluatePreflight({
      plan,
      aircraft,
      batteryPercent: 90,
      gpsHdop: 5.0,
      armed: false,
    });
    expect(checks.find((c) => c.id === 'gps.fix')?.ok).toBe(false);
  });

  it('flags missing telemetry distinctly from threshold failures', () => {
    const checks = evaluatePreflight({ plan, aircraft });
    const battery = checks.find((c) => c.id === 'battery.threshold');
    const gps = checks.find((c) => c.id === 'gps.fix');
    expect(battery?.ok).toBe(false);
    expect(battery?.detail).toMatch(/no recent BATTERY/);
    expect(gps?.ok).toBe(false);
    expect(gps?.detail).toMatch(/no recent GPS_RAW/);
  });

  it('flags armed aircraft', () => {
    const checks = evaluatePreflight({
      plan,
      aircraft,
      batteryPercent: 90,
      gpsHdop: 1.0,
      armed: true,
    });
    expect(checks.find((c) => c.id === 'aircraft.disarmed')?.ok).toBe(false);
  });

  it('flags out-of-window plans', () => {
    const checks = evaluatePreflight({
      plan: { ...plan, notBeforeMs: Date.now() + 60_000, notAfterMs: Date.now() + 120_000 },
      aircraft,
      batteryPercent: 90,
      gpsHdop: 1.0,
      armed: false,
    });
    expect(checks.find((c) => c.id === 'window.valid')?.ok).toBe(false);
  });

  it('flags geofence-violating waypoints', () => {
    const fenced = {
      ...plan,
      waypoints: [
        { seq: 0, lat: 19.43, lon: -99.13, alt: 50 },
        { seq: 1, lat: 30.0, lon: -99.13, alt: 50 }, // way outside the geofence
      ],
      geofence: [
        [19.42, -99.14],
        [19.44, -99.14],
        [19.44, -99.12],
        [19.42, -99.12],
      ] as Array<[number, number]>,
    };
    const checks = evaluatePreflight({
      plan: fenced,
      aircraft,
      batteryPercent: 90,
      gpsHdop: 1.0,
      armed: false,
    });
    expect(
      checks.find((c) => c.id === 'geofence.contains_waypoints')?.ok,
    ).toBe(false);
  });
});

describe('pointInPolygon', () => {
  const square: Array<[number, number]> = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
  ];
  it('inside', () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
  });
  it('outside', () => {
    expect(pointInPolygon([15, 5], square)).toBe(false);
    expect(pointInPolygon([-1, 5], square)).toBe(false);
  });
});
