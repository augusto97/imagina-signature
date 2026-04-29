#!/usr/bin/env bash
# Builds a production-ready ZIP for distribution.
# Output: dist/imagina-signatures-<version>.zip

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(grep -E "^ \* Version:" imagina-signatures.php | awk '{print $3}')"
DIST="dist/imagina-signatures-${VERSION}"

rm -rf "$DIST" "${DIST}.zip"
mkdir -p "$DIST"

# Use rsync to copy only what should ship.
rsync -av \
  --exclude='node_modules' \
  --exclude='tests' \
  --exclude='.github' \
  --exclude='.git' \
  --exclude='.git*' \
  --exclude='*.log' \
  --exclude='dist' \
  --exclude='scripts' \
  --exclude='package.json' \
  --exclude='package-lock.json' \
  --exclude='vite.config.ts' \
  --exclude='tsconfig.json' \
  --exclude='.eslintrc.cjs' \
  --exclude='.prettierrc' \
  --exclude='.prettierignore' \
  --exclude='.editorconfig' \
  --exclude='phpcs.xml.dist' \
  --exclude='phpunit.xml.dist' \
  --exclude='composer.json' \
  --exclude='composer.lock' \
  --exclude='CLAUDE.md' \
  --exclude='CONTRIBUTING.md' \
  --exclude='assets/editor/src' \
  --exclude='assets/admin/src' \
  --exclude='assets/shared' \
  ./ "$DIST/"

(
  cd dist
  zip -r "imagina-signatures-${VERSION}.zip" "imagina-signatures-${VERSION}" >/dev/null
)

echo "Built: dist/imagina-signatures-${VERSION}.zip"
