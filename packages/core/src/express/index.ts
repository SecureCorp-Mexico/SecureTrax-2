/**
 * Authenticated Express request shape used everywhere `AuthMiddleware`
 * has run. Exports an explicit `AuthRequest` type instead of relying on
 * module augmentation across package boundaries.
 *
 * Controllers type their `@Req()` parameter as `AuthRequest`; this gives
 * `req.principal` the right shape and full express `Request` semantics
 * (params, body, query, ...).
 */
import type { Request as ExpressRequest } from 'express';
import type { Permission, ResourceScope } from '../iam-types/index.js';

export interface CorePrincipal {
  subjectId: string;
  tenantId: string;
  authMethod: 'jwt' | 'pat' | 'api-key' | 'mtls';
  permissions: Set<Permission>;
  scope: ResourceScope;
  roleIds: string[];
  mfaSince?: number;
  deviceId?: string;
}

export type AuthRequest = ExpressRequest & {
  principal?: CorePrincipal;
};
