import { Inject, Injectable, Scope } from '@nestjs/common';
import type { AuthRequest } from '@securetrax/core';
import { REQUEST } from '@nestjs/core';
import { DbService, type Db } from './db.service.js';

/**
 * Request-scoped helper: resolves the calling principal's tenant from
 * `req.principal` (set by AuthMiddleware) and provides a `withDb(...)` that
 * runs callbacks under the right RLS scope. Controllers/services should
 * prefer this over touching `DbService` directly so RLS is always applied.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  constructor(
    @Inject(REQUEST) private readonly req: AuthRequest,
    private readonly db: DbService,
  ) {}

  tenantId(): string {
    const t = this.req.principal?.tenantId;
    if (!t) throw new Error('no principal on request — auth required for DB access');
    return t;
  }

  async withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    return await this.db.withTenant(this.tenantId(), fn);
  }
}
