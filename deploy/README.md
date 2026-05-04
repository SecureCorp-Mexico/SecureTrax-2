# SecureTrax-2 — Proxmox test deployment

End-to-end runbook to stand up the full v1 stack on a single Proxmox VM,
LAN-only, on Ubuntu 24.04 with Docker. Time to first map: ~30–60 minutes
including image pulls.

## Prerequisites

- Proxmox host (any 7.x or 8.x) with internet access
- A Linux-bridge (default `vmbr0`) reachable from your operator workstation
- A GitHub access path: either the repo is public, or you have a Personal
  Access Token with read access — paste it when the bootstrap asks
- (Optional) Tailscale auth key if you want LAN-equivalent access from off-site

## What you'll get

- One VM (default: `securetrax-test`) running:
  - Postgres 16 + TimescaleDB + PostGIS
  - Mosquitto MQTT broker
  - Keycloak (dev mode)
  - Vault (dev mode)
  - MinIO
  - TileServer GL (self-hosted vector tiles)
  - Traccar (tracking backend)
  - SecureVu (Frigate fork) + go2rtc (WebRTC video relay)
  - Ollama (local LLM for the AI assistant)
  - SecureTrax-2 API + web
- A signed dev license enabling all 7 modules
- One default tenant + admin user pre-bootstrapped

Resource ask: **6 vCPU, 16 GB RAM, 80 GB disk**. Drop the `ollama` service
from `infra/docker-compose.yml` if you want to fit in 8 GB.

## Step-by-step

### 1. Create the VM (run on the Proxmox host)

SSH to your Proxmox host and run:

```bash
curl -fsSL https://raw.githubusercontent.com/SecureCorp-Mexico/SecureTrax-2/claude/configurable-maps-hub-2wyn0/deploy/proxmox-create-vm.sh \
  -o /tmp/create-vm.sh
chmod +x /tmp/create-vm.sh
/tmp/create-vm.sh
```

The script will:
1. Download the Ubuntu 24.04 cloud image (cached after first run)
2. Create VM `securetrax-test` (VMID 9101 by default — override with
   `VMID=...` env var)
