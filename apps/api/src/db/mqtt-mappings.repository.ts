import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  type IMappingsRepository,
  type TopicMapping,
} from '@securetrax/module-telemetry-mqtt';
import { SystemContextService } from './system-context.service.js';
import { mqttTopicMappings } from './schema.js';

@Injectable()
export class MqttMappingsRepository implements IMappingsRepository {
  constructor(private readonly sys: SystemContextService) {}

  async list(tenantId: string): Promise<TopicMapping[]> {
    return this.sys.withTenant(tenantId, async (db) => {
      const rows = await db.select().from(mqttTopicMappings);
      return rows.map(toMapping);
    });
  }

  async get(tenantId: string, id: string): Promise<TopicMapping | undefined> {
    return this.sys.withTenant(tenantId, async (db) => {
      const rows = await db
        .select()
        .from(mqttTopicMappings)
        .where(eq(mqttTopicMappings.id, id))
        .limit(1);
      return rows[0] ? toMapping(rows[0]) : undefined;
    });
  }

  async upsert(
    m: Omit<TopicMapping, 'id'> & { id?: string },
  ): Promise<TopicMapping> {
    return this.sys.withTenant(m.tenantId, async (db) => {
      const values = {
        tenantId: m.tenantId,
        name: m.name,
        topicPattern: m.topicPattern,
        payloadKind: m.payloadKind,
        eventType: m.eventType,
        rules: m.rules,
        enabled: m.enabled,
        priority: m.priority,
      };
      if (m.id) {
        const existing = await db
          .select()
          .from(mqttTopicMappings)
          .where(
            and(
              eq(mqttTopicMappings.id, m.id),
              eq(mqttTopicMappings.tenantId, m.tenantId),
            ),
          )
          .limit(1);
        if (existing[0]) {
          await db
            .update(mqttTopicMappings)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(mqttTopicMappings.id, m.id));
          const after = await db
            .select()
            .from(mqttTopicMappings)
            .where(eq(mqttTopicMappings.id, m.id))
            .limit(1);
          return toMapping(after[0]!);
        }
      }
      const inserted = await db
        .insert(mqttTopicMappings)
        .values(values)
        .returning();
      return toMapping(inserted[0]!);
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.sys.withTenant(tenantId, async (db) => {
      await db
        .delete(mqttTopicMappings)
        .where(
          and(
            eq(mqttTopicMappings.id, id),
            eq(mqttTopicMappings.tenantId, tenantId),
          ),
        );
    });
  }
}

function toMapping(r: typeof mqttTopicMappings.$inferSelect): TopicMapping {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    topicPattern: r.topicPattern,
    payloadKind: r.payloadKind as 'json' | 'text',
    eventType: r.eventType as 'position' | 'telemetry' | 'alert',
    rules: r.rules,
    enabled: r.enabled,
    priority: r.priority,
  };
}
