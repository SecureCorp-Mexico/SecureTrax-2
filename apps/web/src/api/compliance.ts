export interface ComplianceEvidence {
  tag: string;
  ts: number;
  ok: boolean;
  detail: string;
}

export interface ComplianceControl {
  framework: string;
  control: string;
  title: string;
  narrative: string;
  evidence: ComplianceEvidence[];
  status: 'ok' | 'partial' | 'fail';
}

export interface ComplianceReport {
  framework: string;
  generatedAtMs: number;
  controls: ComplianceControl[];
}

export async function fetchEvidence(
  framework?: string,
  token?: string,
): Promise<ComplianceReport> {
  const url = new URL('/api/v1/compliance/evidence', location.origin);
  if (framework) url.searchParams.set('framework', framework);
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`compliance evidence: ${res.status}`);
  return (await res.json()) as ComplianceReport;
}
