import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import type { Position } from '../api/types.js';
import { RealtimeClient } from '../realtime/RealtimeClient.js';

const SOURCE_ID = 'moving-assets';
const LAYER_DOTS = 'moving-assets-dots';
const LAYER_LABELS = 'moving-assets-labels';
const CLUSTER_LAYER = 'moving-assets-clusters';
const CLUSTER_COUNT_LAYER = 'moving-assets-cluster-count';

interface FeatureProps {
  assetId: string;
  ts: number;
  speed: number;
  heading: number;
}

/**
 * Holds the live positions of every moving asset and writes them into a
 * clustered MapLibre GeoJSON source. Source data updates on every WS frame.
 *
 * Phase-1 form factor: clustered DOM-free symbol layer good for hundreds-to-
 * a-few-thousand markers. The MVT vector-tile feed for very large fleets is
 * deferred (planned in section 2 of the architectural plan).
 */
export class MovingAssetsLayer {
  private readonly positions = new Map<string, Position>();
  private unsub?: () => void;

  constructor(private readonly map: MlMap, private readonly rt: RealtimeClient) {}

  attach(initial: Position[]): void {
    for (const p of initial) this.positions.set(p.assetId, p);
    this.ensureSourceAndLayers();
    this.flush();
    this.unsub = this.rt.subscribe<Position>('assets/+/position', (p) => {
      if (!p?.assetId) return;
      this.positions.set(p.assetId, p);
      this.flush();
    });
  }

  detach(): void {
    this.unsub?.();
    this.unsub = undefined;
  }

  private ensureSourceAndLayers(): void {
    if (this.map.getSource(SOURCE_ID)) return;
    this.map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterRadius: 40,
      clusterMaxZoom: 14,
    });
    this.map.addLayer({
      id: CLUSTER_LAYER,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#39d3ff',
        'circle-opacity': 0.85,
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          14, 10, 18, 50, 22,
        ],
        'circle-stroke-color': 'rgba(255,255,255,0.9)',
        'circle-stroke-width': 1.5,
      },
    });
    this.map.addLayer({
      id: CLUSTER_COUNT_LAYER,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-size': 12,
      },
      paint: { 'text-color': '#0b0d10' },
    });
    this.map.addLayer({
      id: LAYER_DOTS,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#39d3ff',
        'circle-radius': 7,
        'circle-stroke-color': 'rgba(11,13,16,0.95)',
        'circle-stroke-width': 2,
      },
    });
    this.map.addLayer({
      id: LAYER_LABELS,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'assetId'],
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-size': 11,
      },
      paint: {
        'text-color': '#e6e9ef',
        'text-halo-color': 'rgba(11,13,16,0.85)',
        'text-halo-width': 1,
      },
    });
  }

  private flush(): void {
    const src = this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!src) return;
    const features: GeoJSON.Feature<GeoJSON.Point, FeatureProps>[] = [];
    for (const p of this.positions.values()) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          assetId: p.assetId,
          ts: p.ts,
          speed: p.speed ?? 0,
          heading: p.heading ?? 0,
        },
      });
    }
    src.setData({ type: 'FeatureCollection', features });
  }
}
