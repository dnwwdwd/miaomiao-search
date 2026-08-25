#!/bin/sh
set -eu

APP_ROOT=/lzcapp/pkg/content/api
OPEN_WEBSEARCH="$APP_ROOT/node_modules/.bin/open-websearch"

"$OPEN_WEBSEARCH" serve --port 3210 &
DAEMON_PID=$!
API_PID=""

cleanup() {
  if [ -n "$API_PID" ]; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  kill "$DAEMON_PID" 2>/dev/null || true
  wait "$DAEMON_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

attempt=0
while ! node -e "fetch('http://127.0.0.1:3210').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Open-WebSearch daemon did not become ready" >&2
    exit 1
  fi
  sleep 1
done

node "$APP_ROOT/dist/index.js" &
API_PID=$!
wait "$API_PID"
