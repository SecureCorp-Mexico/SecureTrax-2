import type { Asset } from '@securetrax/core';
import type {
  FlightPlan,
  FlightWaypoint,
  PreflightResult,
} from './types.js';

interface PreflightInput {
  plan: FlightPlan;
  /** Latest cached state for the target aircraft (or null if unknown). */
  aircraft?: Asset;
  /** Latest battery percent (0-100) if telemetry has it. */
  batteryPercent?: number;
  /** Latest GPS HDOP (lower is better, 1.0 = excellent). */
  gpsHdop?: number;
  /** Whether the aircraft is currently armed. */
  armed?: boolean;
  /** Conflicting mission already onboard? */
  hasActiveMission?: boolean;
  /** Battery threshold under which the gate fails. */
  batteryFloor?: number;
  /** Max acceptable HDOP. */
  hdopCeiling?: number;
}

/**
 * Pure pre-flight gate: collect every check (so the operator UI shows the
 * full picture, not just the first failure) and aggregate to ok = all-ok.
 */
export function evaluatePreflight(input: PreflightInput): PreflightResult[] {
  const checks: PreflightResult[] = [];
  const batteryFloor = input.batteryFloor ?? 30;
  const hdopCeiling = input.hdopCeiling ?? 2.0;

  checks.push({
    id: 'aircraft.online',
    ok: input.aircraft?.status === 'online',
    detail: input.aircraft ? `status=${input.aircraft.status}` : 'no aircraft state',
  });

  checks.push({
    id: 'aircraft.disarmed',
    ok: input.armed === false || input.armed === undefined,
    detail: input.armed === true ? 'aircraft is armed' : undefined,
  });

  checks.push({
    id: 'gps.fix',
    ok: input.gpsHdop !== undefined && input.gpsHdop <= hdopCeiling,
    detail:
      input.gpsHdop === undefined
        ? 'no recent GPS_RAW telemetry'
        : `HDOP=${input.gpsHdop} (ceiling ${hdopCeiling})`,
  });

  checks.push({
    id: 'battery.threshold',
    ok: input.batteryPercent !== undefined && input.batteryPercent >= batteryFloor,
    detail:
      input.batteryPercent === undefined
        ? 'no recent BATTERY_STATUS telemetry'
        : `${input.batteryPercent}% (floor ${batteryFloor}%)`,
  });

  const now = Date.now();
  const inWindow =
    now >= input.plan.notBeforeMs && now <= input.plan.notAfterMs;
  checks.push({
    id: 'window.valid',
    ok: inWindow,
    detail: inWindow
      ? undefined
      : `current time outside [${new Date(input.plan.notBeforeMs).toISOString()}, ${new Date(input.plan.notAfterMs).toISOString()}]`,
  });

  if (input.plan.geofence && input.plan.geofence.length >= 3) {
    const violations = input.plan.waypoints.filter(
      (w) => !pointInPolygon([w.lat, w.lon], input.plan.geofence!),
    );
    checks.push({
      id: 'geofence.contains_waypoints',
      ok: violations.length === 0,
      detail:
        violations.length === 0
          ? `all ${input.plan.waypoints.length} waypoints inside geofence`
          : `${violations.length} waypoints outside geofence`,
    });
  } else {
    checks.push({
      id: 'geofence.contains_waypoints',
      ok: true,
      detail: 'no geofence configured',
    });
  }

  checks.push({
    id: 'no.conflicting_mission',
    ok: input.hasActiveMission !== true,
    detail: input.hasActiveMission ? 'aircraft has an active mission loaded' : undefined,
  });

  return checks;
}

/** Ray-casting point-in-polygon. Polygon is [[lat, lon], ...] with no closing repeat. */
export function pointInPolygon(
  point: [number, number],
  polygon: Array<[number, number]>,
): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function summarizeWaypoints(waypoints: FlightWaypoint[]): {
  count: number;
  centroid: [number, number] | undefined;
} {
  if (waypoints.length === 0) return { count: 0, centroid: undefined };
  const lat =
    waypoints.reduce((s, w) => s + w.lat, 0) / waypoints.length;
  const lon =
    waypoints.reduce((s, w) => s + w.lon, 0) / waypoints.length;
  return { count: waypoints.length, centroid: [lat, lon] };
}
