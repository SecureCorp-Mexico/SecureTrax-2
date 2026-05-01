/**
 * Compliance control map — Annex A (ISO/IEC 27001:2022) + SOC 2 Trust
 * Service Criteria + IEC 62443 zone/conduit highlights, mapped to the
 * SecureTrax-2 features that satisfy them. Each entry points at:
 *   - the framework + control id (the auditor's anchor)
 *   - a short narrative explaining how SecureTrax-2 satisfies it
 *   - an `evidence` callsite tag — the backend resolves it to a live
 *     evidence object so the auditor sees current state, not slideware.
 */

export type Framework =
  | 'ISO/IEC 27001:2022'
  | 'SOC 2'
  | 'IEC 62443'
  | 'GDPR'
  | 'NIST 800-53';

export interface ControlMapEntry {
  framework: Framework;
  control: string;
  title: string;
  narrative: string;
  evidence: EvidenceTag[];
}

export type EvidenceTag =
  | 'iam.role-presets'
  | 'iam.role-assignments'
  | 'iam.permissions'
  | 'iam.separation-of-duties'
  | 'iam.mfa-configured-roles'
  | 'auth.strategies'
  | 'auth.tls'
  | 'auth.jwt-issuer'
  | 'audit.head'
  | 'audit.chain-verified'
  | 'audit.recent-decisions'
  | 'rls.enforced-tables'
  | 'rls.session-vars'
  | 'mqtt.archive-retention'
  | 'license.head'
  | 'license.cipher'
  | 'flight.deploy-key'
  | 'flight.approval-policy'
  | 'data.classification'
  | 'data.dsar-endpoints';

export const CONTROL_MAP: ControlMapEntry[] = [
  // ───────── ISO/IEC 27001:2022 Annex A ─────────
  {
    framework: 'ISO/IEC 27001:2022',
    control: 'A.5.15',
    title: 'Access control',
    narrative:
      'Access is governed by the namespaced permission catalog and hierarchical resource scopes (tenant → site → group → device). Authorization is enforced in three layers (controller guard, repository scope filter, Postgres row-level security).',
    evidence: ['iam.role-presets', 'iam.permissions', 'rls.enforced-tables'],
  },
  {
    framework: 'ISO/IEC 27001:2022',
    control: 'A.5.16',
    title: 'Identity management',
    narrative:
      'Local accounts and SSO (SAML/OIDC) federate via Keycloak. Step-up MFA is required for sensitive actions. Personal Access Tokens and API keys are stored hashed with constant-time compare.',
    evidence: ['auth.strategies', 'auth.jwt-issuer', 'iam.mfa-configured-roles'],
  },
  {
    framework: 'ISO/IEC 27001:2022',
    control: 'A.5.18',
    title: 'Access rights',
    narrative:
      'Role assignments use exclusive_with constraints to enforce separation of duties (e.g. FlightAuthor cannot also approve flights). Authoring versus approval keys are operationally separated.',
    evidence: ['iam.separation-of-duties', 'flight.approval-policy'],
  },
  {
    framework: 'ISO/IEC 27001:2022',
    control: 'A.8.15',
    title: 'Logging',
    narrative:
      'Append-only audit log with sha256 hash chain. Every authorization decision (allowed and denied) is logged with subject, action, resource, decision, and reason.',
    evidence: ['audit.head', 'audit.recent-decisions'],
  },
  {
    framework: 'ISO/IEC 27001:2022',
    control: 'A.8.16',
    title: 'Monitoring activities',
    narrative:
      'Daily anchor of the audit-chain head to a WORM store provides tamper detection. Hash-chain integrity is verifiable on demand via `compliance-check verify-audit-chain`.',
    evidence: ['audit.chain-verified', 'audit.head'],
  },
  {
    framework: 'ISO/IEC 27001:2022',
    control: 'A.8.24',
    title: 'Use of cryptography',
    narrative:
      'TLS 1.3 only at the edge. License files signed with Ed25519. Flight deploy commands and plan approvals signed with separate Ed25519 keypairs (deploy key pinned in the onboard sidecar). Vault-managed key rotation.',
    evidence: ['auth.tls', 'license.cipher', 'flight.deploy-key'],
  },
  {
    framework: 'ISO/IEC 27001:2022',
    control: 'A.8.32',
    title: 'Change management',
    narrative:
      'Flight plans are versioned and any change to the canonical body invalidates prior approvals. License changes go through Ed25519-signed file rotation with audit trail.',
    evidence: ['flight.approval-policy', 'license.head'],
  },

  // ───────── SOC 2 Trust Service Criteria ─────────
  {
    framework: 'SOC 2',
    control: 'CC6.1',
    title: 'Logical access — restrict access',
    narrative:
      'Three-layer authorization with row-level security as the defense-in-depth backstop. Every tenant-scoped table FORCEs RLS so even a buggy query cannot leak across tenants.',
    evidence: ['rls.enforced-tables', 'rls.session-vars', 'iam.permissions'],
  },
  {
    framework: 'SOC 2',
    control: 'CC6.6',
    title: 'Logical access — boundary protection',
    narrative:
      'Per-device X.509 mTLS for MQTT/WS/HTTP ingest from edge devices. JWT bearer + Personal Access Tokens + Machine API keys + mTLS feed one authorization layer; key rotation managed via Vault.',
    evidence: ['auth.strategies', 'auth.tls'],
  },
  {
    framework: 'SOC 2',
    control: 'CC7.2',
    title: 'System monitoring',
    narrative:
      'Hash-chained audit log + per-module security event feed. Authorization denials are logged with the same weight as allows (CC6.1 + CC7.2 evidentiary requirement).',
    evidence: ['audit.head', 'audit.recent-decisions'],
  },

  // ───────── IEC 62443 (industrial / OT) ─────────
  {
    framework: 'IEC 62443',
    control: 'SR 1.1',
    title: 'Human user identification and authentication',
    narrative:
      'Operator identity is federated via Keycloak; sensitive operator actions (flight deploy, license rotate) require step-up MFA.',
    evidence: ['auth.strategies', 'iam.mfa-configured-roles'],
  },
  {
    framework: 'IEC 62443',
    control: 'SR 1.2',
    title: 'Software process and device identification and authentication',
    narrative:
      'Every device authenticates to the platform via per-device X.509 from the platform CA, with auto-rotation. The same asset id used in user RBAC scopes is the device auth identity.',
    evidence: ['auth.tls'],
  },
  {
    framework: 'IEC 62443',
    control: 'SR 6.1',
    title: 'Audit log accessibility',
    narrative:
      'Audit log exposed via REST + signed PDF export. Hash-chain anchor enables non-repudiation across the engagement window.',
    evidence: ['audit.head', 'audit.chain-verified'],
  },

  // ───────── GDPR ─────────
  {
    framework: 'GDPR',
    control: 'Art. 15',
    title: 'Right of access',
    narrative:
      "Data Subject Access Requests are served via /v1/privacy/export — every PII record across positions / telemetry / video metadata in the subject's scope is bundled and returned.",
    evidence: ['data.dsar-endpoints', 'data.classification'],
  },
  {
    framework: 'GDPR',
    control: 'Art. 17',
    title: 'Right to erasure',
    narrative:
      '/v1/privacy/erase tombstones the data subject and cascades through canonical stores. The audit log retains the erasure event; redaction of historical content is supported via memory_versions.redact-style tooling.',
    evidence: ['data.dsar-endpoints'],
  },
];

export function frameworks(): Framework[] {
  return Array.from(new Set(CONTROL_MAP.map((c) => c.framework))) as Framework[];
}
