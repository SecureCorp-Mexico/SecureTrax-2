export interface CapabilityModule {
  id: string;
  name: string;
  version: string;
  category: 'fixed' | 'vehicle' | 'aircraft' | 'core';
  mapLayers: string[];
  api: {
    rest?: string;
    ws: string[];
    mqtt: string[];
    webhooks: string[];
    permissions: string[];
  };
}

export interface Capabilities {
  tenantId?: string;
  licenseExpiresAt?: number;
  enabled: string[];
  modules: CapabilityModule[];
}

export async function fetchCapabilities(): Promise<Capabilities> {
  const res = await fetch('/api/v1/capabilities');
  if (!res.ok) throw new Error(`capabilities request failed: ${res.status}`);
  return (await res.json()) as Capabilities;
}
