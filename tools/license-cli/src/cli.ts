#!/usr/bin/env node
import {
  generateKeyPairSync,
  sign as nodeSign,
  createPrivateKey,
  randomUUID,
} from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  LicenseClaims,
  SignedLicense,
  type SignedLicense as SignedLicenseT,
} from '@securetrax/module-contracts';
import {
  StaticKeyResolver,
  canonicalize,
  verifyLicense,
} from '@securetrax/core';

function parseArgs(argv: string[]): { cmd: string; args: Record<string, string> } {
  const [cmd, ...rest] = argv;
  const args: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a?.startsWith('--')) {
      const k = a.slice(2);
      const v = rest[i + 1] && !rest[i + 1]!.startsWith('--') ? rest[++i] : 'true';
      args[k] = v ?? 'true';
    }
  }
  return { cmd: cmd ?? '', args };
}

function ensureDir(p: string): void {
  mkdirSync(dirname(resolve(p)), { recursive: true });
}

function keygen(args: Record<string, string>): void {
  const out = args.out ?? './licenses/keys';
  const kid = args.kid ?? `key-${new Date().toISOString().slice(0, 10)}`;
  mkdirSync(resolve(out), { recursive: true });
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubPath = resolve(out, `${kid}.pub.pem`);
  const privPath = resolve(out, `${kid}.priv.pem`);
  writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }));
  writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  // eslint-disable-next-line no-console
  console.log(`wrote ${pubPath} and ${privPath} (kid=${kid})`);
}

function sign(args: Record<string, string>): void {
  const tenant = args.tenant ?? 'default';
  const modules = (args.modules ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const days = Number(args.days ?? '365');
  const kid = args.kid;
  const privPath = args.priv ?? (kid ? `./licenses/keys/${kid}.priv.pem` : '');
  const out = args.out ?? `./licenses/${tenant}.lic`;
  if (!kid) throw new Error('--kid is required');
  if (!privPath) throw new Error('--priv path required');

  const now = Math.floor(Date.now() / 1000);
  const claims = LicenseClaims.parse({
    iss: 'securetrax-license-cli',
    sub: tenant,
    tenantId: tenant,
    modules,
    notBefore: now,
    notAfter: now + days * 86400,
    features: {},
    jti: randomUUID(),
  });

  const priv = createPrivateKey(readFileSync(resolve(privPath)));
  const msg = Buffer.from(canonicalize(claims), 'utf8');
  const sig = nodeSign(null, msg, priv).toString('base64');

  const license: SignedLicenseT = SignedLicense.parse({
    v: 1,
    claims,
    alg: 'Ed25519',
    kid,
    sig,
  });
  ensureDir(out);
  writeFileSync(resolve(out), JSON.stringify(license, null, 2));
  // eslint-disable-next-line no-console
  console.log(
    `signed license -> ${out} (modules=${modules.length === 0 ? '<none>' : modules.join(',')}, expires in ${days}d)`,
  );
}

function verify(args: Record<string, string>): void {
  const file = args.file ?? './licenses/default.lic';
  const keysDir = args['keys-dir'] ?? './licenses/keys';
  const raw = readFileSync(resolve(file), 'utf8');
  const keys: Record<string, string> = {};
  for (const f of readdirSync(resolve(keysDir))) {
    if (!f.endsWith('.pub.pem')) continue;
    keys[f.replace(/\.pub\.pem$/, '')] = readFileSync(join(resolve(keysDir), f), 'utf8');
  }
  const result = verifyLicense(raw, { resolver: new StaticKeyResolver(keys) });
  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error(`INVALID: ${result.reason}`);
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  console.log(`VALID: tenant=${result.claims.tenantId} modules=[${result.claims.modules.join(', ')}] expiresAt=${new Date(result.claims.notAfter * 1000).toISOString()}`);
}

const { cmd, args } = parseArgs(process.argv.slice(2));
try {
  switch (cmd) {
    case 'keygen':
      keygen(args);
      break;
    case 'sign':
      sign(args);
      break;
    case 'verify':
      verify(args);
      break;
    default:
      // eslint-disable-next-line no-console
      console.log(
        `usage:\n  securetrax-license keygen [--out ./licenses/keys] [--kid <id>]\n  securetrax-license sign --kid <id> --tenant <t> --modules a,b,c [--days 365] [--priv <pem>] [--out <path>]\n  securetrax-license verify --file <license.lic> [--keys-dir <dir>]\n`,
      );
      process.exit(cmd === '' ? 0 : 1);
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
