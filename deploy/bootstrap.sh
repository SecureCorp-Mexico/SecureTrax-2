#!/usr/bin/env bash
# SecureTrax-2 first-boot bootstrap. Run on the test VM as the
# `securetrax` user (sudoer). Idempotent — safe to re-run.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/SecureCorp-Mexico/SecureTrax-2.git}"
BRANCH="${BRANCH:-claude/configurable-maps-hub-2wyn0}"
APP_DIR="${HOME}/securetrax-2"
SECRETS_FILE="${HOME}/secrets.txt"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"

note() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[1;33m!\033[0m %s\n" "$*" >&2; }

# ---- 1. Docker + compose ----

note "Installing Docker (idempotent)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "${USER}"
  ok "Docker installed. NOTE: You may need to log out/in for the docker group to apply,"
  ok "or run the rest of this script via 'sg docker -c \"$0\"'"
else
  ok "Docker already present"
fi

# Use sudo for the rest of this run if the docker group isn't active yet.
DOCKER="docker"
if ! docker ps >/dev/null 2>&1; then
  warn "docker.sock not accessible without sudo yet — using sudo for docker calls"
  DOCKER="sudo docker"
fi

# ---- 2. Node + pnpm ----

note "Installing Node 20 + pnpm"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v20'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
ok "node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  curl -fsSL https://get.pnpm.io/install.sh | SHELL=bash bash -
  # shellcheck disable=SC1090
  source "${HOME}/.bashrc" || true
  export PATH="${HOME}/.local/share/pnpm:${PATH}"
fi
ok "pnpm $(pnpm -v)"

# ---- 3. Clone or update repo ----

note "Cloning repo @ ${BRANCH}"
if [[ ! -d "${APP_DIR}" ]]; then
  git clone --branch "${BRANCH}" --single-branch "${REPO_URL}" "${APP_DIR}"
else
  git -C "${APP_DIR}" fetch --depth 1 origin "${BRANCH}"
  git -C "${APP_DIR}" checkout -B "${BRANCH}" "origin/${BRANCH}"
fi
ok "checked out at $(git -C "${APP_DIR}" rev-parse --short HEAD)"

cd "${APP_DIR}"

# ---- 4. pnpm install ----

note "Installing workspace dependencies"
pnpm install --frozen-lockfile=false
ok "deps installed"

# ---- 5. Generate license keypair + sign license ----

note "Generating dev license"
mkdir -p licenses/keys
if [[ ! -f licenses/keys/st2-dev.priv.pem ]]; then
  pnpm --filter @securetrax/license-cli run keygen \
    -- --kid st2-dev --out ./licenses/keys
  ok "keypair generated (kid=st2-dev)"
fi

if [[ ! -f licenses/active.lic ]]; then
  pnpm --filter @securetrax/license-cli run sign -- \
    --kid st2-dev --tenant default \
    --modules tracking-traccar,telemetry-mqtt,video-securevu,videowall,aircraft-qgc,reports-fleet,ai-assistant \
    --days 365 \
    --out ./licenses/active.lic
  ok "license signed for all 7 v1 modules"
fi

# ---- 6. .env with strong randoms ----

ENV_FILE="infra/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  note "Generating ${ENV_FILE} with random passwords"
  rand() { openssl rand -base64 32 | tr -d '=+/' | cut -c1-24; }

  POSTGRES_PASSWORD="$(rand)"
  KEYCLOAK_ADMIN_PASSWORD="$(rand)"
  VAULT_ROOT_TOKEN="$(rand)"
  MINIO_ROOT_PASSWORD="$(rand)"

  cat > "${ENV_FILE}" <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
VAULT_ROOT_TOKEN=${VAULT_ROOT_TOKEN}
MINIO_ROOT_USER=securetrax
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}

# Traccar — change before exposing
TRACCAR_USER=admin
TRACCAR_PASSWORD=admin
TRACCAR_TENANT_ID=default

# Frigate / go2rtc
FRIGATE_TENANT_ID=default

# AI assistant — Ollama only by default; set ANTHROPIC_API_KEY to add Claude.
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-4-7
ANTHROPIC_EFFORT=high
OLLAMA_MODEL=${OLLAMA_MODEL}

# Auth — leave KEYCLOAK_ISSUER unset for dev (decode-and-trust) until the realm is set up
KEYCLOAK_ISSUER=
KEYCLOAK_AUDIENCE=securetrax-api
KEYCLOAK_JWKS_URI=
EOF
  chmod 600 "${ENV_FILE}"

  # Capture the secrets out-of-band so the operator can recover them.
  cat > "${SECRETS_FILE}" <<EOF
SecureTrax-2 dev secrets — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
$(printf '%.0s-' {1..60})
postgres password   : ${POSTGRES_PASSWORD}
keycloak admin pwd  : ${KEYCLOAK_ADMIN_PASSWORD}
vault root token    : ${VAULT_ROOT_TOKEN}
minio root password : ${MINIO_ROOT_PASSWORD}

Web:        http://$(hostname -I | awk '{print $1}'):5173
OpenAPI:    http://$(hostname -I | awk '{print $1}'):3000/api/docs
Keycloak:   http://$(hostname -I | awk '{print $1}'):8081 (admin / above)
Traccar:    http://$(hostname -I | awk '{print $1}'):8082 (admin / admin — CHANGE)
MinIO:      http://$(hostname -I | awk '{print $1}'):9011
TileServer: http://$(hostname -I | awk '{print $1}'):8080
EOF
  chmod 600 "${SECRETS_FILE}"
  ok "secrets written to ${SECRETS_FILE} (mode 600)"
else
  ok "${ENV_FILE} already present"
fi

# ---- 7. Bring up the stack ----

note "Pulling images + starting docker-compose"
cd infra
${DOCKER} compose pull
${DOCKER} compose up -d
cd ..
ok "docker compose up"

# ---- 8. Wait for Postgres health ----

note "Waiting for Postgres to be healthy"
for i in $(seq 1 60); do
  if ${DOCKER} compose -f infra/docker-compose.yml exec -T postgres \
       pg_isready -U securetrax -d securetrax >/dev/null 2>&1; then
    ok "postgres healthy"
    break
  fi
  sleep 2
  if [[ $i -eq 60 ]]; then
    warn "postgres did not become healthy in 120s — check logs:"
    warn "  cd ~/securetrax-2/infra && docker compose logs postgres"
    exit 1
  fi
done

# ---- 9. Migrate + bootstrap ----

note "Applying DB migrations"
pnpm --filter @securetrax/api run db:migrate
ok "migrations applied"

note "Bootstrapping default tenant + admin user"
pnpm --filter @securetrax/api run db:bootstrap
ok "tenant=default admin=admin seeded"

# ---- 10. Pull Ollama model ----

note "Pulling Ollama model: ${OLLAMA_MODEL}"
if ${DOCKER} compose -f infra/docker-compose.yml exec -T ollama \
     ollama list 2>/dev/null | grep -q "${OLLAMA_MODEL%:*}"; then
  ok "model already present"
else
  ${DOCKER} compose -f infra/docker-compose.yml exec -T ollama \
    ollama pull "${OLLAMA_MODEL}"
  ok "model ${OLLAMA_MODEL} ready"
fi

# ---- 11. Done ----

IP="$(hostname -I | awk '{print $1}')"
note "All done."

cat <<EOF

  Web app:    http://${IP}:5173
  OpenAPI:    http://${IP}:3000/api/docs
  Keycloak:   http://${IP}:8081
  Traccar:    http://${IP}:8082
  MinIO:      http://${IP}:9011

Secrets are in ${SECRETS_FILE} (mode 600).

Next:
  1. Run the verifier:   ${APP_DIR}/deploy/verify.sh
  2. From your workstation, open http://${IP}:5173
  3. In the browser console, set a dev token:
       localStorage.setItem('securetrax.token',
         'eyJhbGciOiJSUzI1NiJ9.' +
         btoa(JSON.stringify({ sub: 'admin', tenant_id: 'default' })) +
         '.dev-mode-no-signature');
       location.reload();
  4. Drive simulated traffic:
       cd ${APP_DIR}
       TOKEN=<the-jwt-above> COUNT=8 \\
         pnpm --filter @securetrax/sim-positions run start

EOF
