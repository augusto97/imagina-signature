#!/usr/bin/env bash
# Regenerates the .pot translation source from PHP and TS sources.
#
# Run from the repo root. Requires `wp` (WP-CLI) for the PHP scan
# and `xgettext` for the TS scan — the .pot file is committed so
# translators can pull it without running this themselves.

set -euo pipefail

POT="languages/imagina-signatures.pot"
mkdir -p languages

# PHP strings via WP-CLI's i18n command.
if command -v wp >/dev/null 2>&1; then
  wp i18n make-pot . "$POT" \
    --domain=imagina-signatures \
    --slug=imagina-signatures \
    --skip-js \
    --exclude=vendor,node_modules,build,dist,tests,assets/editor/src
else
  echo "WP-CLI is not installed; skipping PHP scan." >&2
fi

# TS strings via xgettext for `__('foo')` / `__("foo")` calls.
if command -v xgettext >/dev/null 2>&1; then
  find assets/editor/src -name '*.ts' -o -name '*.tsx' | xgettext \
    --from-code=UTF-8 \
    --language=JavaScript \
    --keyword=__ \
    --output="$POT.ts" \
    --files-from=-

  if [[ -f "$POT.ts" ]]; then
    if [[ -f "$POT" ]]; then
      msgcat --use-first "$POT" "$POT.ts" -o "$POT.merged"
      mv "$POT.merged" "$POT"
    else
      mv "$POT.ts" "$POT"
    fi
    rm -f "$POT.ts"
  fi
else
  echo "xgettext is not installed; skipping TS scan." >&2
fi

echo "Wrote: $POT"
