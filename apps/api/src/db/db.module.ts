import { Global, Module } from '@nestjs/common';
import {
  ASSETS_REPOSITORY,
  POSITIONS_REPOSITORY,
  SYSTEM_MQTT_ARCHIVER,
  SYSTEM_TRACKING_INGESTOR,
} from '@securetrax/core';
import { MAPPINGS_REPOSITORY } from '@securetrax/module-telemetry-mqtt';
import { DbService } from './db.service.js';
import { TenantContextService } from './tenant-context.service.js';
import { SystemContextService } from './system-context.service.js';
import { AssetsRepository } from './assets.repository.js';
import { PositionsRepository } from './positions.repository.js';
import { SystemTrackingIngestor } from './system-tracking.ingestor.js';
import { SystemMqttArchiver } from './system-mqtt.archiver.js';
import { MqttMappingsRepository } from './mqtt-mappings.repository.js';

@Global()
@Module({
  providers: [
    DbService,
    TenantContextService,
    SystemContextService,
    AssetsRepository,
    PositionsRepository,
    SystemTrackingIngestor,
    SystemMqttArchiver,
    MqttMappingsRepository,
    { provide: ASSETS_REPOSITORY, useExisting: AssetsRepository },
    { provide: POSITIONS_REPOSITORY, useExisting: PositionsRepository },
    { provide: SYSTEM_TRACKING_INGESTOR, useExisting: SystemTrackingIngestor },
    { provide: SYSTEM_MQTT_ARCHIVER, useExisting: SystemMqttArchiver },
    { provide: MAPPINGS_REPOSITORY, useExisting: MqttMappingsRepository },
  ],
  exports: [
    DbService,
    TenantContextService,
    SystemContextService,
    AssetsRepository,
    PositionsRepository,
    SystemTrackingIngestor,
    SystemMqttArchiver,
    MqttMappingsRepository,
    ASSETS_REPOSITORY,
    POSITIONS_REPOSITORY,
    SYSTEM_TRACKING_INGESTOR,
    SYSTEM_MQTT_ARCHIVER,
    MAPPINGS_REPOSITORY,
  ],
})
export class DbModule {}
