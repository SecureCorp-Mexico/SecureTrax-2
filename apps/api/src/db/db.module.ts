import { Global, Module } from '@nestjs/common';
import { ASSETS_REPOSITORY } from '@securetrax/core';
import { DbService } from './db.service.js';
import { TenantContextService } from './tenant-context.service.js';
import { AssetsRepository } from './assets.repository.js';

@Global()
@Module({
  providers: [
    DbService,
    TenantContextService,
    AssetsRepository,
    { provide: ASSETS_REPOSITORY, useExisting: AssetsRepository },
  ],
  exports: [
    DbService,
    TenantContextService,
    AssetsRepository,
    ASSETS_REPOSITORY,
  ],
})
export class DbModule {}
