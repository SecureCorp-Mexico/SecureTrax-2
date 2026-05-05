import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RealtimeClient } from '../realtime/RealtimeClient.js';
import { MovingAssetsLayer } from './MovingAssetsLayer.js';
import { FixedCamerasLayer } from './FixedCamerasLayer.js';
import { CameraPopup } from './CameraPopup.js';
import { fetchLatestPositions } from '../api/positions.js';
import { fetchCameras } from '../api/cameras.js';
import type { CameraView } from '../api/types.js';

const TILES_URL =
  import.meta.env.VITE_TILES_URL ?? 'http://localhost:8080/styles/basic-preview/style.json';

const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [activeCamera, setActiveCamera] = useState<CameraView | undefined>();

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TILES_URL,
      center: [-99.1332, 19.4326],
      zoom: 5,
      attributionControl: { compact: true },
    });
    map.on('error', (e) => {
      if (e?.error?.message?.includes('Failed to fetch')) {
        map.setStyle(FALLBACK_STYLE);
      }
    });
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
    mapRef.current = map;

    const token = localStorage.getItem('securetrax.token') ?? undefined;
    const rt = new RealtimeClient('/ws', token);
    const movingLayer = new MovingAssetsLayer(map, rt);
    const camerasLayer = new FixedCamerasLayer(map, rt, (cam) => setActiveCamera(cam));

    let detached = false;
    map.on('load', async () => {
      let positions: Awaited<ReturnType<typeof fetchLatestPositions>>['items'] = [];
      let cameras: CameraView[] = [];
      try {
        positions = (await fetchLatestPositions(token)).items;
      } catch {
        /* unauth or none yet */
      }
      try {
        cameras = (await fetchCameras(token)).items;
      } catch {
        /* video-securevu may not be licensed */
      }
      if (!detached) {
        movingLayer.attach(positions);
        camerasLayer.attach(cameras);
      }
    });

    return () => {
      detached = true;
      movingLayer.detach();
      camerasLayer.detach();
      rt.destroy();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {activeCamera && (
        <CameraPopup
          camera={activeCamera}
          onClose={() => setActiveCamera(undefined)}
        />
      )}
    </>
  );
}
