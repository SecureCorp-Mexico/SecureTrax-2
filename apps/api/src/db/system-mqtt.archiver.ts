import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { SystemContextService } from './system-context.service.js';
import { mqttMessages } from './schema.js';

export interface ArchivedMqttMessage {
  tenantId: string;
  ts: number;
  topic: string;
  payload: Record<string, unknown>;
  payloadRaw?: string;
  qos?: 0 | 1 | 2;
  retained?: boolean;
}

/**
 * System-context writer for the rolling `mqtt_messages` archive that powers
 * the AI assistant's `mqtt_search` tool. Archive retention is enforced by a
 * separate Timescale retention policy (added with the data-retention slice).
 */
@Injectable()
export class SystemMqttArchiver {
  constructor(private readonly sys: SystemContextService) {}

  async archive(msg: ArchivedMqttMessage): Promise<void> {
    await this.sys.withTenant(msg.tenantId, async (db) => {
      await db.insert(mqttMessages).values({
        tenantId: msg.tenantId,
        ts: new Date(msg.ts),
        topic: msg.topic,
        payload: msg.payload,
        payloadRaw: msg.payloadRaw ?? null,
        qos: msg.qos ?? 0,
        retained: msg.retained ?? false,
      });
    });
  }

  /** Topic-pattern + time-range search. Used by the future AI `mqtt_search` tool. */
  async search(opts: {
    tenantId: string;
    topicLike?: string;
    sinceMs?: number;
    untilMs?: number;
    limit?: number;
  }): Promise<ArchivedMqttMessage[]> {
    const limit = Math.min(opts.limit ?? 100, 1000);
    return this.sys.withTenant(opts.tenantId, async (db) => {
      // Hand-built predicate to keep this readable; the unified QueryService
      // (shared with the AI assistant's `mqtt_search`) lands later.
      const since = opts.sinceMs ? new Date(opts.sinceMs) : null;
      const until = opts.untilMs ? new Date(opts.untilMs) : null;
      const result = await db.execute<{
        tenant_id: string;
        ts: Date;
        topic: string;
        payload: Record<string, unknown>;
        payload_raw: string | null;
        qos: number;
        retained: boolean;
      }>(sql`
        SELECT tenant_id, ts, topic, payload, payload_raw, qos, retained
        FROM mqtt_messages
        WHERE 1=1
          ${opts.topicLike ? sql`AND topic LIKE ${opts.topicLike}` : sql``}
          ${since ? sql`AND ts >= ${since}` : sql``}
          ${until ? sql`AND ts <= ${until}` : sql``}
        ORDER BY ts DESC
        LIMIT ${limit}
      `);
      return result.rows.map((r) => ({
        tenantId: r.tenant_id,
        ts: r.ts.getTime(),
        topic: r.topic,
        payload: r.payload,
        payloadRaw: r.payload_raw ?? undefined,
        qos: r.qos as 0 | 1 | 2,
        retained: r.retained,
      }));
    });
  }
}
