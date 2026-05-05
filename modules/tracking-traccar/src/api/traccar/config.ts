export interface TraccarAdapterConfig {
  baseUrl: string;
  email: string;
  password: string;
  tenantId: string;
  /** Reconnect base delay in ms (exponential backoff up to 30s cap). */
  reconnectBaseMs: number;
}

/**
 * Read Traccar adapter config from env. Returns undefined when TRACCAR_URL
 * isn't set, so the adapter cleanly opts out (the rest of tracking-traccar
 * still works via the REST POST and the simulator).
 */
export function readTraccarConfigFromEnv(): TraccarAdapterConfig | undefined {
  const baseUrl = process.env.TRACCAR_URL;
  if (!baseUrl) return undefined;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    email: process.env.TRACCAR_USER ?? 'admin',
    password: process.env.TRACCAR_PASSWORD ?? 'admin',
    tenantId: process.env.TRACCAR_TENANT_ID ?? 'default',
    reconnectBaseMs: Number(process.env.TRACCAR_RECONNECT_BASE_MS ?? 1000),
  };
}
