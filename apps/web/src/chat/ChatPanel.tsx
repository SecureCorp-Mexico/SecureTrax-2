import { useState } from 'react';
import { chat, type ChatMessage, type ChatToolCallLog } from '../api/chat.js';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ChatToolCallLog[];
}

/**
 * Phase-4 docked chat panel. Posts to /api/v1/ai/chat and renders the
 * assistant text plus a small "tools used" log so operators can see exactly
 * which DB / MQTT queries the assistant ran on their behalf — citations are
 * the trust boundary.
 */
export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>();

  async function send(): Promise<void> {
    const text = input.trim();
    if (!text) return;
    setBusy(true);
    setErr(undefined);
    const next: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setInput('');
    try {
      const messages: ChatMessage[] = next.map((t) => ({
        role: t.role,
        content: t.content,
      }));
      const token = localStorage.getItem('securetrax.token') ?? undefined;
      const res = await chat(messages, { token });
      setTurns([
        ...next,
        { role: 'assistant', content: res.text, toolCalls: res.toolCalls },
      ]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 16,
          bottom: 16,
          zIndex: 8,
          padding: '10px 16px',
          background: '#39d3ff',
          color: '#0b0d10',
          border: 'none',
          borderRadius: 8,
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}
      >
        Ask the assistant
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 8,
        width: 420,
        maxHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(11,13,16,0.96)',
        color: '#e6e9ef',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <strong>Assistant</strong>
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

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, fontSize: 14 }}>
        {turns.length === 0 && (
          <div style={{ opacity: 0.6, fontSize: 12 }}>
            Try: <em>"Where was vehicle SIM-03 in the last hour?"</em> or{' '}
            <em>"Did any router publish lte_rsrp below -110 today?"</em>
          </div>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            style={{
              margin: '8px 0',
              padding: 8,
              borderRadius: 6,
              background:
                t.role === 'user' ? 'rgba(57,211,255,0.12)' : 'rgba(255,255,255,0.05)',
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
              {t.role}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{t.content || '(empty)'}</div>
            {t.toolCalls && t.toolCalls.length > 0 && (
              <details style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                <summary>tools used ({t.toolCalls.length})</summary>
                <ul style={{ margin: '4px 0 0 16px' }}>
                  {t.toolCalls.map((c, j) => (
                    <li key={j}>
                      <code>
                        {c.name}({JSON.stringify(c.input)})
                      </code>{' '}
                      {c.ok ? '✓' : '✗'}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
        {err && (
          <div style={{ color: '#ff4d4d', fontSize: 12, marginTop: 6 }}>
            {err}
          </div>
        )}
      </div>

      <div
        style={{
          padding: 8,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          gap: 6,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!busy) void send();
            }
          }}
          disabled={busy}
          placeholder="Ask about assets, positions, MQTT…"
          style={{
            flex: 1,
            padding: 8,
            background: 'rgba(255,255,255,0.06)',
            color: '#e6e9ef',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            fontSize: 14,
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || input.trim().length === 0}
          style={{
            padding: '0 14px',
            background: '#39d3ff',
            color: '#0b0d10',
            border: 'none',
            borderRadius: 4,
            cursor: busy ? 'wait' : 'pointer',
            fontWeight: 600,
          }}
        >
          {busy ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
