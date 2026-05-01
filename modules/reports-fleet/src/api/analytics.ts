import type { Position } from '@securetrax/core';

const KMH_MOVING_THRESHOLD = 5;
const TRIP_GAP_MS = 5 * 60 * 1000; // 5 minutes of stillness ends a trip
const EARTH_R_KM = 6371;

export interface TripSummary {
  startMs: number;
  endMs: number;
  durationMs: number;
  distanceKm: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  positionCount: number;
}

export interface FleetReportRow {
  assetId: string;
  trips: number;
  distanceKm: number;
  movingMs: number;
  idleMs: number;
  maxSpeedKmh: number;
  positionCount: number;
}

/**
 * Greater-circle distance in kilometers (Haversine). Order of magnitude
 * matters more than precision here — these reports are summaries, not
 * navigation. Fast enough to call once per consecutive position pair.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Extract trips from a chronological position stream. A trip starts when the
 * asset moves above 5 km/h and ends when it sits below that threshold for
 * more than 5 minutes. Distance is summed pairwise; idle time is the gap
 * between trips and at the head/tail of the window.
 *
 * Pure function — no I/O — so it round-trips cleanly in tests and can be
 * called from the AI assistant's `summarize_geofence_activity`-style tools
 * later.
 */
export function summarizePositions(
  assetId: string,
  positions: Position[],
): { row: FleetReportRow; trips: TripSummary[] } {
  if (positions.length === 0) {
    return {
      row: {
        assetId,
        trips: 0,
        distanceKm: 0,
        movingMs: 0,
        idleMs: 0,
        maxSpeedKmh: 0,
        positionCount: 0,
      },
      trips: [],
    };
  }

  const sorted = [...positions].sort((a, b) => a.ts - b.ts);
  const trips: TripSummary[] = [];
  let current: TripSummary | undefined;
  let totalDist = 0;
  let movingMs = 0;
  let idleMs = 0;
  let maxSpeedKmh = 0;

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    const speed = p.speed ?? 0;
    if (speed > maxSpeedKmh) maxSpeedKmh = speed;

    if (i > 0) {
      const prev = sorted[i - 1]!;
      const dt = p.ts - prev.ts;
      const dKm = haversineKm(prev.lat, prev.lon, p.lat, p.lon);
      totalDist += dKm;
      const wasMoving = (prev.speed ?? 0) > KMH_MOVING_THRESHOLD || speed > KMH_MOVING_THRESHOLD;
      if (wasMoving) movingMs += dt;
      else idleMs += dt;
    }

    if (speed > KMH_MOVING_THRESHOLD) {
      if (!current) {
        current = {
          startMs: p.ts,
          endMs: p.ts,
          durationMs: 0,
          distanceKm: 0,
          maxSpeedKmh: speed,
          avgSpeedKmh: speed,
          startLat: p.lat,
          startLon: p.lon,
          endLat: p.lat,
          endLon: p.lon,
          positionCount: 1,
        };
      } else {
        const last = sorted[i - 1]!;
        current.distanceKm += haversineKm(last.lat, last.lon, p.lat, p.lon);
        current.maxSpeedKmh = Math.max(current.maxSpeedKmh, speed);
        current.endMs = p.ts;
        current.endLat = p.lat;
        current.endLon = p.lon;
        current.durationMs = current.endMs - current.startMs;
        current.avgSpeedKmh =
          current.durationMs > 0
            ? (current.distanceKm / (current.durationMs / 3_600_000))
            : speed;
        current.positionCount += 1;
      }
    } else if (current && i > 0) {
      const dt = p.ts - current.endMs;
      if (dt >= TRIP_GAP_MS) {
        trips.push(current);
        current = undefined;
      }
    }
  }
  if (current) trips.push(current);

  return {
    row: {
      assetId,
      trips: trips.length,
      distanceKm: round2(totalDist),
      movingMs,
      idleMs,
      maxSpeedKmh: round2(maxSpeedKmh),
      positionCount: sorted.length,
    },
    trips,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Render a list of FleetReportRow as RFC 4180 CSV. */
export function rowsToCsv(rows: FleetReportRow[]): string {
  const header = [
    'assetId',
    'trips',
    'distanceKm',
    'movingMs',
    'idleMs',
    'maxSpeedKmh',
    'positionCount',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.assetId),
        r.trips,
        r.distanceKm,
        r.movingMs,
        r.idleMs,
        r.maxSpeedKmh,
        r.positionCount,
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
