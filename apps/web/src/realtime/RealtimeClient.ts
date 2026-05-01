type Listener<T> = (data: T, topic: string) => void;

/**
 * Minimal WS client over the SecureTrax-2 `/ws` gateway. MQTT-style topic
 * patterns (+/#) are supported server-side; client just sends the literal
 * subscribe pattern. Auto-reconnects with exponential backoff.
 */
export class RealtimeClient {
  private ws?: WebSocket;
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();
  private readonly subs = new Set<string>();
  private retry = 0;
  private destroyed = false;

  constructor(private readonly url: string, private readonly token?: string) {
    this.connect();
  }

  private connect(): void {
    if (this.destroyed) return;
    const u = new URL(this.url, location.origin);
    if (this.token) u.searchParams.set('access_token', this.token);
    u.protocol = u.protocol.replace(/^http/, 'ws');
    const ws = new WebSocket(u.toString());
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.retry = 0;
      for (const topic of this.subs) ws.send(JSON.stringify({ type: 'subscribe', topic }));
    });
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { topic?: string; data?: unknown };
        if (!msg.topic) return;
        for (const [pattern, set] of this.listeners) {
          if (matchesTopic(pattern, msg.topic)) {
            for (const fn of set) fn(msg.data, msg.topic);
          }
        }
      } catch {
        // ignore malformed frames
      }
    });
    ws.addEventListener('close', () => {
      if (this.destroyed) return;
      const delay = Math.min(30_000, 500 * Math.pow(2, this.retry++));
      setTimeout(() => this.connect(), delay);
    });
    ws.addEventListener('error', () => ws.close());
  }

  subscribe<T>(topic: string, fn: Listener<T>): () => void {
    this.subs.add(topic);
    let set = this.listeners.get(topic);
    if (!set) {
      set = new Set();
      this.listeners.set(topic, set);
    }
    set.add(fn as Listener<unknown>);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', topic }));
    }
    return () => {
      set?.delete(fn as Listener<unknown>);
      if (set?.size === 0) {
        this.listeners.delete(topic);
        this.subs.delete(topic);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'unsubscribe', topic }));
        }
      }
    };
  }

  destroy(): void {
    this.destroyed = true;
    this.ws?.close();
  }
}

function matchesTopic(pattern: string, topic: string): boolean {
  const pp = pattern.split('/');
  const tp = topic.split('/');
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i];
    if (p === '#') return true;
    if (i >= tp.length) return false;
    if (p === '+') continue;
    if (p !== tp[i]) return false;
  }
  return pp.length === tp.length;
}
