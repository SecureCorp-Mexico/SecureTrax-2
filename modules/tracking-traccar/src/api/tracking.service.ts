import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ASSETS_REPOSITORY,
  type Asset,
  type IAssetsRepository,
  type Position,
} from '@securetrax/core';

/**
 * Phase-0 wiring: list/upsert assets through the abstract repo (Drizzle-backed
 * in apps/api). Position ingest from Traccar's WS + REST + canonical pipeline
 * (Position → positions hypertable → Redis hot cache → WS broadcast on
 * `assets/<id>/position`) lands in Phase 1.
 */
@Injectable()
export class TrackingService {
  private readonly log = new Logger(TrackingService.name);

  constructor(
    @Inject(ASSETS_REPOSITORY) private readonly assets: IAssetsRepository,
  ) {}

  async listAssets(): Promise<Asset[]> {
    return this.assets.list();
  }

  async upsertAsset(input: Omit<Asset, 'tenantId'>): Promise<Asset> {
    return this.assets.upsert(input);
  }

  async ingestPosition(_p: Position): Promise<void> {
    // wired up in Phase 1
  }
}
