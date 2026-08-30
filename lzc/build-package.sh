#!/bin/sh
set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DIST_ROOT="$REPO_ROOT/lzc-dist"
MANIFEST="$REPO_ROOT/lzc-manifest.yml"

if grep -q 'REPLACE_ME' "$MANIFEST"; then
  echo "lzc-manifest.yml still contains a placeholder image. Run lzc/build-image.sh first." >&2
  exit 1
fi

IMAGE_LINES=$(grep -E '^[[:space:]]+image:[[:space:]]+registry\.lazycat\.cloud/' "$MANIFEST" | wc -l | tr -d ' ')
if [ "$IMAGE_LINES" -lt 2 ]; then
  echo "The release manifest must reference the copied Lazycat registry image for web and api." >&2
  exit 1
fi

if grep -E '^[[:space:]]+image:' "$MANIFEST" | grep -v 'registry.lazycat.cloud/' >/dev/null 2>&1; then
  echo "All runtime service images must come from registry.lazycat.cloud." >&2
  exit 1
fi

rm -rf "$DIST_ROOT"
mkdir -p "$DIST_ROOT"
cat > "$DIST_ROOT/README.txt" <<'EOF'
Miaomiao Search runtime files are delivered by the official Lazycat container image.
Persistent data is stored under /lzcapp/var/miaomiao-search/data.
EOF
