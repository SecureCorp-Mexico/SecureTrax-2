import type { Map as MlMap, GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import type { AssetStatusEvent, CameraView } from '../api/types.js';
import { RealtimeClient } from '../realtime/RealtimeClient.js';

const SOURCE_ID = 'fixed-cameras';
const LAYER_DOTS = 'fixed-cameras-dots';
const LAYER_LABELS = 'fixed-cameras-labels';

export type CameraClickHandler = (cam: CameraView) => void;

interface FeatureProps {
  id: string;
  name: string;
  status: string;
  streamId: string;
  webrtcUrl: string;
  hlsUrl: string;
  snapshotUrl: string;
}

/**
 * Fixed-camera marker layer. Cameras are loaded from /v1/video/cameras and
 * rendered as colored dots driven by the cached `status` field; live status
 * changes flow over `cameras/+/status` and `assets/+/status` WS topics so the
 * marker recolors without a refresh. Clicking a marker fires the supplied
 * onClick(cam) so the popup video player can mount for it.
 */
export class FixedCamerasLayer {
  private readonly cams = new Map<string, CameraView>();
  private clickUnbind?: () => void;
  private statusUnsubs: Array<() => void> = [];

  constructor(
    private readonly map: MlMap,
    private readonly rt: RealtimeClient,
    private readonly onClick: CameraClickHandler,
  ) {}

  attach(initial: CameraView[]): void {
    for (const c of initial) this.cams.set(c.id, c);
    this.ensureLayers();
    this.flush();

    // Click → open popup
    const clickHandler = (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const id = (feat.properties as FeatureProps | undefined)?.id;
      if (!id) return;
      const cam = this.cams.get(id);
      if (cam) this.onClick(cam);
    };
    this.map.on('click', LAYER_DOTS, clickHandler);
    this.map.on('mouseenter', LAYER_DOTS, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', LAYER_DOTS, () => {
      this.map.getCanvas().style.cursor = '';
    });
    this.clickUnbind = () => this.map.off('click', LAYER_DOTS, clickHandler);

    // Live status updates
    this.statusUnsubs.push(
      this.rt.subscribe<AssetStatusEvent>('assets/+/status', (ev) => {
        const cam = this.cams.get(ev.assetId);
        if (!cam) return;
        cam.status = ev.status;
        cam.lastSeenAt = ev.lastSeenAt;
        this.flush();
      }),
      this.rt.subscribe<AssetStatusEvent>('cameras/+/status', (ev) => {
        const cam = this.cams.get(ev.assetId);
        if (!cam) return;
        cam.status = ev.status;
        cam.lastSeenAt = ev.lastSeenAt;
        this.flush();
      }),
    );
  }

  detach(): void {
    this.clickUnbind?.();
    this.clickUnbind = undefined;
    for (const u of this.statusUnsubs) u();
    this.statusUnsubs = [];
  }

  private ensureLayers(): void {
    if (this.map.getSource(SOURCE_ID)) return;
    this.map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    this.map.addLayer({
      id: LAYER_DOTS,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': 8,
        'circle-color': [
          'match',
          ['get', 'status'],
          'online', '#3ddc84',
          'degraded', '#ffb020',
          'offline', '#ff4d4d',
          /* unknown */ '#999999',
        ],
        'circle-stroke-color': 'rgba(11,13,16,0.95)',
        'circle-stroke-width': 2,
      },
    });
    this.map.addLayer({
      id: LAYER_LABELS,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'text-field': ['get', 'name'],
        'text-offset': [0, 1.4],
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
    for (const c of this.cams.values()) {
      if (c.lat == null || c.lon == null) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
        properties: {
          id: c.id,
          name: c.name,
          status: c.status,
          streamId: c.streamId,
          webrtcUrl: c.webrtcUrl,
          hlsUrl: c.hlsUrl,
          snapshotUrl: c.snapshotUrl,
        },
      });
    }
    src.setData({ type: 'FeatureCollection', features });
  }
}
