import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  StaticKeyResolver,
  verifyLicense,
  type LicenseClaims,
} from '@securetrax/core';

export interface LicenseLoadResult {
  enabled: Set<string>;
  claims: LicenseClaims | undefined;
  warnings: string[];
}

/**
 * Synchronous license load used at module-import time so the conditional
 * imports in AppModule can reference the licensed module set. Runtime callers
 * should prefer `LicenseService`.
 */
export function loadLicenseSync(): LicenseLoadResult {
  const out: LicenseLoadResult = {
    enabled: new Set<string>(),
    claims: undefined,
    warnings: [],
  };
  const dir = resolve(process.env.LICENSE_DIR ?? './licenses');
  const keysDir = resolve(process.env.LICENSE_KEYS_DIR ?? './licenses/keys');
  if (!existsSync(dir)) {
    out.warnings.push(`license dir not found at ${dir}`);
    return out;
  }

  const keys: Record<string, string> = {};
  if (existsSync(keysDir)) {
    for (const f of readdirSync(keysDir)) {
      if (!f.endsWith('.pub.pem')) continue;
      const kid = f.replace(/\.pub\.pem$/, '');
      keys[kid] = readFileSync(join(keysDir, f), 'utf8');
    }
  }
  if (Object.keys(keys).length === 0) {
    out.warnings.push('no license public keys found');
    return out;
  }
  const resolver = new StaticKeyResolver(keys);

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.lic')) continue;
    const raw = readFileSync(join(dir, file), 'utf8');
    const result = verifyLicense(raw, { resolver });
    if (!result.ok) {
      out.warnings.push(`license ${file} rejected: ${result.reason}`);
      continue;
    }
    out.claims = result.claims;
    for (const m of result.claims.modules) out.enabled.add(m);
  }
  return out;
}
