import type { TopicMapping } from './mapping.types.js';

export const MAPPINGS_REPOSITORY = Symbol.for('securetrax.mqtt-mappings-repository');

export interface IMappingsRepository {
  list(tenantId: string): Promise<TopicMapping[]>;
  get(tenantId: string, id: string): Promise<TopicMapping | undefined>;
  upsert(m: Omit<TopicMapping, 'id'> & { id?: string }): Promise<TopicMapping>;
  delete(tenantId: string, id: string): Promise<void>;
}
