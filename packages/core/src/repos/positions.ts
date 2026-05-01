import type { Asset, AssetStatus, Position } from '../types/index.js';

export interface IPositionsRepository {
  insert(p: Position & { tenantId: string }): Promise<void>;
  /** Latest position per asset (one row per asset). */
  latestPerAsset(): Promise<Position[]>;
  /** Position history for a single asset, newest first, capped at `limit`. */
  history(assetId: string, opts?: { limit?: number; sinceMs?: number }): Promise<Position[]>;
}

export const POSITIONS_REPOSITORY = Symbol.for('securetrax.positions-repository');

/**
 * Background-context tracking ingestor — used by long-running workers
 * (Traccar adapter, MQTT mapping engine, Frigate runtime, license refresh)
 * that don't run inside an HTTP request and therefore can't read tenantId
 * from req.principal. Callers pass tenantId explicitly; RLS still applies.
 */
export interface ISystemTrackingIngestor {
  upsertAsset(tenantId: string, input: Omit<Asset, 'tenantId'>): Promise<void>;
  ingestPosition(tenantId: string, p: Position): Promise<void>;
  findAssetByAttr(
    tenantId: string,
    key: string,
    value: string | number,
  ): Promise<string | undefined>;
  /**
   * Update the live status of a fixed/edge asset (camera, router, UPS, etc.).
   * Broadcasts on `assets/<id>/status` so the marker-coloring layer recolors
   * in real time.
   */
  setStatus(
    tenantId: string,
    assetId: string,
    status: AssetStatus,
    lastSeenMs?: number,
  ): Promise<void>;
}

export const SYSTEM_TRACKING_INGESTOR = Symbol.for(
  'securetrax.system-tracking-ingestor',
);
