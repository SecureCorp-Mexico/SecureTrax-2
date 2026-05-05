import { WebSocket } from 'ws';
import type { TraccarDevice, TraccarSocketFrame } from './types.js';

export interface TraccarClientConfig {
  baseUrl: string;
  email: string;
  password: string;
}

/**
 * Thin HTTP + WS client for Traccar. Stateless from the consumer's view: the
 * adapter calls `connect()` once on startup; the returned handle exposes the
 * frame stream + a `close()` for shutdown. Reconnection is the adapter's
 * job (it owns the supervisory loop).
 */
export class TraccarClient {
  private cookie?: string;

  constructor(private readonly cfg: TraccarClientConfig) {}

  /** POST /api/session — returns the JSESSIONID cookie used by /api/socket. */
  async login(): Promise<void> {
    const body = new URLSearchParams({
      email: this.cfg.email,
      password: this.cfg.password,
    });
    const res = await fetch(`${this.cfg.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error(`traccar login failed: ${res.status} ${res.statusText}`);
    }
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) throw new Error('traccar login: no Set-Cookie returned');
    // Strip attributes (Path=, HttpOnly, ...). We just need name=value.
    const first = setCookie.split(';')[0]!;
    this.cookie = first;
  }

  async listDevices(): Promise<TraccarDevice[]> {
    const res = await fetch(`${this.cfg.baseUrl}/api/devices`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`traccar listDevices: ${res.status}`);
    return (await res.json()) as TraccarDevice[];
  }

  /** Open the live frame stream. The caller wires onFrame / onClose / onError. */
  openSocket(handlers: {
    onFrame: (frame: TraccarSocketFrame) => void;
    onOpen?: () => void;
    onClose?: (code: number, reason: string) => void;
    onError?: (err: Error) => void;
  }): { close: () => void } {
    const wsUrl = this.cfg.baseUrl.replace(/^http/, 'ws') + '/api/socket';
    const ws = new WebSocket(wsUrl, { headers: this.authHeaders() });
    ws.on('open', () => handlers.onOpen?.());
    ws.on('close', (code, reason) =>
      handlers.onClose?.(code, reason.toString('utf8')),
    );
    ws.on('error', (err) => handlers.onError?.(err));
    ws.on('message', (raw) => {
      try {
        const frame = JSON.parse(raw.toString('utf8')) as TraccarSocketFrame;
        handlers.onFrame(frame);
      } catch {
        // ignore malformed frames; Traccar should never emit them, but be safe
      }
    });
    return {
      close: () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      },
    };
  }

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = { accept: 'application/json' };
    if (this.cookie) h['cookie'] = this.cookie;
    return h;
  }
}
