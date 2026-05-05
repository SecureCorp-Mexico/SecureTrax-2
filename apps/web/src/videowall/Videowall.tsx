import { useEffect, useRef, useState } from 'react';
import { fetchLayout, type VideowallLayout } from '../api/videowall.js';
import { fetchCameras } from '../api/cameras.js';
import type { CameraView } from '../api/types.js';
import { RealtimeClient } from '../realtime/RealtimeClient.js';

interface Props {
  layoutId: string;
  token?: string;
}

const PRESET_GRID: Record<VideowallLayout['preset'], string> = {
  '1x1': '1fr / 1fr',
  '2x2': 'repeat(2, 1fr) / repeat(2, 1fr)',
  '3x3': 'repeat(3, 1fr) / repeat(3, 1fr)',
  '4x4': 'repeat(4, 1fr) / repeat(4, 1fr)',
  // 1 big + 5 small: 2-row, 3-col with the big spanning the full first row
  '1+5': '2fr 1fr / repeat(3, 1fr)',
  '1+7': '2fr 1fr 1fr / repeat(4, 1fr)',
  '1+12': '2fr repeat(3, 1fr) / repeat(4, 1fr)',
  custom: '',
};

/**
 * Phase-7 videowall surface. Loads a saved layout and renders a CSS-grid of
 * tiles, each tile playing the bound stream (HLS for simplicity here — the
 * WebRTC popup path lives in CameraPopup). Subscribes to videowall/<id>/sync
 * so any live edit pushes to every connected display in real time.
 */
export function Videowall({ layoutId, token }: Props) {
  const [layout, setLayout] = useState<VideowallLayout | undefined>();
  const [cams, setCams] = useState<Record<string, CameraView>>({});
  const [err, setErr] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [l, camResp] = await Promise.all([
          fetchLayout(layoutId, token),
          fetchCameras(token).catch(() => ({ items: [] as CameraView[] })),
        ]);
        if (cancelled) return;
        const lookup: Record<string, CameraView> = {};
        for (const c of camResp.items) lookup[c.streamId] = c;
        setCams(lookup);
        setLayout(l);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();

    const rt = new RealtimeClient('/ws', token);
    const unsub = rt.subscribe<VideowallLayout>(
      `videowall/${layoutId}/sync`,
      (next) => {
        if (next?.id === layoutId) setLayout(next);
      },
    );
    return () => {
      cancelled = true;
      unsub();
      rt.destroy();
    };
  }, [layoutId, token]);

  if (err) {
    return (
      <div style={{ color: '#ff4d4d', padding: 16, fontFamily: 'system-ui' }}>
        {err}
      </div>
    );
  }
  if (!layout) {
    return (
      <div style={{ color: '#e6e9ef', padding: 16, fontFamily: 'system-ui' }}>
        Loading wall {layoutId}…
      </div>
    );
  }

  const grid = layout.preset === 'custom'
    ? layout.customGrid ?? ''
    : PRESET_GRID[layout.preset];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        display: 'grid',
        grid,
        gap: 4,
        padding: 4,
        boxSizing: 'border-box',
      }}
    >
      {layout.cells.map((c, i) => (
        <Tile key={i} cell={c} cam={c.streamId ? cams[c.streamId] : undefined} />
      ))}
    </div>
  );
}

function Tile({
  cell,
  cam,
}: {
  cell: VideowallLayout['cells'][number];
  cam?: CameraView;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v || !cam?.hlsUrl) return;
    v.src = cam.hlsUrl;
    v.muted = !cell.audio;
    v.autoplay = true;
    v.playsInline = true;
    void v.play().catch(() => {
      /* autoplay may be blocked */
    });
    return () => {
      v.removeAttribute('src');
      v.load();
    };
  }, [cam?.hlsUrl, cell.audio]);

  if (!cam) {
    return (
      <div
        style={{
          background: '#111',
          color: '#e6e9ef',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          opacity: 0.7,
        }}
      >
        {cell.streamId ? `Unknown stream: ${cell.streamId}` : 'Empty tile'}
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', background: '#000', overflow: 'hidden' }}>
      <video
        ref={ref}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div
        style={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          padding: '2px 6px',
          background: 'rgba(11,13,16,0.7)',
          color: '#e6e9ef',
          fontSize: 11,
          borderRadius: 3,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {cell.label ?? cam.name}
      </div>
    </div>
  );
}
