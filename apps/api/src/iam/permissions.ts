/**
 * Namespaced permission strings. Modules contribute their own to this set via
 * their manifests; the registry merges them on boot.
 *
 * Format: <module>.<resource>.<action>  e.g. tracking.assets.read
 */
export type Permission = string;

export interface ScopeNode {
  /** "tenant" | "site" | "group" | "device" */
  kind: 'tenant' | 'site' | 'group' | 'device';
  /** The id at this level (e.g. tenant id, site id, asset id). */
  id: string;
  /** Optional include-subtree marker. Default true: descendants included. */
  includeSubtree?: boolean;
}

export interface ResourceScope {
  include: ScopeNode[];
  exclude: ScopeNode[];
}

export const EMPTY_SCOPE: ResourceScope = Object.freeze({
  include: [],
  exclude: [],
}) as ResourceScope;

/** Convenience: a tenant-wide scope is the most permissive a single tenant gets. */
export function tenantScope(tenantId: string): ResourceScope {
  return { include: [{ kind: 'tenant', id: tenantId, includeSubtree: true }], exclude: [] };
}
