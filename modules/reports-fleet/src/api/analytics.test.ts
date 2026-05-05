import { describe, expect, it } from 'vitest';
import { haversineKm, rowsToCsv, summarizePositions } from './analytics.js';

describe('haversineKm', () => {
  it('returns ~0 for identical points', () => {
    expect(haversineKm(19.43, -99.13, 19.43, -99.13)).toBeCloseTo(0, 4);
  });
  it('matches the expected distance Mexico City → New York (~3360km)', () => {
    const km = haversineKm(19.4326, -99.1332, 40.7128, -74.006);
    expect(km).toBeGreaterThan(3300);
    expect(km).toBeLessThan(3400);
  });
});

describe('summarizePositions', () => {
  const baseTs = 1_700_000_000_000;

  it('returns zeros for empty input', () => {
    const { row, trips } = summarizePositions('asset-1', []);
    expect(row.trips).toBe(0);
    expect(row.distanceKm).toBe(0);
    expect(trips).toEqual([]);
  });

  it('detects a single trip from a moving stream', () => {
    const positions = Array.from({ length: 5 }, (_, i) => ({
      assetId: 'asset-1',
      ts: baseTs + i * 60_000,
      lat: 19.43 + i * 0.01,
      lon: -99.13,
      speed: 30,
      heading: 0,
      attrs: {},
    }));
    const { row, trips } = summarizePositions('asset-1', positions);
    expect(trips.length).toBe(1);
    expect(row.trips).toBe(1);
    expect(row.maxSpeedKmh).toBe(30);
    expect(row.distanceKm).toBeGreaterThan(0);
  });

  it('splits two trips separated by ≥5 minutes idle', () => {
    const a = Array.from({ length: 4 }, (_, i) => ({
      assetId: 'asset-1',
      ts: baseTs + i * 30_000,
      lat: 19.43 + i * 0.005,
      lon: -99.13,
      speed: 30,
      heading: 0,
      attrs: {},
    }));
    // long idle (10 min) at near-zero speed
    const idle = [
      {
        assetId: 'asset-1',
        ts: baseTs + 4 * 30_000 + 600_000,
        lat: 19.45,
        lon: -99.13,
        speed: 0,
        heading: 0,
        attrs: {},
      },
    ];
    // second trip
    const b = Array.from({ length: 3 }, (_, i) => ({
      assetId: 'asset-1',
      ts: baseTs + 4 * 30_000 + 600_000 + 60_000 + i * 30_000,
      lat: 19.45 + i * 0.005,
      lon: -99.13,
      speed: 25,
      heading: 0,
      attrs: {},
    }));
    const { trips } = summarizePositions('asset-1', [...a, ...idle, ...b]);
    expect(trips.length).toBe(2);
  });

  it('classifies idle vs moving time correctly', () => {
    const positions = [
      { assetId: 'a', ts: baseTs, lat: 0, lon: 0, speed: 0, attrs: {} },
      { assetId: 'a', ts: baseTs + 60_000, lat: 0, lon: 0, speed: 0, attrs: {} },
      { assetId: 'a', ts: baseTs + 120_000, lat: 0.01, lon: 0, speed: 30, attrs: {} },
    ];
    const { row } = summarizePositions('a', positions);
    expect(row.idleMs).toBeGreaterThan(0);
    expect(row.movingMs).toBeGreaterThan(0);
  });

  it('sorts unsorted input by ts before computing', () => {
    const out = summarizePositions('a', [
      { assetId: 'a', ts: baseTs + 60_000, lat: 0.01, lon: 0, speed: 30, attrs: {} },
      { assetId: 'a', ts: baseTs, lat: 0, lon: 0, speed: 30, attrs: {} },
    ]);
    expect(out.trips.length).toBe(1);
    expect(out.trips[0]!.startMs).toBe(baseTs);
  });
});

describe('rowsToCsv', () => {
  it('produces RFC 4180 lines with CRLF', () => {
    const csv = rowsToCsv([
      {
        assetId: 'TRUCK-1',
        trips: 2,
        distanceKm: 12.34,
        movingMs: 1000,
        idleMs: 500,
        maxSpeedKmh: 60,
        positionCount: 50,
      },
    ]);
    expect(csv).toContain('assetId,trips,distanceKm,movingMs,idleMs,maxSpeedKmh,positionCount\r\n');
    expect(csv).toContain('TRUCK-1,2,12.34,1000,500,60,50\r\n');
  });

  it('escapes commas and quotes', () => {
    const csv = rowsToCsv([
      {
        assetId: 'A,B',
        trips: 1,
        distanceKm: 1,
        movingMs: 1,
        idleMs: 1,
        maxSpeedKmh: 1,
        positionCount: 1,
      },
    ]);
    expect(csv).toContain('"A,B"');
  });
});
