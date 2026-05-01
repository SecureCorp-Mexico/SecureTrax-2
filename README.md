# SecureTrax-2

Configurable map-based operations hub for SecureCorp Mexico — internal fleet/site
ops console and customer-facing product.  Capabilities ship as license-gated
modules: Traccar tracking, SecureVu video, videowall, MQTT telemetry, aircraft /
QGroundControl ingest + remote deploy with approved flight plans, AI assistant
with full DB + MQTT search, fleet reports, plus later access-control, intercom,
SOS, ViewLink.

The full architectural plan lives at
`/root/.claude/plans/i-want-to-create-dynamic-feather.md` (Context · Decisions ·
Module system · Map · Telemetry · Video · Videowall · AI assistant · Aircraft ·
Reports · Public API · IAM + ISO 27001 · Phased delivery · Verification).

## Repo layout

```
apps/api          NestJS backend (license-gated module registry + OpenAPI)
apps/web          React + Vite + MapLibre GL JS full-screen shell
packages/core     Ed25519 license verifier, shared types, video stream-provider
packages/module-contracts   zod schemas for manifests + license files
modules/tracking-traccar    first reference module
tools/license-cli           keygen / sign / verify CLI
tools/sim-positions         synthetic GPS publisher for the demo
infra             docker-compose, nginx, mosquitto, dockerfiles
```

## Quickstart (local dev)

```bash
# 1. Install
pnpm install

# 2. Generate a Phase-0 dev license keypair
pnpm --filter @securetrax/license-cli run keygen \
  -- --kid st2-dev --out ./licenses/keys

# 3. Sign a license enabling the tracking-traccar reference module
pnpm --filter @securetrax/license-cli run sign \
  -- --kid st2-dev --tenant default --modules tracking-traccar --days 365

# 4. Bring up the base stack (Postgres+Timescale, Redis, Mosquitto, Keycloak,
#    Vault, MinIO, TileServer GL, API, Web)
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d

# 5. Apply DB migrations + bootstrap a default tenant + admin user
pnpm --filter @securetrax/api run db:migrate
pnpm --filter @securetrax/api run db:bootstrap

# 6. Open
#    Web:        http://localhost:5173
#    OpenAPI:    http://localhost:3000/api/docs
#    Keycloak:   http://localhost:8081 (admin / securetrax)
#    MinIO:      http://localhost:9011
#    TileServer: http://localhost:8080
```

### Demo: live moving markers on the map

The Phase-1 position pipeline (`tracking-traccar`) is wired end-to-end:
REST ingest → Postgres `positions` hypertable (RLS-scoped) → WS broadcast on
`assets/<id>/position` → MapLibre clustered marker layer.

The simulator drives N virtual vehicles around Mexico City so you can see it
without a real Traccar phone:

```bash
# In one terminal, with a JWT for an Operator-or-better in tenant `default`:
TOKEN=...   # paste a Keycloak-issued JWT, or any test JWT during dev
API_URL=http://localhost:3000/api COUNT=8 \
  pnpm --filter @securetrax/sim-positions run start
```

Drop the same token into the browser via the JS console:

```js
localStorage.setItem('securetrax.token', '<JWT>'); location.reload();
```

You should now see clustered cyan markers walking around the map, updated in
real time over `/ws`.

The web app boots into a full-screen MapLibre canvas. The top-left panel calls
`GET /api/v1/capabilities` and lists enabled modules. With no license file the
list is empty; with the license signed in step 3, `tracking-traccar` appears.

## Module system (license-gated)

- Each module ships a manifest (`@securetrax/module-contracts.ModuleManifest`)
  declaring `id`, `category`, `mapLayers`, and its API surface
  (`{ rest, ws, mqtt, webhooks, permissions }`).
- `apps/api/src/license/loader.ts` synchronously reads `./licenses/*.lic`,
  verifies Ed25519 signatures against `./licenses/keys/<kid>.pub.pem`, and
  returns the enabled module set.
- `apps/api/src/app.module.ts` filters the static module list by that set;
  unlicensed modules' Nest modules — and therefore their controllers, gateways,
  and MQTT subscribers — are never registered. Defense in depth, not just
  UI hiding.

## Phase status

Phase 0 (foundations) — **in progress.** Monorepo, license verify + sign,
NestJS skeleton with module registry + OpenAPI, web shell with MapLibre,
docker-compose with the base services, reference `tracking-traccar` module
stub, plus the security/compliance + data-plane foundation:

- IAM with namespaced permissions, hierarchical scopes (tenant > site >
  group > device), ISO-27001 role presets, separation-of-duties.
- JWT bearer + Personal Access Tokens + Machine API keys → one
  authorization layer; three guards (Permission / Scope / StepUp) wired
  globally.
- Hash-chained append-only audit log with tamper detection.
- WebSocket gateway at `/ws` with MQTT-style topic patterns.
- Postgres + TimescaleDB + PostGIS data plane via Drizzle ORM:
  `tenants`, `sites`, `groups`, `assets`, `positions` (hypertable),
  `telemetry` (hypertable), `audit_log` (hypertable), `mqtt_messages`
  (hypertable), `iam_users`/`iam_roles`/`iam_user_roles`, `api_keys`,
  `personal_access_tokens`, `module_installations`, `webhook_*`.
- **Row-level security** as the layer-3 authorization backstop: every
  tenant-scoped table FORCEs RLS; the API runs as a non-superuser role
  and pushes `app.tenant_id` into a session-local var per request via
  `DbService.withTenant` + the request-scoped `TenantContextService`.

Vault-backed key rotation, mTLS device PKI, supply-chain CI gates, and
the Compliance Console come next inside Phase 0; then Phase 1 wires the
real Traccar adapter on top.
