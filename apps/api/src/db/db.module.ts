import { Global, Module } from '@nestjs/common';
import {
  ASSETS_REPOSITORY,
  POSITIONS_REPOSITORY,
  SYSTEM_TRACKING_INGESTOR,
} from '@securetrax/core';
import { DbService } from './db.service.js';
import { TenantContextService } from './tenant-context.service.js';
import { SystemContextService } from './system-context.service.js';
import { AssetsRepository } from './assets.repository.js';
import { PositionsRepository } from './positions.repository.js';
import { SystemTrackingIngestor } from './system-tracking.ingestor.js';

@Global()
@Module({
  providers: [
    DbService,
    TenantContextService,
    SystemContextService,
    AssetsRepository,
    PositionsRepository,
    SystemTrackingIngestor,
    { provide: ASSETS_REPOSITORY, useExisting: AssetsRepository },
    { provide: POSITIONS_REPOSITORY, useExisting: PositionsRepository },
    { provide: SYSTEM_TRACKING_INGESTOR, useExisting: SystemTrackingIngestor },
  ],
  exports: [
    DbService,
    TenantContextService,
    SystemContextService,
    AssetsRepository,
    PositionsRepository,
    SystemTrackingIngestor,
    ASSETS_REPOSITORY,
    POSITIONS_REPOSITORY,
    SYSTEM_TRACKING_INGESTOR,
  ],
})
export class DbModule {}
