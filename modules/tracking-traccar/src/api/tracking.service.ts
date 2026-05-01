import { Injectable, Logger } from '@nestjs/common';
import type { Asset, Position } from '@securetrax/core';

/**
 * Stub. The full implementation will subscribe to Traccar's WS + REST,
 * normalize into Position, persist to Timescale, cache in Redis, broadcast on
 * `assets/<id>/position`. For Phase-0 wiring we only expose in-memory data.
 */
@Injectable()
export class TrackingService {
  private readonly log = new Logger(TrackingService.name);
  private readonly assets = new Map<string, Asset>();

  listAssets(): Asset[] {
    return [...this.assets.values()];
  }

  upsertAsset(asset: Asset): void {
    this.assets.set(asset.id, asset);
  }

  ingestPosition(_p: Position): void {
    // wired up in Phase 1
  }
}
