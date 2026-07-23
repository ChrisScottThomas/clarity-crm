#!/bin/sh
# Poll a health URL until it returns 200, or fail after a timeout.
# Usage: wait-for-health.sh <url> <timeout-seconds>
set -e
URL="$1"
TIMEOUT="${2:-90}"
ELAPSED=0
while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL")" = "200" ]; then
    echo "healthy after ${ELAPSED}s: $URL"
    exit 0
  fi
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done
echo "FAILED: $URL never returned 200 within ${TIMEOUT}s" >&2
exit 1
