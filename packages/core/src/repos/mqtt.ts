export interface ArchivedMqttMessage {
  tenantId: string;
  ts: number;
  topic: string;
  payload: Record<string, unknown>;
  payloadRaw?: string;
  qos?: 0 | 1 | 2;
  retained?: boolean;
}

export interface IMqttArchiver {
  archive(msg: ArchivedMqttMessage): Promise<void>;
  search(opts: {
    tenantId: string;
    topicLike?: string;
    sinceMs?: number;
    untilMs?: number;
    limit?: number;
  }): Promise<ArchivedMqttMessage[]>;
}

export const SYSTEM_MQTT_ARCHIVER = Symbol.for('securetrax.system-mqtt-archiver');
