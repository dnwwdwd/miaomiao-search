#!/bin/sh
set -eu

APP_ROOT=${APP_ROOT:-/opt/miaomiao-search/web}

CONTENT_ROOT=$(CDPATH= cd -- "$(dirname "$APP_ROOT")" && pwd)
for LIB_DIR in "$CONTENT_ROOT/lib/aarch64-linux-gnu" "$CONTENT_ROOT/lib/x86_64-linux-gnu"; do
  if [ -d "$LIB_DIR" ]; then
    LD_LIBRARY_PATH="$LIB_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  fi
done
export LD_LIBRARY_PATH

if [ ! -f "$APP_ROOT/server.js" ]; then
  echo "Next.js standalone entrypoint not found: $APP_ROOT/server.js" >&2
  exit 1
fi

export HOSTNAME=${HOSTNAME:-0.0.0.0}
export PORT=${PORT:-3000}

exec node "$APP_ROOT/server.js"
