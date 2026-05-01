import {
  Logger,
  MiddlewareConsumer,
  Module,
  type DynamicModule,
  type NestModule,
  type Type,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { LicenseModule } from './license/license.module.js';
import { LicenseService } from './license/license.service.js';
import { loadLicenseSync } from './license/loader.js';
import { ModuleRegistryModule } from './modules/module-registry.module.js';
import { ModuleRegistry } from './modules/module-registry.service.js';
import { CapabilitiesController } from './api/capabilities.controller.js';
import { HealthController } from './api/health.controller.js';
import { IamModule } from './iam/iam.module.js';
import { IamService } from './iam/iam.service.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthMiddleware } from './auth/auth.middleware.js';
import { PermissionGuard } from './auth/guards/permission.guard.js';
import { ScopeGuard } from './auth/guards/scope.guard.js';
import { StepUpGuard } from './auth/guards/step-up.guard.js';
import { AuditModule } from './audit/audit.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { DbModule } from './db/db.module.js';
import { MqttModule } from './mqtt/mqtt.module.js';
import {
  manifest as trackingManifest,
  TrackingTraccarModule,
} from '@securetrax/module-tracking-traccar';
import {
  manifest as telemetryMqttManifest,
  TelemetryMqttModule,
} from '@securetrax/module-telemetry-mqtt';
import {
  manifest as videoSecureVuManifest,
  VideoSecureVuModule,
} from '@securetrax/module-video-securevu';
import {
  manifest as aiAssistantManifest,
  AiAssistantModule,
} from '@securetrax/module-ai-assistant';
import type { ModuleManifest } from '@securetrax/module-contracts';

interface RegisteredModule {
  manifest: ModuleManifest;
  nestModule: Type<unknown> | DynamicModule;
}

const ALL_MODULES: RegisteredModule[] = [
  { manifest: trackingManifest, nestModule: TrackingTraccarModule },
  { manifest: telemetryMqttManifest, nestModule: TelemetryMqttModule },
  { manifest: videoSecureVuManifest, nestModule: VideoSecureVuModule },
  { manifest: aiAssistantManifest, nestModule: AiAssistantModule },
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
    DbModule,
    MqttModule,
    IamModule,
    AuthModule,
    AuditModule,
    RealtimeModule,
    ModuleRegistryModule,
    ...enabledModules.map((m) => m.nestModule),
  ],
  controllers: [HealthController, CapabilitiesController],
  providers: [
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: ScopeGuard },
    { provide: APP_GUARD, useClass: StepUpGuard },
  ],
})
export class AppModule implements NestModule {
  constructor(registry: ModuleRegistry, iam: IamService) {
    for (const m of enabledModules) {
      registry.register(m.manifest);
      iam.registerPermissions(m.manifest.api.permissions);
    }
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
