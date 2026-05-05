import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthRequest } from '@securetrax/core';
import {
  SYSTEM_MQTT_ARCHIVER,
  type IMqttArchiver,
} from '@securetrax/core';
import {
  MAPPINGS_REPOSITORY,
  type IMappingsRepository,
} from './mappings.repository.js';
import { ArchiveSearchDto, UpsertMappingDto } from './dto.js';

const RequirePermissions = (...perms: string[]) =>
  SetMetadata('securetrax:permissions', perms);

@ApiTags('telemetry-mqtt')
@ApiBearerAuth()
@Controller('v1/telemetry')
export class TelemetryController {
  constructor(
    @Inject(MAPPINGS_REPOSITORY) private readonly mappings: IMappingsRepository,
    @Inject(SYSTEM_MQTT_ARCHIVER) private readonly archive: IMqttArchiver,
  ) {}

  @Get('mappings')
  @RequirePermissions('telemetry.mappings.read')
  @ApiOperation({ summary: 'List MQTT topic→canonical mappings.' })
  async list(@Req() req: AuthRequest) {
    const tenantId = req.principal?.tenantId;
    if (!tenantId) throw new UnauthorizedException();
    return { items: await this.mappings.list(tenantId) };
  }

  @Put('mappings/:id')
  @RequirePermissions('telemetry.mappings.write')
  @ApiOperation({ summary: 'Create or update an MQTT mapping.' })
  async upsert(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: UpsertMappingDto,
  ) {
    const tenantId = req.principal?.tenantId;
    if (!tenantId) throw new UnauthorizedException();
    return await this.mappings.upsert({
      id,
      tenantId,
      name: body.name,
      topicPattern: body.topicPattern,
      payloadKind: body.payloadKind,
      eventType: body.eventType,
      rules: body.rules,
      enabled: body.enabled ?? true,
      priority: body.priority ?? 0,
    });
  }

  @Delete('mappings/:id')
  @RequirePermissions('telemetry.mappings.write')
  @ApiOperation({ summary: 'Delete a mapping.' })
  async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    const tenantId = req.principal?.tenantId;
    if (!tenantId) throw new UnauthorizedException();
    await this.mappings.delete(tenantId, id);
    return { ok: true };
  }

  @Get('archive')
  @RequirePermissions('telemetry.archive.read')
  @ApiQuery({ name: 'topicLike', required: false })
  @ApiQuery({ name: 'since', required: false, type: Number })
  @ApiQuery({ name: 'until', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({
    summary:
      'Search the rolling MQTT archive (powers the AI assistant\'s mqtt_search later).',
  })
  async search(@Req() req: AuthRequest, @Query() q: ArchiveSearchDto) {
    const tenantId = req.principal?.tenantId;
    if (!tenantId) throw new UnauthorizedException();
    return {
      items: await this.archive.search({
        tenantId,
        topicLike: q.topicLike,
        sinceMs: q.since ? Number(q.since) : undefined,
        untilMs: q.until ? Number(q.until) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
      }),
    };
  }
}
