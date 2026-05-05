import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  ASSETS_REPOSITORY,
  BROADCASTER,
  POSITIONS_REPOSITORY,
  type Asset,
  type IAssetsRepository,
  type IBroadcaster,
  type IPositionsRepository,
  type Position,
  type UpsertAssetInput,
} from '@securetrax/core';

/**
 * Canonical position pipeline. ingestPosition is the single entry point —
 * Traccar adapter, MQTT mapping engine, the simulator, and the test REST
 * endpoint all funnel through it. It writes to the positions hypertable
 * (RLS-scoped via the request's tenant context) and broadcasts on
 * `assets/<id>/position` so live web/mobile subscribers see updates.
 */
@Injectable()
export class TrackingService {
  private readonly log = new Logger(TrackingService.name);

  constructor(
    @Inject(ASSETS_REPOSITORY) private readonly assets: IAssetsRepository,
    @Inject(POSITIONS_REPOSITORY) private readonly positions: IPositionsRepository,
    @Optional() @Inject(BROADCASTER) private readonly broadcaster?: IBroadcaster,
  ) {}

  async listAssets(): Promise<Asset[]> {
    return this.assets.list();
  }

  async upsertAsset(input: UpsertAssetInput): Promise<Asset> {
    return this.assets.upsert(input);
  }

  async latestPositions(): Promise<Position[]> {
    return this.positions.latestPerAsset();
  }

  async positionHistory(
    assetId: string,
    opts?: { limit?: number; sinceMs?: number },
  ): Promise<Position[]> {
    return this.positions.history(assetId, opts);
  }

  async ingestPosition(
    p: Position & { tenantId: string },
  ): Promise<Position> {
    await this.positions.insert(p);
    this.broadcaster?.broadcast(`assets/${p.assetId}/position`, p);
    return p;
  }
}
