import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { PermissionGuard, RequirePermissions } from './permission.guard.js';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from '../../iam/principal.js';
import { tenantScope } from '../../iam/permissions.js';

function ctx(req: Partial<Request>, handler: unknown, cls: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req as Request, getResponse: () => ({}) }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

function principalWith(perms: string[]): Principal {
  return {
    subjectId: 'alice',
    tenantId: 'default',
    authMethod: 'jwt',
    permissions: new Set(perms),
    scope: tenantScope('default'),
    roleIds: [],
  };
}

describe('PermissionGuard', () => {
  const reflector = new Reflector();
  const guard = new PermissionGuard(reflector);

  it('allows when no permissions required', () => {
    const handler = () => null;
    expect(guard.canActivate(ctx({ principal: principalWith([]) }, handler, {}))).toBe(true);
  });

  it('rejects unauthenticated requests when permissions are required', () => {
    const cls = class C {};
    const handler = () => null;
    Reflect.defineMetadata('securetrax:permissions', ['video.live.view'], handler);
    expect(() => guard.canActivate(ctx({}, handler, cls))).toThrow(/authentication required/);
  });

  it('rejects when missing required permission', () => {
    const cls = class C {};
    const handler = () => null;
    Reflect.defineMetadata('securetrax:permissions', ['aircraft.deploy.execute'], handler);
    expect(() =>
      guard.canActivate(
        ctx({ principal: principalWith(['tracking.assets.read']) }, handler, cls),
      ),
    ).toThrow(/missing permission/);
  });

  it('allows when caller has all required permissions', () => {
    const cls = class C {};
    const handler = () => null;
    Reflect.defineMetadata(
      'securetrax:permissions',
      ['tracking.assets.read', 'video.live.view'],
      handler,
    );
    expect(
      guard.canActivate(
        ctx(
          { principal: principalWith(['tracking.assets.read', 'video.live.view']) },
          handler,
          cls,
        ),
      ),
    ).toBe(true);
  });

  it('decorator factory tags handler metadata', () => {
    class C {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      m() {}
    }
    const dec = RequirePermissions('a', 'b');
    dec(C.prototype, 'm', Object.getOwnPropertyDescriptor(C.prototype, 'm')!);
    const m = Reflect.getMetadata('securetrax:permissions', C.prototype.m);
    expect(m).toEqual(['a', 'b']);
  });
});
