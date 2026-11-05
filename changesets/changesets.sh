#!/usr/bin/env bash
# Runs `changeset version`, then reads the result: changesets.sh <package> <manager>
set -euo pipefail
package=$1
manager=$2
if [ "$manager" = auto ]; then
  if [ -f pnpm-lock.yaml ]; then manager=pnpm
  elif [ -f yarn.lock ]; then manager=yarn
  else manager=npm
  fi
fi
# Exits 1 with "No unreleased changesets found" when nothing is pending,
# which is the release gate. Consumes .changeset/*.md in this checkout,
# so call it once per job, not twice.
case "$manager" in
  pnpm) pnpm exec changeset version ;;
  yarn) yarn changeset version ;;
  *) npx --no-install changeset version ;;
esac
node "$(dirname "$0")/changesets.mjs" --package "$package"
