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

# 5. Open
#    Web:        http://localhost:5173
#    OpenAPI:    http://localhost:3000/api/docs
#    Keycloak:   http://localhost:8081 (admin / securetrax)
#    MinIO:      http://localhost:9011
#    TileServer: http://localhost:8080
```

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
stub. Auth, RBAC, audit log, three-layer authorization, and the rest of
section 10 of the plan come next inside Phase 0.

See the plan file for the full Phase 1–10 roadmap.
