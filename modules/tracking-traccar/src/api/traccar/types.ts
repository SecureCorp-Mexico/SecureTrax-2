/**
 * Subset of the Traccar API shapes we consume. Documented at
 * https://www.traccar.org/api-reference/. We deliberately accept only the
 * fields the adapter normalizes — extra fields ride along in `attributes`
 * and end up in `Position.attrs` for downstream consumers (AI assistant
 * `query_data`, fleet reports, etc.).
 */

export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status?: 'online' | 'offline' | 'unknown';
  lastUpdate?: string;
  groupId?: number;
  category?: string;
  attributes?: Record<string, unknown>;
}

export interface TraccarPosition {
  id: number;
  deviceId: number;
  protocol?: string;
  serverTime?: string;
  deviceTime?: string;
  fixTime?: string;
  outdated?: boolean;
  valid?: boolean;
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;        // knots
  course?: number;       // degrees, 0=N
  attributes?: Record<string, unknown>;
}

export interface TraccarSocketFrame {
  positions?: TraccarPosition[];
  devices?: TraccarDevice[];
  events?: Array<Record<string, unknown>>;
}

const KNOTS_TO_KMH = 1.852;

/**
 * Normalize a Traccar position into our canonical Position shape. `assetId`
 * is resolved by the caller from the device-id mapping; this function only
 * worries about value translation.
 */
export function normalizeTraccarPosition(
  assetId: string,
  src: TraccarPosition,
): {
  assetId: string;
  ts: number;
  lat: number;
  lon: number;
  alt?: number;
  speed?: number;
  heading?: number;
  attrs: Record<string, unknown>;
} {
  const tsIso = src.fixTime ?? src.deviceTime ?? src.serverTime;
  const ts = tsIso ? Date.parse(tsIso) : Date.now();
  return {
    assetId,
    ts: Number.isFinite(ts) ? ts : Date.now(),
    lat: src.latitude,
    lon: src.longitude,
    alt: typeof src.altitude === 'number' ? src.altitude : undefined,
    speed:
      typeof src.speed === 'number'
        ? Number((src.speed * KNOTS_TO_KMH).toFixed(2))
        : undefined,
    heading: typeof src.course === 'number' ? src.course : undefined,
    attrs: {
      traccarPositionId: src.id,
      traccarDeviceId: src.deviceId,
      protocol: src.protocol,
      valid: src.valid,
      outdated: src.outdated,
      ...(src.attributes ?? {}),
    },
  };
}

/**
 * Normalize a Traccar device into our canonical asset shape. The asset id is
 * derived from the Traccar uniqueId so external systems (and the adapter on
 * subsequent restarts) can re-find it deterministically.
 */
export function assetIdForTraccar(uniqueId: string): string {
  return `traccar:${uniqueId}`;
}
