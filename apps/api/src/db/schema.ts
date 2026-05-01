import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Every tenant-scoped table carries `tenant_id` (FK to tenants) and is covered
 * by an RLS policy created in 0000_init.sql that ANDs the row's tenant_id
 * against `current_setting('app.tenant_id')`. The Drizzle-side schema captures
 * shape; the SQL migration captures hypertables, RLS, and Postgres extensions.
 */

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sites = pgTable('sites', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  attrs: jsonb('attrs').$type<Record<string, unknown>>().notNull().default({}),
});

export const groups = pgTable('groups', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: text('site_id').references(() => sites.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
});

export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: text('site_id').references(() => sites.id, { onDelete: 'set null' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    category: text('category').notNull(), // vehicle | fixed-camera | aircraft | router | ...
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    cameraBindings: jsonb('camera_bindings').$type<string[]>().notNull().default([]),
    attrs: jsonb('attrs').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index('assets_tenant_idx').on(t.tenantId),
    siteIdx: index('assets_site_idx').on(t.siteId),
    categoryIdx: index('assets_category_idx').on(t.category),
  }),
);

/** Hypertable: positions(asset_id, ts). Configured in 0000_init.sql. */
export const positions = pgTable(
  'positions',
  {
    tenantId: text('tenant_id').notNull(),
    assetId: text('asset_id').notNull(),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    alt: doublePrecision('alt'),
    speed: doublePrecision('speed'),
    heading: doublePrecision('heading'),
    attrs: jsonb('attrs').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.assetId, t.ts] }),
  }),
);

/** Hypertable: telemetry(asset_id, ts, metric). */
export const telemetry = pgTable(
  'telemetry',
  {
    tenantId: text('tenant_id').notNull(),
    assetId: text('asset_id').notNull(),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    metric: text('metric').notNull(),
    value: doublePrecision('value'),
    valueText: text('value_text'),
    valueBool: boolean('value_bool'),
    unit: text('unit'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.assetId, t.ts, t.metric] }),
  }),
);

/** Hash-chained audit log. Hypertable for time-based pruning. */
export const auditLog = pgTable(
  'audit_log',
  {
    tenantId: text('tenant_id').notNull(),
    seq: bigint('seq', { mode: 'bigint' }).notNull(),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    subjectId: text('subject_id'),
    authMethod: text('auth_method'),
    action: text('action').notNull(),
    resource: text('resource'),
    decision: text('decision').notNull(), // allowed | denied | info
    reason: text('reason'),
    attrs: jsonb('attrs').$type<Record<string, unknown>>().notNull().default({}),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.seq] }),
    tsIdx: index('audit_log_ts_idx').on(t.ts),
  }),
);

/** Mirrors every Mosquitto message — powers AI assistant `mqtt_search`. */
export const mqttMessages = pgTable(
  'mqtt_messages',
  {
    tenantId: text('tenant_id').notNull(),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull().default({}),
    payloadRaw: text('payload_raw'),
    qos: smallint('qos').notNull().default(0),
    retained: boolean('retained').notNull().default(false),
  },
  (t) => ({
    topicIdx: index('mqtt_messages_topic_idx').on(t.topic),
    tenantTopicIdx: index('mqtt_messages_tenant_topic_idx').on(t.tenantId, t.topic),
  }),
);

// ─── IAM ────────────────────────────────────────────────────────────────────

export const iamUsers = pgTable(
  'iam_users',
  {
    id: text('id').primaryKey(), // matches Keycloak `sub`
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    mfaEnrolled: boolean('mfa_enrolled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantEmailIdx: index('iam_users_tenant_email_idx').on(t.tenantId, t.email),
  }),
);

export const iamRoles = pgTable('iam_roles', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  exclusiveWith: jsonb('exclusive_with').$type<string[]>().notNull().default([]),
  requiresMfa: boolean('requires_mfa').notNull().default(false),
});

export const iamUserRoles = pgTable(
  'iam_user_roles',
  {
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    roleId: text('role_id').notNull(),
    /** Each assignment carries its own resource scope. */
    scope: jsonb('scope').$type<{ include: unknown[]; exclude: unknown[] }>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.userId, t.roleId] }),
  }),
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id').notNull(),
    label: text('label').notNull().default(''),
    /** sha256(raw secret), never the secret itself. */
    secretHash: text('secret_hash').notNull(),
    scope: jsonb('scope').$type<{ include: unknown[]; exclude: unknown[] }>().notNull(),
    ipAllowlist: jsonb('ip_allowlist').$type<string[]>().notNull().default([]),
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const personalAccessTokens = pgTable('personal_access_tokens', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  subjectId: text('subject_id').notNull(),
  label: text('label').notNull().default(''),
  secretHash: text('secret_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Module installations ──────────────────────────────────────────────────

export const moduleInstallations = pgTable('module_installations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  moduleId: text('module_id').notNull(),
  version: text('version').notNull(),
  installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
});

// ─── Webhooks ──────────────────────────────────────────────────────────────

export const webhookSubscriptions = pgTable('webhook_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  events: jsonb('events').$type<string[]>().notNull().default([]),
  url: text('url').notNull(),
  /** HMAC secret for X-SecureTrax-Signature; stored encrypted in production via Vault. */
  secretEncrypted: text('secret_encrypted').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id').notNull(),
    subscriptionId: uuid('subscription_id').notNull(),
    event: text('event').notNull(),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    attempt: integer('attempt').notNull().default(1),
    status: text('status').notNull(), // queued | succeeded | failed | dlq
    httpStatus: integer('http_status'),
    responseBody: text('response_body'),
    payload: jsonb('payload').notNull(),
  },
  (t) => ({
    tenantTsIdx: index('webhook_deliveries_tenant_ts_idx').on(t.tenantId, t.ts),
  }),
);
