import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign as nodeSign, randomUUID } from 'node:crypto';
import {
  LicenseClaims,
  SignedLicense,
  type SignedLicense as SignedLicenseT,
} from '@securetrax/module-contracts';
import { canonicalize } from './canonical.js';
import { StaticKeyResolver, verifyLicense } from './verify.js';

function mintLicense(opts?: {
  modules?: string[];
  notBefore?: number;
  notAfter?: number;
  hardwareFingerprint?: string;
  kid?: string;
}): { license: SignedLicenseT; pubPem: string; privPemKid: string } {
  const kid = opts?.kid ?? 'kid-test';
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const now = Math.floor(Date.now() / 1000);
  const claims = LicenseClaims.parse({
    iss: 'test',
    sub: 'tenant-a',
    tenantId: 'tenant-a',
    modules: opts?.modules ?? ['tracking-traccar'],
    notBefore: opts?.notBefore ?? now - 60,
    notAfter: opts?.notAfter ?? now + 86400,
    hardwareFingerprint: opts?.hardwareFingerprint,
    features: {},
    jti: randomUUID(),
  });
  const sig = nodeSign(null, Buffer.from(canonicalize(claims), 'utf8'), privateKey).toString(
    'base64',
  );
  const license = SignedLicense.parse({ v: 1, claims, alg: 'Ed25519', kid, sig });
  return {
    license,
    pubPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    privPemKid: kid,
  };
}

describe('verifyLicense', () => {
  it('accepts a freshly signed license', () => {
    const { license, pubPem, privPemKid } = mintLicense();
    const result = verifyLicense(license, {
      resolver: new StaticKeyResolver({ [privPemKid]: pubPem }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.claims.modules).toEqual(['tracking-traccar']);
  });

  it('rejects a tampered claim payload', () => {
    const { license, pubPem, privPemKid } = mintLicense();
    const tampered: SignedLicenseT = {
      ...license,
      claims: { ...license.claims, modules: [...license.claims.modules, 'aircraft-qgc'] },
    };
    const result = verifyLicense(tampered, {
      resolver: new StaticKeyResolver({ [privPemKid]: pubPem }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/signature/);
  });

  it('rejects an unknown kid', () => {
    const { license, pubPem } = mintLicense({ kid: 'kid-test' });
    const result = verifyLicense(license, {
      resolver: new StaticKeyResolver({ 'other-kid': pubPem }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unknown kid/);
  });

  it('rejects an expired license', () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const { license, pubPem, privPemKid } = mintLicense({
      notBefore: past - 100,
      notAfter: past,
    });
    const result = verifyLicense(license, {
      resolver: new StaticKeyResolver({ [privPemKid]: pubPem }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/expired/);
  });

  it('rejects a license not yet valid', () => {
    const future = Math.floor(Date.now() / 1000) + 1000;
    const { license, pubPem, privPemKid } = mintLicense({
      notBefore: future,
      notAfter: future + 100,
    });
    const result = verifyLicense(license, {
      resolver: new StaticKeyResolver({ [privPemKid]: pubPem }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not yet valid/);
  });

  it('rejects on hardware fingerprint mismatch', () => {
    const { license, pubPem, privPemKid } = mintLicense({ hardwareFingerprint: 'host-a' });
    const result = verifyLicense(license, {
      resolver: new StaticKeyResolver({ [privPemKid]: pubPem }),
      hardwareFingerprint: 'host-b',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/hardware fingerprint/);
  });

  it('accepts when hardware fingerprint matches', () => {
    const { license, pubPem, privPemKid } = mintLicense({ hardwareFingerprint: 'host-a' });
    const result = verifyLicense(license, {
      resolver: new StaticKeyResolver({ [privPemKid]: pubPem }),
      hardwareFingerprint: 'host-a',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects malformed JSON', () => {
    const result = verifyLicense('not-json', {
      resolver: new StaticKeyResolver({}),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/JSON/);
  });

  it('rejects malformed license shape', () => {
    const result = verifyLicense({ foo: 'bar' }, { resolver: new StaticKeyResolver({}) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/malformed/);
  });
});
