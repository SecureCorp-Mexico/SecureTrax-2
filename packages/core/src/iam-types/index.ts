/**
 * Minimal IAM-shaped types re-exported by `@securetrax/core` so modules don't
 * have to depend on `apps/api` for `Principal`/`Permission`/`ResourceScope`.
 * The full IAM service still lives in apps/api; this file is just the
 * structural slice the modules + tools need.
 */

export type Permission = string;

export interface ScopeNode {
  kind: 'tenant' | 'site' | 'group' | 'device';
  id: string;
  includeSubtree?: boolean;
}

export interface ResourceScope {
  include: ScopeNode[];
  exclude: ScopeNode[];
}
