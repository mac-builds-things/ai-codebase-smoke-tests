#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
file=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('path','') or d.get('file_path','') or '')" 2>/dev/null || echo "")

if echo "$file" | grep -qE "scenarios/|src/checks/"; then
  echo '{
    "additional_context": "You edited a scenario or check file. Run `npm run smoke` against a running app to verify the changes work. Check that reporter output includes `\"passed\": true` at the top level before declaring done."
  }'
  exit 0
fi

exit 0
