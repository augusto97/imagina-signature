#!/usr/bin/env bash
# Regenerates languages/imagina-signatures.pot using WP-CLI.
# Falls back to a hint when wp-cli is unavailable.

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v wp >/dev/null 2>&1; then
  echo "WP-CLI is required. Install: https://wp-cli.org/" >&2
  exit 1
fi

wp i18n make-pot . languages/imagina-signatures.pot \
  --domain=imagina-signatures \
  --include="src,assets,imagina-signatures.php,uninstall.php,templates" \
  --exclude="node_modules,vendor,build,dist,tests"

echo "Generated languages/imagina-signatures.pot"
