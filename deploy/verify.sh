#!/usr/bin/env bash
# Smoke test for a freshly bootstrapped SecureTrax-2 stack.
# Run on the VM after bootstrap.sh. Prints green/red per subsystem.

set -uo pipefail

APP_DIR="${APP_DIR:-${HOME}/securetrax-2}"
API_URL="${API_URL:-http://localhost:3000/api}"
TOKEN="${TOKEN:-eyJhbGciOiJSUzI1NiJ9.$(printf '%s' '{"sub":"admin","tenant_id":"default"}' | base64 -w0 | tr '+/' '-_' | tr -d '=').dev-mode-no-signature}"

ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
fail() { printf "  \033[1;31m✗\033[0m %s\n" "$*"; FAIL=1; }
note() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }

FAIL=0

cd "${APP_DIR}/infra"

DOCKER="docker"
docker ps >/dev/null 2>&1 || DOCKER="sudo docker"

note "docker compose services"
SERVICES=$(${DOCKER} compose ps --services 2>/dev/null)
for svc in ${SERVICES}; do
  state=$(${DOCKER} compose ps --format '{{.State}}' "${svc}" 2>/dev/null | head -1)
  if [[ "${state}" == "running" ]]; then
    ok "${svc} running"
  else
    fail "${svc} state=${state:-missing}"
  fi
done

note "API health"
if curl -fsS -m 5 "${API_URL%/api}/api/v1/capabilities" >/dev/null 2>&1; then
  ok "GET /api/v1/capabilities responded (no auth required for capability discovery)"
else
  if curl -fsS -m 5 -H "authorization: Bearer ${TOKEN}" \
       "${API_URL}/v1/capabilities" >/dev/null 2>&1; then
    ok "GET /api/v1/capabilities responded with auth"
  else
    fail "API not responding at ${API_URL}/v1/capabilities"
  fi
fi

note "Module licensing"
CAP_JSON="$(curl -fsS -m 5 -H "authorization: Bearer ${TOKEN}" \
              "${API_URL}/v1/capabilities" 2>/dev/null || true)"
if [[ -n "${CAP_JSON}" ]]; then
  for mod in tracking-traccar telemetry-mqtt video-securevu videowall \
             aircraft-qgc reports-fleet ai-assistant; do
    if echo "${CAP_JSON}" | jq -e --arg m "${mod}" \
         '.modules[]? | select(.id == $m)' >/dev/null 2>&1; then
      ok "${mod} licensed"
    else
      fail "${mod} not licensed (check licenses/active.lic)"
    fi
  done
else
  fail "couldn't parse capabilities JSON"
fi

note "Postgres + RLS"
PG_OUT="$(${DOCKER} compose exec -T postgres psql -U securetrax -d securetrax \
            -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity=true" 2>/dev/null || true)"
if [[ -n "${PG_OUT//[^0-9]/}" && "${PG_OUT//[^0-9]/}" -ge 8 ]]; then
  ok "${PG_OUT//[^0-9]/} tables with RLS forced"
else
  fail "expected ≥8 RLS-protected tables, got '${PG_OUT}'"
fi

note "Mosquitto MQTT"
if mosquitto_pub -h localhost -t 'securetrax/verify/ping' -m 'ok' >/dev/null 2>&1; then
  ok "mqtt publish ok"
else
  fail "mqtt publish failed (mosquitto-clients installed? broker running?)"
fi

note "Traccar"
if curl -fsS -m 5 -o /dev/null -w '%{http_code}' http://localhost:8082/ | grep -qE '^(200|302)$'; then
  ok "Traccar UI reachable on :8082"
else
  fail "Traccar UI not reachable"
fi

note "Ollama"
OLLAMA_TAGS="$(curl -fsS -m 5 http://localhost:11434/api/tags 2>/dev/null || true)"
if [[ -n "${OLLAMA_TAGS}" ]]; then
  if echo "${OLLAMA_TAGS}" | jq -e '.models | length > 0' >/dev/null 2>&1; then
    MODELS="$(echo "${OLLAMA_TAGS}" | jq -r '.models[].name' | paste -sd, -)"
    ok "Ollama responding, models: ${MODELS}"
  else
    fail "Ollama up but no model loaded — run: docker compose exec ollama ollama pull qwen2.5:7b"
  fi
else
  fail "Ollama not responding on :11434"
fi

note "End-to-end position ingest"
ASSET_ID="VERIFY-$(date +%s)"
PUT_RESP="$(curl -fsS -m 5 -X PUT \
  -H "authorization: Bearer ${TOKEN}" -H "content-type: application/json" \
  -d "{\"id\":\"${ASSET_ID}\",\"name\":\"verify\",\"category\":\"vehicle\"}" \
  "${API_URL}/v1/tracking/assets/${ASSET_ID}" 2>/dev/null || true)"
if [[ -n "${PUT_RESP}" ]]; then
  ok "asset upsert ok"
  TS=$(date +%s%3N)
  POS_RESP="$(curl -fsS -m 5 -X POST \
    -H "authorization: Bearer ${TOKEN}" -H "content-type: application/json" \
    -d "{\"ts\":${TS},\"lat\":19.4326,\"lon\":-99.1332,\"speed\":42}" \
    "${API_URL}/v1/tracking/assets/${ASSET_ID}/positions" 2>/dev/null || true)"
  if [[ -n "${POS_RESP}" ]]; then
    ok "position ingested"
    LATEST="$(curl -fsS -m 5 -H "authorization: Bearer ${TOKEN}" \
                "${API_URL}/v1/tracking/positions/latest" 2>/dev/null || true)"
    if echo "${LATEST}" | jq -e --arg a "${ASSET_ID}" \
         '.items[] | select(.assetId == $a)' >/dev/null 2>&1; then
      ok "appears in /positions/latest — pipeline end-to-end OK"
    else
      fail "asset not in /positions/latest — broadcast or storage broke"
    fi
  else
    fail "POST position failed"
  fi
else
  fail "PUT asset failed (auth or controller error)"
fi

note "Compliance evidence"
if curl -fsS -m 5 -H "authorization: Bearer ${TOKEN}" \
     "${API_URL}/v1/compliance/evidence?framework=SOC%202" \
     | jq -e '.controls | length > 0' >/dev/null 2>&1; then
  ok "compliance evidence resolves"
else
  fail "compliance evidence endpoint failed"
fi

echo
if [[ "${FAIL}" -eq 0 ]]; then
  printf "\033[1;32mAll subsystems green.\033[0m\n"
  exit 0
else
  printf "\033[1;31mOne or more subsystems failed — see above.\033[0m\n"
  exit 1
fi
