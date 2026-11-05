#!/usr/bin/env bash
# Regenerates languages/imagina-signatures.pot from the PHP and TS sources.
#
# Kept for backwards compatibility — the pipeline now lives in
# scripts/i18n/ and needs only Node + the php CLI (no WP-CLI / gettext):
#
#   npm run i18n:pot      # extract PHP + JS strings into the .pot
#   npm run i18n:update   # merge the .pot into languages/*.po
#   npm run i18n:build    # compile .po → .mo (PHP) + .json (React apps)
#   npm run i18n:check    # fail if anything is untranslated or stale

set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/i18n/make-pot.mjs "$@"
