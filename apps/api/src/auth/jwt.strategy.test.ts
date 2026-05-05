import 'reflect-metadata';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { JwtStrategy } from './jwt.strategy.js';
import { IamService } from '../iam/iam.service.js';

const ORIG_ENV = process.env.KEYCLOAK_ISSUER;

describe('JwtStrategy — dev fallback (no KEYCLOAK_ISSUER)', () => {
  beforeEach(() => {
    delete process.env.KEYCLOAK_ISSUER;
  });
  afterEach(() => {
    if (ORIG_ENV !== undefined) process.env.KEYCLOAK_ISSUER = ORIG_ENV;
  });

  it('decodes a properly-shaped bearer when no issuer is configured', async () => {
    const iam = new IamService();
    const strat = new JwtStrategy(iam);
    const payload = Buffer.from(
      JSON.stringify({ sub: 'alice', tenant_id: 'default' }),
      'utf8',
    ).toString('base64url');
    const fakeJwt = `eyJhbGciOiJSUzI1NiJ9.${payload}.sig`;
    const principal = await strat.authenticate({
      headers: { authorization: `Bearer ${fakeJwt}` },
    });
    expect(principal?.subjectId).toBe('alice');
    expect(principal?.tenantId).toBe('default');
    expect(principal?.authMethod).toBe('jwt');
  });

  it('returns undefined for non-bearer headers', async () => {
    const strat = new JwtStrategy(new IamService());
    expect(
      await strat.authenticate({ headers: { authorization: 'Basic xxx' } }),
    ).toBeUndefined();
  });

  it('returns undefined when authorization is missing', async () => {
    const strat = new JwtStrategy(new IamService());
    expect(await strat.authenticate({ headers: {} })).toBeUndefined();
  });

  it('returns undefined for malformed JWTs', async () => {
    const strat = new JwtStrategy(new IamService());
    expect(
      await strat.authenticate({
        headers: { authorization: 'Bearer not-a-jwt' },
      }),
    ).toBeUndefined();
  });
});

describe('JwtStrategy — production mode (KEYCLOAK_ISSUER set)', () => {
  beforeEach(() => {
    process.env.KEYCLOAK_ISSUER = 'https://keycloak.example.com/realms/test';
    process.env.KEYCLOAK_AUDIENCE = 'securetrax-api';
  });
  afterEach(() => {
    if (ORIG_ENV !== undefined) process.env.KEYCLOAK_ISSUER = ORIG_ENV;
    else delete process.env.KEYCLOAK_ISSUER;
  });

  it('rejects unverified tokens (signature mismatch)', async () => {
    const strat = new JwtStrategy(new IamService());
    const payload = Buffer.from(
      JSON.stringify({ sub: 'alice', iss: 'wrong' }),
      'utf8',
    ).toString('base64url');
    const fakeJwt = `eyJhbGciOiJSUzI1NiJ9.${payload}.fake-sig`;
    // Should attempt JWKS verification and fail (we never reach the network
    // because the jose library checks header → claims → fetch in that order;
    // an obviously fake token short-circuits before the JWKS fetch for some
    // failures, but the network failure path is also handled — both return
    // undefined).
    const principal = await strat.authenticate({
      headers: { authorization: `Bearer ${fakeJwt}` },
    });
    expect(principal).toBeUndefined();
  });
});
