import { useEffect, useState } from 'react';
import { MapCanvas } from './map/MapCanvas.js';
import { CapabilitiesPanel } from './ui/CapabilitiesPanel.js';
import { ChatPanel } from './chat/ChatPanel.js';
import { Videowall } from './videowall/Videowall.js';
import { fetchCapabilities, type Capabilities } from './api/capabilities.js';

export function App() {
  const [caps, setCaps] = useState<Capabilities | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    fetchCapabilities()
      .then(setCaps)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Kiosk mode: ?wall=<layoutId> renders the videowall full-screen.
  const wallId = new URLSearchParams(window.location.search).get('wall');
  if (wallId) {
    const token = localStorage.getItem('securetrax.token') ?? undefined;
    return <Videowall layoutId={wallId} token={token} />;
  }

  const aiEnabled = caps?.modules.some((m) => m.id === 'ai-assistant') ?? false;

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <MapCanvas />
      <CapabilitiesPanel caps={caps} error={error} />
      {aiEnabled && <ChatPanel />}
    </div>
  );
}
