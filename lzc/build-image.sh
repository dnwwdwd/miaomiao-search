#!/bin/sh
set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$REPO_ROOT"

VERSION=$(sed -n 's/^version:[[:space:]]*//p' package.yml | head -n 1)
ARCH="${LZC_ARCH:-amd64}"
IMAGE_REPOSITORY="${LAZYCAT_IMAGE_REPOSITORY:-docker.io/c1own123/lazycat}"
IMAGE_TAG="${LAZYCAT_IMAGE_TAG:-miaomiao-search-${VERSION}-${ARCH}}"
IMAGE="${IMAGE_REPOSITORY}:${IMAGE_TAG}"

case "$ARCH" in
  amd64) PLATFORM=linux/amd64 ;;
  *) echo "This release currently supports amd64 only (got $ARCH)." >&2; exit 1 ;;
esac

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
command -v lzc-cli >/dev/null 2>&1 || { echo "lzc-cli is required" >&2; exit 1; }

echo "Building $IMAGE for $PLATFORM"
docker build --platform "$PLATFORM" -t "$IMAGE" .

echo "Pushing $IMAGE to Docker Hub"
docker push "$IMAGE"

echo "Copying $IMAGE to the Lazycat official registry"
OFFICIAL_IMAGE=$(lzc-cli appstore copy-image "$IMAGE" --arch "$ARCH" | awk '/registry\.lazycat\.cloud\// { gsub(/[",]/, "", $NF); print $NF }' | tail -n 1)
if [ -z "$OFFICIAL_IMAGE" ]; then
  echo "Could not parse the official registry image from lzc-cli output." >&2
  exit 1
fi

TEMP_MANIFEST=$(mktemp)
trap 'rm -f "$TEMP_MANIFEST"' EXIT
awk -v image="$OFFICIAL_IMAGE" '
  /^[[:space:]]+image:[[:space:]]+/ {
    sub(/image:[[:space:]]+.*/, "image: " image)
    count++
  }
  { print }
  END { if (count < 2) exit 1 }
' lzc-manifest.yml > "$TEMP_MANIFEST"
mv "$TEMP_MANIFEST" lzc-manifest.yml
trap - EXIT

echo "Updated lzc-manifest.yml with $OFFICIAL_IMAGE"
echo "Build the LPK with: lzc-cli project release -o release/miaomiao-search-${VERSION}.lpk"
