-- SecureTrax-2 — initial schema migration.
-- Owns: extensions, tables, hypertables, indexes, RLS policies.
--
-- This file is hand-authored (rather than drizzle-kit-generated) because the
-- TimescaleDB hypertable / PostGIS / RLS pieces don't round-trip through
-- drizzle-kit cleanly. Subsequent migrations (0001+) can be drizzle-kit-
-- generated and applied alongside.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ─── tenancy ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sites (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS sites_tenant_idx ON sites(tenant_id);

CREATE TABLE IF NOT EXISTS groups (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id     TEXT REFERENCES sites(id) ON DELETE SET NULL,
  name        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS groups_tenant_idx ON groups(tenant_id);

CREATE TABLE IF NOT EXISTS assets (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id         TEXT REFERENCES sites(id) ON DELETE SET NULL,
  group_id        TEXT REFERENCES groups(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  tags            JSONB NOT NULL DEFAULT '[]'::jsonb,
  camera_bindings JSONB NOT NULL DEFAULT '[]'::jsonb,
  attrs           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_tenant_idx ON assets(tenant_id);
CREATE INDEX IF NOT EXISTS assets_site_idx ON assets(site_id);
CREATE INDEX IF NOT EXISTS assets_category_idx ON assets(category);

-- ─── time-series (hypertables) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS positions (
  tenant_id  TEXT NOT NULL,
  asset_id   TEXT NOT NULL,
  ts         TIMESTAMPTZ NOT NULL,
  lat        DOUBLE PRECISION NOT NULL,
  lon        DOUBLE PRECISION NOT NULL,
  alt        DOUBLE PRECISION,
  speed      DOUBLE PRECISION,
  heading    DOUBLE PRECISION,
  attrs      JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (asset_id, ts)
);
SELECT create_hypertable('positions', by_range('ts'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS positions_tenant_ts_idx ON positions(tenant_id, ts DESC);

CREATE TABLE IF NOT EXISTS telemetry (
  tenant_id  TEXT NOT NULL,
  asset_id   TEXT NOT NULL,
  ts         TIMESTAMPTZ NOT NULL,
  metric     TEXT NOT NULL,
  value      DOUBLE PRECISION,
  value_text TEXT,
  value_bool BOOLEAN,
  unit       TEXT,
  PRIMARY KEY (asset_id, ts, metric)
);
SELECT create_hypertable('telemetry', by_range('ts'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS telemetry_tenant_ts_idx ON telemetry(tenant_id, ts DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  tenant_id   TEXT NOT NULL,
  seq         BIGINT NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  subject_id  TEXT,
  auth_method TEXT,
  action      TEXT NOT NULL,
  resource    TEXT,
  decision    TEXT NOT NULL,
  reason      TEXT,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL,
  PRIMARY KEY (tenant_id, seq)
);
SELECT create_hypertable('audit_log', by_range('ts'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON audit_log(ts DESC);

CREATE TABLE IF NOT EXISTS mqtt_messages (
  tenant_id    TEXT NOT NULL,
  ts           TIMESTAMPTZ NOT NULL,
  topic        TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_raw  TEXT,
  qos          SMALLINT NOT NULL DEFAULT 0,
  retained     BOOLEAN NOT NULL DEFAULT false
);
SELECT create_hypertable('mqtt_messages', by_range('ts'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS mqtt_messages_topic_idx ON mqtt_messages(topic);
CREATE INDEX IF NOT EXISTS mqtt_messages_tenant_topic_idx ON mqtt_messages(tenant_id, topic);

-- ─── IAM ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS iam_users (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  mfa_enrolled  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iam_users_tenant_email_idx ON iam_users(tenant_id, email);

CREATE TABLE IF NOT EXISTS iam_roles (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  permissions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  exclusive_with  JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_mfa    BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS iam_user_roles (
  tenant_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  role_id     TEXT NOT NULL,
  scope       JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, role_id)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_id    TEXT NOT NULL,
  label         TEXT NOT NULL DEFAULT '',
  secret_hash   TEXT NOT NULL,
  scope         JSONB NOT NULL,
  ip_allowlist  JSONB NOT NULL DEFAULT '[]'::jsonb,
  permissions   JSONB NOT NULL DEFAULT '[]'::jsonb,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personal_access_tokens (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_id    TEXT NOT NULL,
  label         TEXT NOT NULL DEFAULT '',
  secret_hash   TEXT NOT NULL,
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── modules + webhooks ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS module_installations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id     TEXT NOT NULL,
  version       TEXT NOT NULL,
  installed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  events            JSONB NOT NULL DEFAULT '[]'::jsonb,
  url               TEXT NOT NULL,
  secret_encrypted  TEXT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       TEXT NOT NULL,
  subscription_id UUID NOT NULL,
  event           TEXT NOT NULL,
  ts              TIMESTAMPTZ NOT NULL,
  attempt         INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL,
  http_status     INTEGER,
  response_body   TEXT,
  payload         JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_tenant_ts_idx ON webhook_deliveries(tenant_id, ts);

-- ─── Row-level security (defense-in-depth layer 3) ─────────────────────────
--
-- The application runs as DB user `securetrax`, which is NOT a superuser, so
-- RLS applies. Every connection sets `app.tenant_id` (and optionally
-- `app.bypass_rls = 'on'` for migrations) before issuing queries; queries that
-- forget will simply return zero rows for tenant-scoped tables.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'securetrax') THEN
    CREATE ROLE securetrax LOGIN;
  END IF;
END
$$;

-- helper: returns the current tenant from session vars, or NULL when unset.
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS TEXT
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v TEXT;
BEGIN
  v := current_setting('app.tenant_id', true);
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v;
END
$$;

CREATE OR REPLACE FUNCTION app_bypass_rls() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v TEXT;
BEGIN
  v := current_setting('app.bypass_rls', true);
  RETURN v = 'on';
END
$$;

DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'sites', 'groups', 'assets',
    'positions', 'telemetry', 'audit_log', 'mqtt_messages',
    'iam_users', 'iam_roles', 'iam_user_roles',
    'api_keys', 'personal_access_tokens',
    'module_installations', 'webhook_subscriptions', 'webhook_deliveries'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_tenant_isolation ON %I;',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I
         USING (app_bypass_rls() OR tenant_id = app_current_tenant())
         WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO securetrax;', t);
  END LOOP;
END
$$;

-- tenants table itself: only the system role bypasses RLS to manage tenants.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_self ON tenants;
CREATE POLICY tenants_self ON tenants
  USING (app_bypass_rls() OR id = app_current_tenant())
  WITH CHECK (app_bypass_rls() OR id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO securetrax;
