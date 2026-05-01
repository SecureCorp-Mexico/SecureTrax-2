-- Phase 2: MQTT mapping engine table.
--
-- mqtt_topic_mappings stores per-tenant rules that translate raw MQTT
-- messages into canonical events (Position / Telemetry / Alert). Editable
-- from the admin UI, evaluated by the telemetry-mqtt module's MappingEngine
-- on every incoming frame.
--
-- The mqtt_messages archive table itself was created in 0000_init.sql; this
-- migration only adds the mapping table + RLS policy.

CREATE TABLE IF NOT EXISTS mqtt_topic_mappings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  topic_pattern   TEXT NOT NULL,
  payload_kind    TEXT NOT NULL DEFAULT 'json',
  event_type      TEXT NOT NULL,
  rules           JSONB NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  priority        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mqtt_topic_mappings_tenant_idx
  ON mqtt_topic_mappings(tenant_id, priority);

ALTER TABLE mqtt_topic_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mqtt_topic_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mqtt_topic_mappings_tenant_isolation ON mqtt_topic_mappings;
CREATE POLICY mqtt_topic_mappings_tenant_isolation ON mqtt_topic_mappings
  USING (app_bypass_rls() OR tenant_id = app_current_tenant())
  WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON mqtt_topic_mappings TO securetrax;
