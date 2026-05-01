export type AuditDecision = 'allowed' | 'denied' | 'info';

export interface AuditEventInput {
  ts?: number;
  tenantId: string;
  subjectId?: string;
  authMethod?: 'jwt' | 'pat' | 'api-key' | 'mtls' | 'system';
  action: string;
  resource?: string;
  decision: AuditDecision;
  reason?: string;
  attrs?: Record<string, unknown>;
}

export interface AuditEvent extends AuditEventInput {
  /** Per-chain monotonic sequence (1-indexed). */
  seq: number;
  ts: number;
  /** sha256(prevHash || canonicalize(rest of fields)) hex. */
  prevHash: string;
  hash: string;
}
