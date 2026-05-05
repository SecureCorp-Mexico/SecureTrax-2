import { Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { WebSocket, type Server } from 'ws';
import type { IncomingMessage } from 'node:http';
import { AuthService } from '../auth/auth.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Principal } from '../iam/principal.js';

interface ClientState {
  principal?: Principal;
  subscriptions: Set<string>;
}

interface InboundMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  topic?: string;
}

/**
 * Multiplexed WebSocket gateway. Clients open `/ws`, send
 *   { "type": "subscribe", "topic": "assets/+/position" }
 * and receive
 *   { "topic": "assets/abc/position", "data": { ... } }
 * frames. Same auth middleware as REST: Bearer / PAT / ApiKey on the
 * upgrade-request headers; `req.principal` is resolved before the socket is
 * accepted. Topic-level RBAC will be enforced once the broadcaster lands —
 * `subscribe` already records the principal so that filter is straightforward.
 */
@WebSocketGateway({ path: '/ws', cors: true })
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly log = new Logger(RealtimeGateway.name);
  private readonly clients = new WeakMap<WebSocket, ClientState>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  afterInit(): void {
    this.log.log('WebSocket gateway online at /ws');
  }

  async handleConnection(client: WebSocket, req: IncomingMessage): Promise<void> {
    // Browsers can't set Authorization on a WebSocket. Accept the same
    // credentials via `?access_token=...`/`?token=...`/`?api_key=...` query
    // params, normalized into header-shaped values for the strategies.
    const headers = { ...req.headers } as Record<string, string | string[] | undefined>;
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const bearer = url.searchParams.get('access_token') ?? url.searchParams.get('token');
      if (bearer && !headers['authorization']) {
        headers['authorization'] = `Bearer ${bearer}`;
      }
      const apiKey = url.searchParams.get('api_key');
      if (apiKey && !headers['x-api-key']) headers['x-api-key'] = apiKey;
    } catch {
      // ignore — fall back to header-only auth
    }

    const principal = await this.auth.authenticate({ headers });
    this.clients.set(client, { principal, subscriptions: new Set() });
    this.audit.append({
      tenantId: principal?.tenantId ?? '<anonymous>',
      subjectId: principal?.subjectId,
      authMethod: principal?.authMethod,
      action: 'ws.connect',
      decision: principal ? 'allowed' : 'info',
      attrs: { remote: req.socket.remoteAddress },
    });

    client.on('message', (raw) => this.onMessage(client, raw));
    client.send(JSON.stringify({ type: 'hello', principal: principal ? { sub: principal.subjectId, tenantId: principal.tenantId } : null }));
  }

  handleDisconnect(client: WebSocket): void {
    this.clients.delete(client);
  }

  private onMessage(client: WebSocket, raw: unknown): void {
    let msg: InboundMessage;
    try {
      msg = JSON.parse(raw?.toString?.() ?? '') as InboundMessage;
    } catch {
      client.send(JSON.stringify({ type: 'error', error: 'invalid JSON' }));
      return;
    }
    const state = this.clients.get(client);
    if (!state) return;
    switch (msg.type) {
      case 'ping':
        client.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        return;
      case 'subscribe':
        if (msg.topic) state.subscriptions.add(msg.topic);
        return;
      case 'unsubscribe':
        if (msg.topic) state.subscriptions.delete(msg.topic);
        return;
      default:
        client.send(JSON.stringify({ type: 'error', error: 'unknown message type' }));
    }
  }

  /** Public broadcast API used by modules to fan out events. */
  broadcast(topic: string, data: unknown): void {
    const payload = JSON.stringify({ topic, data });
    if (!this.server || !this.server.clients) return;
    for (const client of this.server.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      const state = this.clients.get(client);
      if (!state || !subscribed(state.subscriptions, topic)) continue;
      client.send(payload);
    }
  }
}

function subscribed(subs: Set<string>, topic: string): boolean {
  for (const pattern of subs) if (matchesTopic(pattern, topic)) return true;
  return false;
}

/** MQTT-style topic matcher: `+` matches one segment, `#` matches the rest. */
export function matchesTopic(pattern: string, topic: string): boolean {
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
