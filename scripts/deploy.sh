#!/usr/bin/env bash
#
# Stellar Privacy Layer — deployment helper.
#
# Usage:
#   ./scripts/deploy.sh build   # build the image without starting
#   ./scripts/deploy.sh up      # build + start in the background (default)
#   ./scripts/deploy.sh down    # stop and remove the container
#   ./scripts/deploy.sh logs    # follow container logs
#
# Optional environment (loaded from .env if present, see .env.example):
#   PORT                host port to bind (default 3000)
#   VITE_STELLAR_NETWORK  public | testnet | futurenet | sandbox
#   VITE_SOROBAN_RPC_URL  custom Soroban RPC endpoint
#   VITE_CONTRACT_ID      deployed privacy contract ID
#   VITE_HORIZON_URL      custom Horizon endpoint
#   VITE_DEBUG            true | false

set -euo pipefail

cd "$(dirname "$0")/.."

# Load .env if present (git-ignored)
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

ACTION="${1:-up}"

case "$ACTION" in
  build)
    docker compose build
    ;;
  up)
    docker compose up -d --build
    echo "✔ dApp is running at http://localhost:${PORT:-3000}"
    ;;
  down)
    docker compose down
    ;;
  logs)
    docker compose logs -f
    ;;
  *)
    echo "Usage: $0 {build|up|down|logs}" >&2
    exit 1
    ;;
esac
