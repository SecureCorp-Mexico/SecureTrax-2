import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { scopeAllows } from '../../iam/scope.js';
import type { ResourceRef } from '../../iam/scope.js';

/**
 * Layer-2 of the three-layer authorization (the layer-3 backstop is Postgres
 * RLS, added with the Drizzle slice). Checks that every `ResourceRef` from
 * the request — `req.scopeRef` set by handler-resolved params, plus any nested
 * refs in `req.scopeRefs` — falls within the principal's scope.
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<
      Request & { scopeRef?: ResourceRef; scopeRefs?: ResourceRef[] }
    >();
    if (!req.principal) throw new UnauthorizedException('authentication required');

    const refs: ResourceRef[] = [];
    if (req.scopeRef) refs.push(req.scopeRef);
    if (req.scopeRefs) refs.push(...req.scopeRefs);
    if (refs.length === 0) return true;

    for (const ref of refs) {
      if (ref.tenantId !== req.principal.tenantId) {
        throw new ForbiddenException('cross-tenant access denied');
      }
      if (!scopeAllows(req.principal.scope, ref)) {
        throw new ForbiddenException(`resource out of scope: ${JSON.stringify(ref)}`);
      }
    }
    return true;
  }
}
