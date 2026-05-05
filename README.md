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
modules/tracking-traccar    Traccar adapter + canonical position pipeline
modules/telemetry-mqtt      MQTT archiver + per-tenant mapping engine
modules/video-securevu      SecureVu/Frigate cameras + go2rtc WebRTC popup
modules/videowall           Multi-stream grid layouts + multi-monitor sync
modules/aircraft-qgc        MAVLink ingest + Ed25519 flight-plan approvals
modules/reports-fleet       Trips/distance/idle reports (CSV+JSON)
modules/ai-assistant        Claude / Ollama assistant w/ tool-use over the data plane
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

# 3. Sign a license enabling the full v1 module set
pnpm --filter @securetrax/license-cli run sign \
  -- --kid st2-dev --tenant default \
     --modules tracking-traccar,telemetry-mqtt,video-securevu,videowall,aircraft-qgc,reports-fleet,ai-assistant \
     --days 365

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

The Phase-1 position pipeline (`tracking-traccar`) feeds two ingest paths
into the same canonical pipeline (Postgres `positions` hypertable [RLS-scoped]
→ WS broadcast on `assets/<id>/position` → MapLibre clustered marker layer):

**A. Real Traccar.** With `TRACCAR_URL` set (the bundled Traccar service in
`docker-compose` is reachable at `http://traccar:8082`, default `admin/admin`
— change it before exposing externally), the API's `TraccarAdapter` logs in
once, syncs devices into our `assets` table, opens `/api/socket`, and feeds
every incoming position through. Point a Traccar Client phone or any GPS
hardware at the protocol ports exposed by the Traccar container (e.g.
`5055/tcp` for OsmAnd / Traccar Client) and the marker appears on the
SecureTrax-2 map within seconds.

**B. Simulator.** When you don't have hardware, drive N virtual vehicles
around Mexico City via our REST endpoints:

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

Either path: clustered cyan markers walk around the map, updated in real time
over `/ws`.

### Demo: MQTT ingest + mapping engine

With `telemetry-mqtt` licensed, the API subscribes to `securetrax/#` on the
bundled Mosquitto broker, mirrors every message into the `mqtt_messages`
Timescale hypertable (powers the AI assistant's `mqtt_search` tool later),
and runs a per-tenant mapping engine that translates raw MQTT into canonical
events. Position-typed mappings feed the same pipeline `tracking-traccar`
uses, so a generic OpenWRT router publishing JSON can land on the map without
any custom code.

```bash
# 1) Create a mapping that turns
#      securetrax/default/<assetId>/position
#      payload: {"lat":..., "lon":..., "ts":...}
#    into canonical position events.
curl -X PUT http://localhost:3000/api/v1/telemetry/mappings/router-position \
  -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{
    "name": "Router position",
    "topicPattern": "securetrax/+/{assetId}/position",
    "payloadKind": "json",
    "eventType": "position",
    "rules": {
      "assetId": "{assetId}",
      "lat": "$.lat",
      "lon": "$.lon",
      "ts":  "$.ts"
    }
  }'

# 2) Publish a position over MQTT (with mosquitto-clients installed):
mosquitto_pub -h localhost -t 'securetrax/default/ROUTER-7/position' \
  -m "{\"lat\":19.43,\"lon\":-99.13,\"ts\":$(date +%s%3N)}"

# 3) See it in the archive (and on the map within ~1s):
curl -H "authorization: Bearer $TOKEN" \
  'http://localhost:3000/api/v1/telemetry/archive?topicLike=securetrax/%25&limit=20'
```

### Demo: live camera markers + popup video

With `video-securevu` licensed, the api subscribes to Frigate's MQTT
publishings (`frigate/<cam>/available` for status, `frigate/events` for
detections). Cameras are registered as fixed-position assets; the
`FixedCamerasLayer` on the web side renders them as colored dots
(green/yellow/red/grey for online/degraded/offline/unknown). Click a marker
and the popup negotiates a WebRTC stream against go2rtc, falling back to HLS
if WebRTC can't be set up.

```bash
# Register a fixed camera in Mexico City — frigateName must match a key under
# `cameras:` in infra/securevu/config.yml.
curl -X PUT http://localhost:3000/api/v1/video/cameras/CAM-1 \
  -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{
    "name": "Lobby cam",
    "frigateName": "lobby",
    "lat": 19.4326,
    "lon": -99.1332
  }'

# Simulate Frigate publishing availability:
mosquitto_pub -h localhost -t 'frigate/lobby/available' -m 'online' -r
mosquitto_pub -h localhost -t 'frigate/lobby/available' -m 'offline' -r
```

The map's CAM-1 marker recolors live. Click it — the popup mounts a
`<video>` against go2rtc (`ws://localhost:1984/api/ws?src=lobby`); if that
fails it falls back to HLS at `/api/stream.m3u8?src=lobby`.

### Demo: AI assistant over the data plane

With `ai-assistant` licensed, an "Ask the assistant" button appears at the
bottom-left of the map. The chat posts to `POST /api/v1/ai/chat`, which runs
a tool-use loop against the data plane and streams the result back. Tools
exposed to the LLM (each RBAC-gated):

- `find_assets` — typed asset filter
- `get_position_history` — GPS history per asset
- `mqtt_search` — SQL `LIKE` over the rolling MQTT archive
- `query_data` — generic structured search over assets / positions / mqtt

Provider selection (set on the `api` service env):
- `ANTHROPIC_API_KEY=sk-...` → Claude (`claude-opus-4-7`, adaptive thinking,
  prompt caching on the system + tool-catalog prefix). Recommended.
- Otherwise the assistant falls back to the bundled Ollama service.
  Pull a model first: `docker compose exec ollama ollama pull qwen2.5:7b`.

Try: *"Show me all online cameras at Site Sector-7"*, or
*"Did `securetrax/+/router-+/lte_rsrp` ever drop below -110 today?"*. Every
tool call is logged in the chat panel so operators see exactly which queries
the assistant ran.

The web app boots into a full-screen MapLibre canvas. The top-left panel calls
`GET /api/v1/capabilities` and lists enabled modules.

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
