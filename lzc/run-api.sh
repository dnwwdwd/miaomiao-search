#!/bin/sh
set -eu

APP_ROOT=${APP_ROOT:-/opt/miaomiao-search/api}
DAEMON_HOST=${OPEN_WEBSEARCH_DAEMON_HOST:-127.0.0.1}
DAEMON_PORT=${OPEN_WEBSEARCH_DAEMON_PORT:-3210}
DAEMON_URL="http://${DAEMON_HOST}:${DAEMON_PORT}"
DAEMON_ENTRYPOINT="$APP_ROOT/run-open-websearch.mjs"
API_ENTRYPOINT="$APP_ROOT/dist/index.js"
DATA_PATH=${DATA_DIR:-/lzcapp/var/miaomiao-search/data}

# Native modules are built for the target image architecture. Keep a bundled
# toolchain runtime available on images that do not ship libstdc++.
CONTENT_ROOT=$(CDPATH= cd -- "$(dirname "$APP_ROOT")" && pwd)
for LIB_DIR in "$CONTENT_ROOT/lib/aarch64-linux-gnu" "$CONTENT_ROOT/lib/x86_64-linux-gnu"; do
  if [ -d "$LIB_DIR" ]; then
    LD_LIBRARY_PATH="$LIB_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  fi
done
export LD_LIBRARY_PATH

if [ ! -f "$DAEMON_ENTRYPOINT" ]; then
  echo "Open-WebSearch entrypoint not found: $DAEMON_ENTRYPOINT" >&2
  exit 1
fi

if [ ! -f "$API_ENTRYPOINT" ]; then
  echo "Fastify entrypoint not found: $API_ENTRYPOINT" >&2
  exit 1
fi

mkdir -p "$DATA_PATH"

# The API rejects an unsafe daemon mode in production. Keep the package safe by
# default while still allowing an explicit value for local diagnostics.
export SEARCH_MODE=${SEARCH_MODE:-request}
export OPEN_WEBSEARCH_DAEMON_VERSION=${OPEN_WEBSEARCH_DAEMON_VERSION:-${OPEN_WEBSEARCH_VERSION:-2.1.11}}

DAEMON_PID=""
API_PID=""

cleanup() {
  if [ -n "$API_PID" ]; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  if [ -n "$DAEMON_PID" ]; then
    kill "$DAEMON_PID" 2>/dev/null || true
    wait "$DAEMON_PID" 2>/dev/null || true
  fi
}

stop_on_signal() {
  cleanup
  exit 143
}

trap cleanup EXIT
trap stop_on_signal INT TERM

node "$DAEMON_ENTRYPOINT" serve --host "$DAEMON_HOST" --port "$DAEMON_PORT" &
DAEMON_PID=$!

attempt=0
while :; do
  if ! kill -0 "$DAEMON_PID" 2>/dev/null; then
    echo "Open-WebSearch daemon exited before becoming ready" >&2
    wait "$DAEMON_PID" 2>/dev/null || true
    exit 1
  fi

  if node -e 'fetch(process.argv[1]).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))' "$DAEMON_URL/health"; then
    break
  fi

  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Open-WebSearch daemon did not become ready at $DAEMON_URL/health" >&2
    exit 1
  fi
  sleep 1
done

node "$API_ENTRYPOINT" &
API_PID=$!

set +e
wait "$API_PID"
API_STATUS=$?
set -e
exit "$API_STATUS"
