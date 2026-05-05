import type { CameraView } from './types.js';

export async function fetchCameras(token?: string): Promise<{ items: CameraView[] }> {
  const res = await fetch('/api/v1/video/cameras', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`cameras request failed: ${res.status}`);
  return (await res.json()) as { items: CameraView[] };
}
