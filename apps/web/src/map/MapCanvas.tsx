import { useEffect, useRef } from 'react';
import maplibregl, { Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

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
      // If self-hosted tiles aren't reachable yet (early dev), fall back to OSM raster.
      if (e?.error?.message?.includes('Failed to fetch')) {
        map.setStyle(FALLBACK_STYLE);
      }
    });
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
