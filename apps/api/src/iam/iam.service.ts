import { Injectable, Logger } from '@nestjs/common';
import { ROLE_PRESETS, getRolePreset } from './roles.js';
import {
  type Permission,
  type ResourceScope,
  EMPTY_SCOPE,
} from './permissions.js';
import { mergeScopes } from './scope.js';
import type { Principal } from './principal.js';

/**
 * In-memory IAM store. The Drizzle-backed store lands in the next slice
 * (apps/api/src/db/schema.ts → iam_users, iam_roles, iam_user_roles, iam_scopes).
 * The interface stays the same so swapping is a single-file change.
 */
@Injectable()
export class IamService {
  private readonly log = new Logger(IamService.name);

  /** Catalog of permissions every loaded module contributed. */
  private readonly knownPermissions = new Set<Permission>();

  /** subjectId -> assigned role ids. */
  private readonly userRoles = new Map<string, string[]>();

  /** subjectId -> resource scopes (one per role assignment). */
  private readonly userScopes = new Map<string, ResourceScope[]>();

  registerPermissions(perms: readonly Permission[]): void {
    for (const p of perms) this.knownPermissions.add(p);
  }

  permissionsCatalog(): Permission[] {
    return [...this.knownPermissions];
  }

  /**
   * Assign a role to a subject. Enforces separation-of-duties: a subject
   * cannot simultaneously hold roles that declare each other in `exclusiveWith`.
   */
  assignRole(subjectId: string, roleId: string, scope: ResourceScope = EMPTY_SCOPE): void {
    const preset = getRolePreset(roleId);
    if (!preset) throw new Error(`unknown role: ${roleId}`);

    const current = this.userRoles.get(subjectId) ?? [];
    const conflicting = (preset.exclusiveWith ?? []).filter((c) => current.includes(c));
    if (conflicting.length > 0) {
      throw new Error(
        `separation-of-duties violation: ${roleId} conflicts with [${conflicting.join(', ')}]`,
      );
    }
    if (current.includes(roleId)) return;

    this.userRoles.set(subjectId, [...current, roleId]);
    const scopes = this.userScopes.get(subjectId) ?? [];
    this.userScopes.set(subjectId, [...scopes, scope]);
    this.log.log(`assigned role ${roleId} to ${subjectId}`);
  }

  revokeRole(subjectId: string, roleId: string): void {
    const roles = this.userRoles.get(subjectId);
    if (!roles) return;
    const idx = roles.indexOf(roleId);
    if (idx === -1) return;
    roles.splice(idx, 1);
    this.userRoles.set(subjectId, roles);
    const scopes = this.userScopes.get(subjectId) ?? [];
    scopes.splice(idx, 1);
    this.userScopes.set(subjectId, scopes);
  }

  /** Compute the effective `Principal` data for a subject (without auth metadata). */
  effectivePermissions(subjectId: string): {
    permissions: Set<Permission>;
    scope: ResourceScope;
    roleIds: string[];
  } {
    const roleIds = this.userRoles.get(subjectId) ?? [];
    const scopes = this.userScopes.get(subjectId) ?? [];
    const permissions = new Set<Permission>();
    for (const id of roleIds) {
      const preset = getRolePreset(id);
      if (!preset) continue;
      for (const p of preset.permissions) permissions.add(p);
    }
    return { permissions, scope: mergeScopes(...scopes), roleIds };
  }

  /**
   * Whether the principal could acquire a given role given its current
   * assignments — used by step-up flows before promoting a session.
   */
  canAcquireRole(principal: Principal, roleId: string): boolean {
    const preset = getRolePreset(roleId);
    if (!preset) return false;
    const conflicts = preset.exclusiveWith ?? [];
    return !conflicts.some((c) => principal.roleIds.includes(c));
  }

  /** Bootstrap helper used in dev to seed the role presets catalog. */
  presetIds(): string[] {
    return ROLE_PRESETS.map((r) => r.id);
  }
}
