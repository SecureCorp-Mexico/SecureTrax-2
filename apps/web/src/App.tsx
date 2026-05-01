import { useEffect, useState } from 'react';
import { MapCanvas } from './map/MapCanvas.js';
import { CapabilitiesPanel } from './ui/CapabilitiesPanel.js';
import { fetchCapabilities, type Capabilities } from './api/capabilities.js';

export function App() {
  const [caps, setCaps] = useState<Capabilities | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    fetchCapabilities()
      .then(setCaps)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <MapCanvas />
      <CapabilitiesPanel caps={caps} error={error} />
    </div>
  );
}
