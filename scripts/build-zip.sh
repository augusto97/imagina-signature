#!/usr/bin/env bash
# Builds a distribution ZIP for Imagina Signatures.
#
# Output: dist/imagina-signatures-<version>.zip
#
# The ZIP contains a single top-level directory named exactly
# `imagina-signatures/` (no version suffix). WordPress uses the
# directory name as the plugin slug, and our text domain / hooks /
# options all assume `imagina-signatures`, so the folder must NOT
# include the version number.
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

STAGE="dist/stage"
SLUG_DIR="$STAGE/imagina-signatures"
ZIP_FILE="dist/imagina-signatures-$VERSION.zip"

rm -rf "$STAGE" "$ZIP_FILE"
mkdir -p "$SLUG_DIR"

# Mirror the runtime tree into the staged directory. Excludes
# everything that's only needed during development.
rsync -a \
  --exclude='node_modules' \
  --exclude='tests' \
  --exclude='vendor' \
  --exclude='.github' \
  --exclude='.git' \
  --exclude='.gitignore' \
  --exclude='.gitattributes' \
  --exclude='.editorconfig' \
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
  --exclude='patchwork.json' \
  --exclude='CLAUDE.md' \
  --exclude='CONTRIBUTING.md' \
  --exclude='CHANGELOG.md' \
  --exclude='assets/*/src' \
  --exclude='assets/*/public' \
  --exclude='.vite' \
  --exclude='*.tsbuildinfo' \
  ./ "$SLUG_DIR/"

(
  cd "$STAGE"
  zip -rq "../../$ZIP_FILE" "imagina-signatures"
)

rm -rf "$STAGE"
echo "Built: $ZIP_FILE"
echo "Version: $VERSION"
