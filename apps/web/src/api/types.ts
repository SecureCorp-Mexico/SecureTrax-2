export interface Position {
  assetId: string;
  ts: number;
  lat: number;
  lon: number;
  alt?: number;
  speed?: number;
  heading?: number;
  attrs?: Record<string, unknown>;
}

export interface CameraView {
  id: string;
  name: string;
  frigateName: string;
  streamId: string;
  lat: number | null;
  lon: number | null;
  status: 'online' | 'offline' | 'degraded' | 'unknown';
  lastSeenAt: number | null;
  webrtcUrl: string;
  hlsUrl: string;
  snapshotUrl: string;
}

export interface AssetStatusEvent {
  assetId: string;
  status: 'online' | 'offline' | 'degraded' | 'unknown';
  lastSeenAt: number;
}
