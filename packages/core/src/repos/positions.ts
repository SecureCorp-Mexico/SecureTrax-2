import type { Position } from '../types/index.js';

export interface IPositionsRepository {
  insert(p: Position & { tenantId: string }): Promise<void>;
  /** Latest position per asset (one row per asset). */
  latestPerAsset(): Promise<Position[]>;
  /** Position history for a single asset, newest first, capped at `limit`. */
  history(assetId: string, opts?: { limit?: number; sinceMs?: number }): Promise<Position[]>;
}

export const POSITIONS_REPOSITORY = Symbol.for('securetrax.positions-repository');
