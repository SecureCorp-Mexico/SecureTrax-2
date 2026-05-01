import { z } from 'zod';

export const LicenseClaims = z.object({
  iss: z.string().min(1),
  sub: z.string().min(1),
  tenantId: z.string().min(1),
  modules: z.array(z.string()).default([]),
  notBefore: z.number().int(),
  notAfter: z.number().int(),
  hardwareFingerprint: z.string().optional(),
  features: z.record(z.unknown()).default({}),
  jti: z.string().min(1),
});
export type LicenseClaims = z.infer<typeof LicenseClaims>;

export const SignedLicense = z.object({
  v: z.literal(1),
  claims: LicenseClaims,
  alg: z.literal('Ed25519'),
  kid: z.string().min(1),
  sig: z.string().min(1),
});
export type SignedLicense = z.infer<typeof SignedLicense>;
