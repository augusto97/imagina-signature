#!/usr/bin/env bash
# Builds a distribution ZIP for Imagina Signatures.
#
# Bundles only the files the plugin needs at runtime — drops dev
# tooling, tests, sources of compiled assets. The output lands in
# dist/imagina-signatures-<version>.zip and is what end users
# install via Plugins → Add New → Upload Plugin.
#
# Run from the repo root.

set -euo pipefail

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required" >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required" >&2
  exit 1
fi

VERSION="$(grep -oE "Version:\s*[0-9.]+" imagina-signatures.php | head -n1 | awk '{print $2}')"
if [[ -z "$VERSION" ]]; then
  echo "Could not parse version from imagina-signatures.php" >&2
  exit 1
fi

DIST="dist/imagina-signatures-$VERSION"

rm -rf "$DIST" "$DIST.zip"
mkdir -p "$DIST"

rsync -av \
  --exclude='node_modules' \
  --exclude='tests' \
  --exclude='.github' \
  --exclude='.git*' \
  --exclude='dist' \
  --exclude='scripts' \
  --exclude='package*.json' \
  --exclude='vite.config.ts' \
  --exclude='tsconfig.json' \
  --exclude='tailwind.config.ts' \
  --exclude='postcss.config.js' \
  --exclude='components.json' \
  --exclude='.eslintrc*' \
  --exclude='.prettierrc' \
  --exclude='phpcs.xml.dist' \
  --exclude='phpunit.xml.dist' \
  --exclude='composer.json' \
  --exclude='composer.lock' \
  --exclude='CLAUDE.md' \
  --exclude='CONTRIBUTING.md' \
  --exclude='assets/*/src' \
  --exclude='assets/*/public' \
  ./ "$DIST/"

cd dist
zip -rq "imagina-signatures-$VERSION.zip" "imagina-signatures-$VERSION"
echo "Built: dist/imagina-signatures-$VERSION.zip"