3. Configure cloud-init with:
   - User `securetrax` with sudo
   - Your SSH public key (it'll prompt — paste yours)
   - DHCP on `vmbr0`
   - All required packages pre-installed
4. Start the VM and print its IP

Override defaults with env vars before running:
```bash
VMID=9101 VM_NAME=securetrax-test STORAGE=local-lvm BRIDGE=vmbr0 \
  CORES=6 MEMORY_MB=16384 DISK_GB=80 \
  /tmp/create-vm.sh
```

### 2. Bootstrap the stack (run on the VM)

Once the VM has an IP and SSH is open, log in:

```bash
ssh securetrax@<vm-ip>
```

Then:

```bash
curl -fsSL https://raw.githubusercontent.com/SecureCorp-Mexico/SecureTrax-2/claude/configurable-maps-hub-2wyn0/deploy/bootstrap.sh \
  -o ~/bootstrap.sh
chmod +x ~/bootstrap.sh
~/bootstrap.sh
```

The script will:
1. Install Docker + compose plugin
2. Install Node 20 + pnpm
3. Clone the repo to `~/securetrax-2`
4. Generate a dev license keypair, sign a license enabling every v1 module
5. Generate `infra/.env` with strong random passwords (saved to `~/secrets.txt`)
6. `docker compose up -d` for the full stack
7. Wait for Postgres health, run migrations, run the dev tenant bootstrap
8. Pull the Ollama model (`qwen2.5:7b` — about 4.7 GB)
9. Print the access URLs

Re-run safely. The script is idempotent — it skips steps already done.

### 3. Verify (run on the VM)

```bash
~/securetrax-2/deploy/verify.sh
```

Prints green/red for each subsystem: docker services, REST API, MQTT broker,
Postgres + RLS posture, Traccar reachable, Ollama model loaded, license
applied, capabilities advertised.

### 4. Open the UI

From your operator workstation on the same LAN:

- Web: `http://<vm-ip>:5173`
- OpenAPI: `http://<vm-ip>:3000/api/docs`
- Keycloak: `http://<vm-ip>:8081` — admin password is in `~/secrets.txt`
- Traccar: `http://<vm-ip>:8082` — admin/admin (change this!)
- MinIO console: `http://<vm-ip>:9011`
- TileServer: `http://<vm-ip>:8080`

Drop a JWT into the browser to authenticate against the API in dev mode.
Any properly-formatted JWT works while `KEYCLOAK_ISSUER` is unset (loud
warning in the api logs):

```js
// browser console
localStorage.setItem('securetrax.token',
  'eyJhbGciOiJSUzI1NiJ9.' +
  btoa(JSON.stringify({ sub: 'admin', tenant_id: 'default' })) +
  '.dev-mode-no-signature');
location.reload();
```

To switch to real Keycloak verification, set `KEYCLOAK_ISSUER` and
`KEYCLOAK_AUDIENCE` in `infra/.env` and `docker compose up -d --force-recreate api`.

### 5. Run the demos

```bash
# Live moving markers — drives 8 fake vehicles around Mexico City
TOKEN=<the-jwt-above> API_URL=http://localhost:3000/api COUNT=8 \
  pnpm --filter @securetrax/sim-positions run start
```

In another terminal:

```bash
# Camera marker via simulated Frigate availability
TOKEN=<the-jwt-above>

curl -X PUT http://localhost:3000/api/v1/video/cameras/CAM-1 \
  -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{
    "name": "Lobby cam", "frigateName": "lobby",
    "lat": 19.4326, "lon": -99.1332
  }'

mosquitto_pub -h localhost -t 'frigate/lobby/available' -m 'online' -r
mosquitto_pub -h localhost -t 'frigate/lobby/available' -m 'offline' -r
```

```bash
# Generic MQTT ingest via mapping engine
curl -X PUT http://localhost:3000/api/v1/telemetry/mappings/router-position \
  -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{
    "name":"Router position","topicPattern":"securetrax/+/{assetId}/position",
    "payloadKind":"json","eventType":"position",
    "rules":{"assetId":"{assetId}","lat":"$.lat","lon":"$.lon","ts":"$.ts"}
  }'

mosquitto_pub -h localhost -t 'securetrax/default/ROUTER-7/position' \
  -m "{\"lat\":19.43,\"lon\":-99.13,\"ts\":$(date +%s%3N)}"
```

```bash
# Fleet report
curl -H "authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/reports/fleet?format=csv" -o /tmp/fleet.csv
column -ts, /tmp/fleet.csv | head
```

In the UI:
- Click camera markers → live WebRTC popup (needs Frigate cameras configured
  in `infra/securevu/config.yml` to actually have video; the popup falls back
  to a "no stream" placeholder until then)
- Click "Ask the assistant" bottom-left → Ollama-backed chat over the data plane
- Click "Compliance" top-right → live ISO 27001 / SOC 2 / IEC 62443 / GDPR
  evidence
- Open `http://<vm-ip>:5173/?wall=<layout-id>` for the videowall kiosk view

## Troubleshooting

### `docker compose up` complains about ports

Check what's already bound: `ss -tlnp | grep -E ':(3000|5173|5432|1883|8080|8081|8082|11434)'`.
Either stop the conflicting process or change the host-side port in
`infra/docker-compose.yml`.

### `db:migrate` fails with "extension timescaledb not loaded"

The first `docker compose up` may have raced ahead of Postgres init. Reset:
```bash
docker compose down
sudo rm -rf infra/data/postgres
docker compose up -d postgres
sleep 30   # let it init the side databases
docker compose up -d
```

### TS workspace fails on `pnpm install`

Likely peer-dep mismatch. Try:
```bash
pnpm -r --filter '!sim-positions' run typecheck 2>&1 | head -50
```
Paste the output to the maintainer for triage.

### Ollama runs out of disk

`qwen2.5:7b` is ~4.7 GB. If `/var/lib/docker` is on the root volume and
disk fills up:
```bash
docker compose exec ollama ollama list
docker compose exec ollama ollama rm <model>
```
Or move docker storage to a bigger volume (`/etc/docker/daemon.json` →
`"data-root": "/mnt/large"`).

### "no LLM provider available" in the chat

Either:
- Ollama hasn't pulled a model yet:
  `docker compose exec ollama ollama pull qwen2.5:7b`
- `OLLAMA_MODEL` env mismatches the pulled tag — fix in `infra/.env`,
  `docker compose up -d --force-recreate api`

### Want to wipe and restart

```bash
cd ~/securetrax-2/infra
docker compose down -v
sudo rm -rf data licenses
cd .. && ~/bootstrap.sh
```

## What this does NOT do (yet)

- Not production. No TLS, no real Keycloak realm, dev tokens for everything.
- Not high-availability. Single host, single VM, single Postgres.
- Not backed up. Add a Restic / pgbackrest job before relying on it.
- Doesn't expose anything publicly. LAN-only on purpose.

For the production hardening checklist see the architectural plan file
referenced in the repo README.

## Removing the VM

```bash
# On the Proxmox host:
qm stop 9101
qm destroy 9101 --purge
```

Replace `9101` with your actual `VMID` if you overrode it.
