#!/usr/bin/env bash
# Local pre-commit hook entry point. Symlink as .git/hooks/pre-commit
# to enforce lint + tests before every commit.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f composer.json ]]; then
  composer run lint
  composer run test
fi

if [[ -f package.json ]]; then
  npm run typecheck --silent
  npm run lint --silent
fi
