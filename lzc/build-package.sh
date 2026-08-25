#!/bin/sh
set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DIST_ROOT="$REPO_ROOT/lzc-dist"

rm -rf "$DIST_ROOT"
mkdir -p "$DIST_ROOT"

cd "$REPO_ROOT"
export npm_config_platform=linux
export npm_config_arch=x64
export npm_config_libc=glibc

pnpm install --frozen-lockfile
pnpm build

mkdir -p "$DIST_ROOT/web/.next"
cp -R .next/standalone/. "$DIST_ROOT/web/"
cp -R .next/static "$DIST_ROOT/web/.next/static"

pnpm --filter @lazycat-search/server deploy --prod --legacy "$DIST_ROOT/api"
cp -R packages/server/dist "$DIST_ROOT/api/dist"
cp -R packages/server/drizzle "$DIST_ROOT/api/drizzle"
mkdir -p "$DIST_ROOT/lzc"
cp "$REPO_ROOT/lzc/run-api.sh" "$DIST_ROOT/lzc/run-api.sh"
cp "$REPO_ROOT/lzc/run-web.sh" "$DIST_ROOT/lzc/run-web.sh"
