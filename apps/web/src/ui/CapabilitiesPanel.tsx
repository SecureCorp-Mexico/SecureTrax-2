import type { Capabilities } from '../api/capabilities.js';

interface Props {
  caps: Capabilities | undefined;
  error: string | undefined;
}

export function CapabilitiesPanel({ caps, error }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        background: 'rgba(11, 13, 16, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: 14,
        minWidth: 280,
        maxWidth: 360,
        color: '#e6e9ef',
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>SecureTrax-2</div>
      {error ? (
        <div style={{ color: '#ff6b6b' }}>API unreachable: {error}</div>
      ) : !caps ? (
        <div style={{ opacity: 0.6 }}>Loading capabilities…</div>
      ) : (
        <>
          <div style={{ opacity: 0.7, marginBottom: 8 }}>
            tenant: {caps.tenantId ?? '—'} · expires:{' '}
            {caps.licenseExpiresAt
              ? new Date(caps.licenseExpiresAt * 1000).toISOString().slice(0, 10)
              : '—'}
          </div>
          <div style={{ opacity: 0.7, marginBottom: 4 }}>
            Enabled modules ({caps.modules.length})
          </div>
          {caps.modules.length === 0 ? (
            <div style={{ opacity: 0.5, fontStyle: 'italic' }}>
              No license file detected. Drop a signed .lic into ./licenses/ and restart.
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {caps.modules.map((m) => (
                <li key={m.id}>
                  <strong>{m.name}</strong>{' '}
                  <span style={{ opacity: 0.5 }}>
                    ({m.id} · {m.category})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
