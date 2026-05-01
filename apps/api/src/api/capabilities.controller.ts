import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LicenseService } from '../license/license.service.js';
import { ModuleRegistry } from '../modules/module-registry.service.js';

@ApiTags('capabilities')
@Controller('v1/capabilities')
export class CapabilitiesController {
  constructor(
    private readonly license: LicenseService,
    private readonly registry: ModuleRegistry,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Live, license-aware catalog of enabled modules + their REST/WS/MQTT/webhook surfaces.',
  })
  capabilities() {
    return {
      tenantId: this.license.tenantId(),
      licenseExpiresAt: this.license.notAfter(),
      enabled: this.license.enabledModules(),
      modules: this.registry.list().map((m) => ({
        id: m.id,
        name: m.name,
        version: m.version,
        category: m.category,
        mapLayers: m.mapLayers,
        api: m.api,
      })),
    };
  }
}
