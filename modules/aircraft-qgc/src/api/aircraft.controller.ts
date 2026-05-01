import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
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
import { PlansService } from './plans.service.js';
import { DeployService } from './deploy.service.js';
import {
  AbortDto,
  ApproveDto,
  DeployDto,
  RegisterApproverDto,
  UpsertPlanDto,
} from './dto.js';

const RequirePermissions = (...perms: string[]) =>
  SetMetadata('securetrax:permissions', perms);

@ApiTags('aircraft-qgc')
@ApiBearerAuth()
@Controller('v1/aircraft')
export class AircraftController {
  constructor(
    private readonly plans: PlansService,
    private readonly deploy: DeployService,
  ) {}

  @Get('deploy-key')
  @RequirePermissions('aircraft.plans.read')
  @ApiOperation({
    summary:
      "Public key the onboard sidecar uses to verify RemoteMissionDeploy commands. Pin this in the sidecar's config.",
  })
  deployKey() {
    return this.deploy.deployPublicKey();
  }

  @Post('approver-keys')
  @RequirePermissions('aircraft.plans.approve')
  @ApiOperation({ summary: 'Register an approver public key.' })
  registerApprover(@Body() body: RegisterApproverDto) {
    this.plans.registerApproverKey(body.kid, body.publicKey);
    return { ok: true };
  }

  @Get('plans')
  @RequirePermissions('aircraft.plans.read')
  list(@Req() req: Request) {
    if (!req.principal) throw new UnauthorizedException();
    return { items: this.plans.list(req.principal.tenantId) };
  }

  @Get('plans/:id')
  @RequirePermissions('aircraft.plans.read')
  get(@Req() req: Request, @Param('id') id: string) {
    if (!req.principal) throw new UnauthorizedException();
    const plan = this.plans.get(req.principal.tenantId, id);
    if (!plan) throw new NotFoundException();
    return plan;
  }

  @Put('plans/:id')
  @RequirePermissions('aircraft.plans.author')
  @ApiOperation({
    summary:
      'Upsert a flight plan. Any change to the canonical body (waypoints, validity window, geofence, target aircraft) invalidates existing approvals.',
  })
  upsert(@Req() req: Request, @Param('id') id: string, @Body() body: UpsertPlanDto) {
    if (!req.principal) throw new UnauthorizedException();
    return this.plans.upsert({
      id,
      tenantId: req.principal.tenantId,
      aircraftId: body.aircraftId,
      name: body.name,
      authorId: req.principal.subjectId,
      notBeforeMs: body.notBeforeMs,
      notAfterMs: body.notAfterMs,
      waypoints: body.waypoints,
      geofence: body.geofence,
    });
  }

  @Post('plans/:id/approvals')
  @RequirePermissions('aircraft.plans.approve')
  @ApiOperation({
    summary:
      'Add an Ed25519 approval signature. Verifies the signature against the canonical plan body before storing. Authors cannot approve their own plans.',
  })
  approve(@Req() req: Request, @Param('id') id: string, @Body() body: ApproveDto) {
    if (!req.principal) throw new UnauthorizedException();
    return this.plans.addApproval(req.principal.tenantId, id, {
      approverId: body.approverId,
      kid: body.kid,
      signature: body.signature,
    });
  }

  @Post('plans/:id/deploy')
  @RequirePermissions('aircraft.deploy.execute')
  @ApiOperation({
    summary:
      'Run the pre-flight gate and, if all checks pass, publish a signed RemoteMissionDeploy command on `securetrax/<tenant>/<aircraft>/cmd` for the onboard sidecar to execute.',
  })
  async deployPlan(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: DeployDto,
  ) {
    if (!req.principal) throw new UnauthorizedException();
    return await this.deploy.deploy(req.principal.tenantId, id, body);
  }

  @Post(':id/abort')
  @RequirePermissions('aircraft.abort')
  @ApiOperation({ summary: 'Issue a signed RTL/LAND/BRAKE abort command.' })
  async abort(
    @Req() req: Request,
    @Param('id') aircraftId: string,
    @Body() body: AbortDto,
  ) {
    if (!req.principal) throw new UnauthorizedException();
    await this.deploy.abort(req.principal.tenantId, aircraftId, body.mode);
    return { ok: true };
  }
}
