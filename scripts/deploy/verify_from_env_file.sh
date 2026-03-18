#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.deploy}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE"
  echo "Create it from .env.deploy.example"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

pnpm deploy:verify
