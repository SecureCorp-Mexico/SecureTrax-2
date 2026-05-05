import type { ResourceScope, ScopeNode } from './permissions.js';

/**
 * A resource the caller is trying to act on, expressed as the path from tenant
 * down to the leaf. Used by `scopeAllows` to check include/exclude trees.
 *
 * Example for asset DRONE-3 in site Sector-7 of tenant default:
 *   { tenantId: 'default', siteId: 'Sector-7', deviceId: 'DRONE-3' }
 */
export interface ResourceRef {
  tenantId: string;
  siteId?: string;
  groupId?: string;
  deviceId?: string;
}

function nodeMatches(node: ScopeNode, ref: ResourceRef): boolean {
  switch (node.kind) {
    case 'tenant':
      return ref.tenantId === node.id;
    case 'site':
      return ref.siteId === node.id || (!!node.includeSubtree && ref.siteId === node.id);
    case 'group':
      return ref.groupId === node.id;
    case 'device':
      return ref.deviceId === node.id;
  }
}

function nodeCovers(node: ScopeNode, ref: ResourceRef): boolean {
  if (node.kind === 'tenant') return ref.tenantId === node.id;
  if (node.kind === 'site') return ref.siteId === node.id;
  if (node.kind === 'group') return ref.groupId === node.id;
  return ref.deviceId === node.id;
}

/**
 * A scope is "include all that match an include node, then subtract anything
 * that matches an exclude node". With no includes, nothing is allowed.
 */
export function scopeAllows(scope: ResourceScope, ref: ResourceRef): boolean {
  if (!scope.include.some((n) => nodeCovers(n, ref) || nodeMatches(n, ref))) return false;
  if (scope.exclude.some((n) => nodeCovers(n, ref) || nodeMatches(n, ref))) return false;
  return true;
}

/**
 * Merge two scopes by union of includes minus union of excludes. Useful when a
 * user has multiple role assignments that each carry their own scope.
 */
export function mergeScopes(...scopes: ResourceScope[]): ResourceScope {
  return {
    include: scopes.flatMap((s) => s.include),
    exclude: scopes.flatMap((s) => s.exclude),
  };
}
