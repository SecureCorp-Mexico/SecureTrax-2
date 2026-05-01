import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

const STEP_UP_KEY = 'securetrax:step-up';
const DEFAULT_MAX_AGE_SECONDS = 5 * 60;

/**
 * Decorator: `@RequireStepUp({ maxAgeSeconds: 60 })` on sensitive routes
 * (flight deploy, license rotate, audit export). The principal must have an
 * `mfaSince` claim within the configured window or the request is rejected
 * with HTTP 401 step_up_required so the UI can drive the re-auth flow.
 */
export interface StepUpOptions {
  maxAgeSeconds?: number;
}

export const RequireStepUp = (opts: StepUpOptions = {}) => SetMetadata(STEP_UP_KEY, opts);

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const opts = this.reflector.getAllAndOverride<StepUpOptions>(STEP_UP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!opts) return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.principal) throw new UnauthorizedException('authentication required');
    const max = opts.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
    const since = req.principal.mfaSince;
    if (typeof since !== 'number') {
      throw new ForbiddenException('step_up_required: no recent MFA');
    }
    const age = Math.floor(Date.now() / 1000) - since;
    if (age > max) throw new ForbiddenException('step_up_required: MFA too old');
    return true;
  }
}
