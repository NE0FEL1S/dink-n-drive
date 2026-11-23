#!/usr/bin/env bash
# Waits until the deployment at $STAGING_URL serves commit $GITHUB_SHA.
# Vercel points the staging branch URL at the newest build of `staging`; the app
# reports the commit it was built from at /api/version.
set -euo pipefail

: "${STAGING_URL:?STAGING_URL is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
timeout_s=${WAIT_TIMEOUT_SECONDS:-900}
deadline=$(( $(date +%s) + timeout_s ))

while (( $(date +%s) < deadline )); do
  served=$(curl -fsS --max-time 10 -H "Cache-Control: no-cache" "${STAGING_URL}/api/version?t=$(date +%s)" 2>/dev/null \
    | sed -n 's/.*"commit":"\([0-9a-f]*\)".*/\1/p' || true)
  if [[ "$served" == "$GITHUB_SHA" ]]; then
    echo "Staging serves ${GITHUB_SHA:0:7}." >&2
    exit 0
  fi
  echo "Waiting for staging to serve ${GITHUB_SHA:0:7} (now: ${served:-none})…" >&2
  sleep 15
done

echo "Staging did not serve ${GITHUB_SHA} within ${timeout_s}s. Check the Vercel deployment." >&2
exit 1
