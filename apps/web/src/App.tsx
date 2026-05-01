import { useEffect, useState } from 'react';
import { MapCanvas } from './map/MapCanvas.js';
import { CapabilitiesPanel } from './ui/CapabilitiesPanel.js';
import { ChatPanel } from './chat/ChatPanel.js';
import { fetchCapabilities, type Capabilities } from './api/capabilities.js';

export function App() {
  const [caps, setCaps] = useState<Capabilities | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    fetchCapabilities()
      .then(setCaps)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const aiEnabled = caps?.modules.some((m) => m.id === 'ai-assistant') ?? false;

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <MapCanvas />
      <CapabilitiesPanel caps={caps} error={error} />
      {aiEnabled && <ChatPanel />}
    </div>
  );
}
