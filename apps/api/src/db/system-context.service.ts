import { Injectable } from '@nestjs/common';
import { DbService, type Db } from './db.service.js';

/**
 * Singleton helper for background workers (Traccar adapter, MQTT archiver,
 * report jobs, license refresh) that don't run inside an HTTP request and
 * therefore can't use the request-scoped TenantContextService.
 *
 * Callers pass the tenantId explicitly. Every block still runs inside a
 * `SET LOCAL app.tenant_id = ...` transaction, so RLS is never bypassed —
 * background work has the same defense-in-depth guarantees as HTTP traffic.
 */
@Injectable()
export class SystemContextService {
  constructor(private readonly db: DbService) {}

  withTenant<T>(tenantId: string, fn: (db: Db) => Promise<T>): Promise<T> {
    return this.db.withTenant(tenantId, fn);
  }
}
