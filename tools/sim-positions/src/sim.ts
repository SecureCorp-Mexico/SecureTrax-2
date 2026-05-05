#!/usr/bin/env node
/**
 * Synthetic position publisher for the Phase-1 demo. Drives N virtual vehicles
 * around Mexico City in a slow random walk, calling the SecureTrax-2 REST API
 * to upsert each asset and POST positions to it. Use to see live markers move
 * on the web map without a real Traccar phone.
 *
 *   API_URL=http://localhost:3000/api \
 *   TOKEN=$(jwt-issue --sub admin --tenant default) \
 *   COUNT=8 \
 *   pnpm --filter @securetrax/sim-positions run start
 */

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const TOKEN = process.env.TOKEN;
const COUNT = Math.max(1, Number(process.env.COUNT ?? 6));
const TICK_MS = Math.max(200, Number(process.env.TICK_MS ?? 1500));
const ORIGIN_LAT = Number(process.env.ORIGIN_LAT ?? 19.4326);
const ORIGIN_LON = Number(process.env.ORIGIN_LON ?? -99.1332);

if (!TOKEN) {
  console.error('TOKEN env var is required (Bearer JWT for the API)');
  process.exit(1);
}

interface Sim {
  id: string;
  name: string;
  lat: number;
  lon: number;
  heading: number;
  speed: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const sims: Sim[] = Array.from({ length: COUNT }, (_, i) => ({
  id: `SIM-${String(i + 1).padStart(2, '0')}`,
  name: `Sim Vehicle ${i + 1}`,
  lat: ORIGIN_LAT + rand(-0.05, 0.05),
  lon: ORIGIN_LON + rand(-0.05, 0.05),
  heading: rand(0, 360),
  speed: rand(15, 60),
}));

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return await res.json().catch(() => ({}));
}

async function ensureAssets(): Promise<void> {
  for (const s of sims) {
    await api('PUT', `/v1/tracking/assets/${s.id}`, {
      id: s.id,
      name: s.name,
      category: 'vehicle',
      tags: ['simulated'],
    });
  }
  console.log(`registered ${sims.length} simulated vehicles`);
}

function step(s: Sim): void {
  // Random-walk heading (drift up to ±30°/tick) and slight speed variation.
  s.heading = (s.heading + rand(-30, 30) + 360) % 360;
  s.speed = clamp(s.speed + rand(-3, 3), 5, 80);
  // distance covered this tick in meters
  const meters = (s.speed * 1000) / 3600 * (TICK_MS / 1000);
  // 1 deg lat ≈ 111_320 m; lon depends on cos(lat)
  const dLat = (meters * Math.cos((s.heading * Math.PI) / 180)) / 111_320;
  const dLon =
    (meters * Math.sin((s.heading * Math.PI) / 180)) /
    (111_320 * Math.cos((s.lat * Math.PI) / 180));
  s.lat = clamp(s.lat + dLat, -85, 85);
  s.lon = wrap(s.lon + dLon);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
function wrap(v: number): number {
  if (v > 180) return v - 360;
  if (v < -180) return v + 360;
  return v;
}

async function tick(): Promise<void> {
  const now = Date.now();
  await Promise.all(
    sims.map((s) => {
      step(s);
      return api('POST', `/v1/tracking/assets/${s.id}/positions`, {
        ts: now,
        lat: s.lat,
        lon: s.lon,
        speed: s.speed,
        heading: s.heading,
      });
    }),
  );
}

await ensureAssets();
console.log(`ticking every ${TICK_MS}ms — Ctrl-C to stop`);
setInterval(() => {
  tick().catch((e) => console.error('tick failed:', e));
}, TICK_MS);
