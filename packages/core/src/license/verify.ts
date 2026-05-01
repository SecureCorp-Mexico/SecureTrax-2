import { createPublicKey, verify as nodeVerify } from 'node:crypto';
import { SignedLicense, type LicenseClaims } from '@securetrax/module-contracts';
import { canonicalClaimsBytes } from './canonical.js';

export type LicenseVerifyResult =
  | { ok: true; claims: LicenseClaims }
  | { ok: false; reason: string };

export interface KeyResolver {
  resolve(kid: string): string | undefined;
}

export class StaticKeyResolver implements KeyResolver {
  constructor(private readonly keys: Record<string, string>) {}
  resolve(kid: string): string | undefined {
    return this.keys[kid];
  }
}

export interface VerifyOptions {
  resolver: KeyResolver;
  now?: () => number;
  hardwareFingerprint?: string;
}

export function verifyLicense(
  raw: string | unknown,
  opts: VerifyOptions,
): LicenseVerifyResult {
  let parsed: unknown;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'license is not valid JSON' };
    }
  } else {
    parsed = raw;
  }

  const license = SignedLicense.safeParse(parsed);
  if (!license.success) {
    return { ok: false, reason: `malformed license: ${license.error.message}` };
  }
  const { claims, sig, kid, alg } = license.data;
  if (alg !== 'Ed25519') return { ok: false, reason: `unsupported alg ${alg}` };

  const pem = opts.resolver.resolve(kid);
  if (!pem) return { ok: false, reason: `unknown kid ${kid}` };

  let pubKey;
  try {
    pubKey = createPublicKey(pem);
  } catch (e) {
    return { ok: false, reason: `invalid public key for kid ${kid}` };
  }

  const sigBytes = Buffer.from(sig, 'base64');
  const msg = canonicalClaimsBytes(claims);
  const ok = nodeVerify(null, msg, pubKey, sigBytes);
  if (!ok) return { ok: false, reason: 'signature verification failed' };

  const now = (opts.now ?? Date.now)();
  if (now < claims.notBefore * 1000)
    return { ok: false, reason: 'license not yet valid' };
  if (now > claims.notAfter * 1000)
    return { ok: false, reason: 'license expired' };

  if (claims.hardwareFingerprint && opts.hardwareFingerprint) {
    if (claims.hardwareFingerprint !== opts.hardwareFingerprint) {
      return { ok: false, reason: 'hardware fingerprint mismatch' };
    }
  }

  return { ok: true, claims };
}
