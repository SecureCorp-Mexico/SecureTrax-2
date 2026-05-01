-- Phase 3: fixed-position + online/offline status on assets.
--
-- Fixed cameras (and other static devices: routers, UPS, intercoms) carry a
-- permanent lat/lon directly on the asset row instead of having to live in
-- the positions hypertable. Status is kept hot here too so marker styling
-- can use a single SELECT without joining audit/telemetry.

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS assets_status_idx ON assets(status);
