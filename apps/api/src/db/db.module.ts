import { Global, Module } from '@nestjs/common';
import { ASSETS_REPOSITORY, POSITIONS_REPOSITORY } from '@securetrax/core';
import { DbService } from './db.service.js';
import { TenantContextService } from './tenant-context.service.js';
import { AssetsRepository } from './assets.repository.js';
import { PositionsRepository } from './positions.repository.js';

@Global()
@Module({
  providers: [
    DbService,
    TenantContextService,
    AssetsRepository,
    PositionsRepository,
    { provide: ASSETS_REPOSITORY, useExisting: AssetsRepository },
    { provide: POSITIONS_REPOSITORY, useExisting: PositionsRepository },
  ],
  exports: [
    DbService,
    TenantContextService,
    AssetsRepository,
    PositionsRepository,
    ASSETS_REPOSITORY,
    POSITIONS_REPOSITORY,
  ],
})
export class DbModule {}
