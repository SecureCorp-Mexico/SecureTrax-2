import { describe, expect, it } from 'vitest';
import { IamService } from './iam.service.js';
import { tenantScope } from './permissions.js';
import { scopeAllows } from './scope.js';

describe('IamService — separation of duties', () => {
  it('allows assigning a single role', () => {
    const iam = new IamService();
    iam.assignRole('alice', 'FlightAuthor', tenantScope('default'));
    const eff = iam.effectivePermissions('alice');
    expect(eff.roleIds).toContain('FlightAuthor');
    expect(eff.permissions.has('aircraft.plans.author')).toBe(true);
    expect(eff.permissions.has('aircraft.plans.approve')).toBe(false);
  });

  it('rejects holding both FlightAuthor and FlightApprover', () => {
    const iam = new IamService();
    iam.assignRole('bob', 'FlightAuthor', tenantScope('default'));
    expect(() => iam.assignRole('bob', 'FlightApprover', tenantScope('default'))).toThrow(
      /separation-of-duties/,
    );
  });

  it('is order-independent', () => {
    const iam = new IamService();
    iam.assignRole('eve', 'FlightApprover', tenantScope('default'));
    expect(() => iam.assignRole('eve', 'FlightAuthor', tenantScope('default'))).toThrow(
      /separation-of-duties/,
    );
  });

  it('lets a user gain back the conflicting role after revoke', () => {
    const iam = new IamService();
    iam.assignRole('frank', 'FlightAuthor', tenantScope('default'));
    iam.revokeRole('frank', 'FlightAuthor');
    iam.assignRole('frank', 'FlightApprover', tenantScope('default'));
    expect(iam.effectivePermissions('frank').roleIds).toEqual(['FlightApprover']);
  });

  it('merges permissions across multiple non-conflicting roles', () => {
    const iam = new IamService();
    iam.assignRole('grace', 'Operator', tenantScope('default'));
    iam.assignRole('grace', 'Maintainer', tenantScope('default'));
    const eff = iam.effectivePermissions('grace');
    expect(eff.permissions.has('tracking.assets.read')).toBe(true);
    expect(eff.permissions.has('telemetry.mappings.write')).toBe(true);
  });
});

describe('scopeAllows', () => {
  it('allows resources inside a tenant scope', () => {
    const scope = tenantScope('default');
    expect(scopeAllows(scope, { tenantId: 'default' })).toBe(true);
    expect(
      scopeAllows(scope, { tenantId: 'default', siteId: 'A', deviceId: 'X' }),
    ).toBe(true);
  });

  it('rejects resources in a different tenant', () => {
    const scope = tenantScope('default');
    expect(scopeAllows(scope, { tenantId: 'other' })).toBe(false);
  });

  it('honors include + exclude trees ("Site A except DRONE-3")', () => {
    const scope = {
      include: [{ kind: 'site' as const, id: 'site-a', includeSubtree: true }],
      exclude: [{ kind: 'device' as const, id: 'DRONE-3' }],
    };
    expect(
      scopeAllows(scope, { tenantId: 'default', siteId: 'site-a', deviceId: 'TRUCK-1' }),
    ).toBe(true);
    expect(
      scopeAllows(scope, { tenantId: 'default', siteId: 'site-a', deviceId: 'DRONE-3' }),
    ).toBe(false);
  });

  it('returns false on an empty scope', () => {
    expect(scopeAllows({ include: [], exclude: [] }, { tenantId: 'default' })).toBe(false);
  });
});
