import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Put,
  Req,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthRequest } from '@securetrax/core';
import { LayoutsService } from './layouts.service.js';
import { UpsertLayoutDto } from './dto.js';

const RequirePermissions = (...perms: string[]) =>
  SetMetadata('securetrax:permissions', perms);

@ApiTags('videowall')
@ApiBearerAuth()
@Controller('v1/videowall')
export class VideowallController {
  constructor(private readonly layouts: LayoutsService) {}

  @Get('layouts')
  @RequirePermissions('videowall.layouts.read')
  list(@Req() req: AuthRequest) {
    if (!req.principal) throw new UnauthorizedException();
    return { items: this.layouts.list(req.principal.tenantId) };
  }

  @Get('layouts/:id')
  @RequirePermissions('videowall.layouts.read')
  get(@Req() req: AuthRequest, @Param('id') id: string) {
    if (!req.principal) throw new UnauthorizedException();
    const l = this.layouts.get(req.principal.tenantId, id);
    if (!l) throw new NotFoundException();
    return l;
  }

  @Put('layouts/:id')
  @RequirePermissions('videowall.layouts.write')
  @ApiOperation({
    summary:
      'Upsert a layout. Saving broadcasts videowall/<id>/sync so multi-monitor walls reflect the change in lockstep.',
  })
  upsert(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: UpsertLayoutDto) {
    if (!req.principal) throw new UnauthorizedException();
    return this.layouts.upsert({
      id,
      tenantId: req.principal.tenantId,
      ownerId: req.principal.subjectId,
      name: body.name,
      preset: body.preset,
      customGrid: body.customGrid,
      cells: body.cells,
      tour: body.tour,
    });
  }

  @Delete('layouts/:id')
  @RequirePermissions('videowall.layouts.write')
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    if (!req.principal) throw new UnauthorizedException();
    const ok = this.layouts.delete(req.principal.tenantId, id);
    if (!ok) throw new NotFoundException();
    return { ok: true };
  }
}
