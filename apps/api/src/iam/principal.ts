import type { Permission, ResourceScope } from './permissions.js';

/**
 * Authenticated caller. Built once per request by the auth strategies,
 * attached to the request object as `req.principal`, and consumed by
 * PermissionGuard / ScopeGuard.
 */
export interface Principal {
  subjectId: string;
  tenantId: string;
  /** Source of authentication. */
  authMethod: 'jwt' | 'pat' | 'api-key' | 'mtls';
  /** Effective permissions across all role assignments (already merged). */
  permissions: Set<Permission>;
  /** Effective resource scope (merged include/exclude trees). */
  scope: ResourceScope;
  /** Active role ids. Used to enforce separation-of-duties at write time. */
  roleIds: string[];
  /** Epoch seconds at which the caller most recently completed an MFA step. */
  mfaSince?: number;
  /** Set when the caller is a device cert (mTLS). */
  deviceId?: string;
}

export function hasPermission(principal: Principal, permission: Permission): boolean {
  return principal.permissions.has(permission);
}
