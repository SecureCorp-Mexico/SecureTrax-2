import type { LicenseClaims } from '@securetrax/module-contracts';

/**
 * Deterministic JSON used for both signing and verification.
 * Keys are sorted recursively; arrays preserve order.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k]))
      .join(',') +
    '}'
  );
}

export function canonicalClaimsBytes(claims: LicenseClaims): Uint8Array {
  return new TextEncoder().encode(canonicalize(claims));
}
