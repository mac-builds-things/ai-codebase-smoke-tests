#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
SCENARIO="${1:-react-app}"
echo "Running smoke tests against $BASE_URL..."
npx ts-node src/runner.ts --scenario "$SCENARIO" --base-url "$BASE_URL"
