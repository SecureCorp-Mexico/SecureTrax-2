import { describe, expect, it } from 'vitest';
import { assetIdForTraccar, normalizeTraccarPosition } from './types.js';

describe('normalizeTraccarPosition', () => {
  it('converts knots → km/h and parses fixTime', () => {
    const out = normalizeTraccarPosition('asset-1', {
      id: 99,
      deviceId: 7,
      latitude: 19.4326,
      longitude: -99.1332,
      altitude: 2240,
      speed: 10, // knots
      course: 90,
      fixTime: '2026-01-15T12:00:00.000Z',
      protocol: 'osmand',
    });
    expect(out.assetId).toBe('asset-1');
    expect(out.lat).toBe(19.4326);
    expect(out.lon).toBe(-99.1332);
    expect(out.alt).toBe(2240);
    expect(out.heading).toBe(90);
    expect(out.speed).toBe(18.52); // 10 * 1.852
    expect(out.ts).toBe(Date.parse('2026-01-15T12:00:00.000Z'));
    expect(out.attrs.traccarPositionId).toBe(99);
    expect(out.attrs.traccarDeviceId).toBe(7);
    expect(out.attrs.protocol).toBe('osmand');
  });

  it('falls back to deviceTime → serverTime → now()', () => {
    const fallback = normalizeTraccarPosition('asset-1', {
      id: 1,
      deviceId: 1,
      latitude: 0,
      longitude: 0,
      deviceTime: '2026-01-01T00:00:00Z',
    });
    expect(fallback.ts).toBe(Date.parse('2026-01-01T00:00:00Z'));

    const noTimes = normalizeTraccarPosition('asset-1', {
      id: 1,
      deviceId: 1,
      latitude: 0,
      longitude: 0,
    });
    expect(noTimes.ts).toBeGreaterThan(Date.now() - 5000);
  });

  it('preserves Traccar custom attributes alongside our metadata', () => {
    const out = normalizeTraccarPosition('asset-x', {
      id: 1,
      deviceId: 1,
      latitude: 0,
      longitude: 0,
      attributes: { batteryLevel: 87, ignition: true },
    });
    expect(out.attrs.batteryLevel).toBe(87);
    expect(out.attrs.ignition).toBe(true);
    // Our own keys still present
    expect(out.attrs.traccarPositionId).toBe(1);
  });

  it('omits optional fields cleanly when missing', () => {
    const out = normalizeTraccarPosition('asset-x', {
      id: 1,
      deviceId: 1,
      latitude: 0,
      longitude: 0,
    });
    expect(out.alt).toBeUndefined();
    expect(out.speed).toBeUndefined();
    expect(out.heading).toBeUndefined();
  });
});

describe('assetIdForTraccar', () => {
  it('produces deterministic, prefixed ids', () => {
    expect(assetIdForTraccar('IMEI-123456')).toBe('traccar:IMEI-123456');
  });
});
