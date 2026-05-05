#!/bin/bash
# Runs on first Postgres init only. Creates the side databases that Keycloak
# and Traccar use, owned by the same `securetrax` user the API authenticates
# as. The main `securetrax` database is created from $POSTGRES_DB by the
# parent image's entrypoint and gets the timescaledb/postgis extensions in
# our 0000 migration.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
  SELECT 'CREATE DATABASE keycloak OWNER ${POSTGRES_USER}'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
  SELECT 'CREATE DATABASE traccar OWNER ${POSTGRES_USER}'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traccar')\gexec
EOSQL
