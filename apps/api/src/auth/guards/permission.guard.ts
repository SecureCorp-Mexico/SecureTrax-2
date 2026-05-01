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
import type { Permission } from '../../iam/permissions.js';

const PERMISSION_KEY = 'securetrax:permissions';

/**
 * Decorator: `@RequirePermissions('aircraft.deploy.execute')` on a controller
 * method. PermissionGuard reads them via Reflector.
 */
export const RequirePermissions = (...perms: Permission[]) =>
  SetMetadata(PERMISSION_KEY, perms);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndMerge<Permission[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.principal) throw new UnauthorizedException('authentication required');
    for (const perm of required) {
      if (!req.principal.permissions.has(perm)) {
        throw new ForbiddenException(`missing permission: ${perm}`);
      }
    }
    return true;
  }
}
