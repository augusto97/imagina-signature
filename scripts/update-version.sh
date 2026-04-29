#!/usr/bin/env bash
# Bumps the plugin version in every place that references it.
# Usage: scripts/update-version.sh 1.1.0

set -euo pipefail

new_version="${1:-}"
if [[ -z "$new_version" ]]; then
  echo "Usage: $0 <new_version>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

# Plugin header.
sed -i.bak -E "s/^( \* Version: ).*/\1${new_version}/" imagina-signatures.php

# Constant.
sed -i.bak -E "s/define\( 'IMGSIG_VERSION', '[^']+' \)/define( 'IMGSIG_VERSION', '${new_version}' )/" imagina-signatures.php

# readme.txt.
sed -i.bak -E "s/^Stable tag: .*/Stable tag: ${new_version}/" readme.txt

# package.json.
node - <<EOF
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${new_version}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
EOF

rm -f imagina-signatures.php.bak readme.txt.bak

echo "Bumped version to ${new_version}"
