import { useEffect, useState } from 'react';
import { fetchEvidence, type ComplianceReport } from '../api/compliance.js';

const FRAMEWORKS = ['ISO/IEC 27001:2022', 'SOC 2', 'IEC 62443', 'GDPR'];

/**
 * Phase-Compliance panel. Lists each control + live status pill + the
 * aggregated evidence bullets. The "Export evidence" button issues a signed
 * JSON download (sha256 in X-Content-Sha256 — the auditor pipeline can pin
 * it to Sigstore/cosign or its own signer).
 */
export function CompliancePanel() {
  const [open, setOpen] = useState(false);
  const [framework, setFramework] = useState<string>('ISO/IEC 27001:2022');
  const [report, setReport] = useState<ComplianceReport | undefined>();
  const [err, setErr] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    setErr(undefined);
    const token = localStorage.getItem('securetrax.token') ?? undefined;
    fetchEvidence(framework, token)
      .then(setReport)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }, [open, framework]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 16,
          top: 16,
          zIndex: 7,
          padding: '6px 12px',
          background: 'rgba(11,13,16,0.85)',
          color: '#e6e9ef',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Compliance
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        top: 16,
        zIndex: 7,
        width: 460,
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(11,13,16,0.96)',
        color: '#e6e9ef',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong>Compliance</strong>
        <select
          value={framework}
          onChange={(e) => setFramework(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.06)',
            color: '#e6e9ef',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            padding: '4px 6px',
            fontSize: 12,
          }}
        >
          {FRAMEWORKS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <a
          href={`/api/v1/compliance/evidence/export?framework=${encodeURIComponent(framework)}`}
          style={{ color: '#39d3ff', fontSize: 12, marginLeft: 'auto' }}
          download
        >
          Export
        </a>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="close"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#e6e9ef',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, fontSize: 13 }}>
        {busy && <div style={{ opacity: 0.6 }}>Loading…</div>}
        {err && <div style={{ color: '#ff4d4d' }}>{err}</div>}
        {report &&
          report.controls.map((c) => (
            <div
              key={`${c.framework}/${c.control}`}
              style={{
                margin: '8px 0',
                padding: 10,
                background: 'rgba(255,255,255,0.04)',
                borderLeft: `3px solid ${statusColor(c.status)}`,
                borderRadius: 4,
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.7 }}>{c.framework}</div>
              <div style={{ fontWeight: 600 }}>
                {c.control} · {c.title}{' '}
                <span style={{ color: statusColor(c.status), fontSize: 11 }}>
                  ● {c.status}
                </span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                {c.narrative}
              </div>
              <ul style={{ margin: '6px 0 0 16px', fontSize: 12, opacity: 0.85 }}>
                {c.evidence.map((e) => (
                  <li key={e.tag}>
                    <span style={{ color: e.ok ? '#3ddc84' : '#ffb020' }}>
                      {e.ok ? '✓' : '!'}
                    </span>{' '}
                    <code>{e.tag}</code> — {e.detail}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </div>
  );
}

function statusColor(s: 'ok' | 'partial' | 'fail'): string {
  return s === 'ok' ? '#3ddc84' : s === 'partial' ? '#ffb020' : '#ff4d4d';
}
