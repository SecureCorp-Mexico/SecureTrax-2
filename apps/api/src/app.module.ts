import { Logger, Module, type Type, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LicenseModule } from './license/license.module.js';
import { LicenseService } from './license/license.service.js';
import { loadLicenseSync } from './license/loader.js';
import { ModuleRegistryModule } from './modules/module-registry.module.js';
import { ModuleRegistry } from './modules/module-registry.service.js';
import { CapabilitiesController } from './api/capabilities.controller.js';
import { HealthController } from './api/health.controller.js';
import {
  manifest as trackingManifest,
  TrackingTraccarModule,
} from '@securetrax/module-tracking-traccar';
import type { ModuleManifest } from '@securetrax/module-contracts';

interface RegisteredModule {
  manifest: ModuleManifest;
  nestModule: Type<unknown> | DynamicModule;
}

const ALL_MODULES: RegisteredModule[] = [
  { manifest: trackingManifest, nestModule: TrackingTraccarModule },
];

const license = loadLicenseSync();
LicenseService.cached = license;
const log = new Logger('AppModule');

const enabledModules = ALL_MODULES.filter((m) => {
  if (license.enabled.has(m.manifest.id)) {
    log.log(`enabled module: ${m.manifest.id}`);
    return true;
  }
  log.log(`skipping module (not licensed): ${m.manifest.id}`);
  return false;
});

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LicenseModule,
    ModuleRegistryModule,
    ...enabledModules.map((m) => m.nestModule),
  ],
  controllers: [HealthController, CapabilitiesController],
})
export class AppModule {
  constructor(registry: ModuleRegistry) {
    for (const m of enabledModules) registry.register(m.manifest);
  }
}
