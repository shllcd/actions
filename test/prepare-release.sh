#!/usr/bin/env bash
# Self-check for the changelog, changesets and release scripts: bash test/prepare-release.sh
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD
changelog=changelog/changelog.mjs
changesets=changesets/changesets.mjs
release=prepare-release/release.mjs
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
fail=0

expect() { # name expected actual
  if [ "$2" = "$3" ]; then
    echo "ok   $1"
  else
    echo "FAIL $1: expected '$2', got '$3'"
    fail=1
  fi
}

cat > CHANGELOG.md <<'EOF'
# Changelog

## [Unreleased]

### Added

- first
EOF
out=$(node "$OLDPWD/$changelog")
expect 'first release is 0.1.0' '0.1.0' "$(echo "$out" | grep -o '"version": "[^"]*"' | cut -d'"' -f4)"

cat > CHANGELOG.md <<'EOF'
## [Unreleased]

### Fixed

- bug

## [1.4.2] - 2026-01-01
EOF
out=$(node "$OLDPWD/$changelog")
expect 'fixed -> patch' '1.4.3' "$(echo "$out" | grep -o '"version": "[^"]*"' | cut -d'"' -f4)"

cat > CHANGELOG.md <<'EOF'
## [Unreleased]

### Breaking

- gone

## [0.3.1] - 2026-01-01
EOF
out=$(node "$OLDPWD/$changelog")
expect 'breaking below 1.0 stays minor' '0.4.0' "$(echo "$out" | grep -o '"version": "[^"]*"' | cut -d'"' -f4)"

cat > CHANGELOG.md <<'EOF'
## [Unreleased]

### Breaking

- gone

## [1.4.2] - 2026-01-01
EOF
out=$(node "$OLDPWD/$changelog" --bump auto)
expect 'breaking at 1.x -> major' '2.0.0' "$(echo "$out" | grep -o '"version": "[^"]*"' | cut -d'"' -f4)"

out=$(node "$OLDPWD/$changelog" --bump minor 2>&1 || true)
expect 'explicit bump wins' '1.5.0' "$(echo "$out" | grep -o '"version": "[^"]*"' | cut -d'"' -f4)"

cat > CHANGELOG.md <<'EOF'
## [Unreleased]

## [0.1.0] - 2026-10-20
EOF
if out=$(node "$OLDPWD/$changelog" 2>&1); then
  echo 'FAIL empty Unreleased must fail'; fail=1
else
  expect 'empty Unreleased fails' 'yes' "$(echo "$out" | grep -q 'has no entries' && echo yes || echo no)"
fi

cat > CHANGELOG.md <<'EOF'
## [Unreleased]

### Added

- tap-to-copy links

## [1.0.0] - 2026-01-01
EOF
echo '{"name":"x","version":"1.0.0"}' > package.json
printf '[package]\nname = "x"\nversion = "1.0.0"\n\n[dependencies]\nversion = "9.9.9"\n' > Cargo.toml
node "$OLDPWD/$changelog" --write > /dev/null
node "$OLDPWD/$release" --version 1.1.0 --write-manifest > /dev/null
expect 'package.json bumped' '1.1.0' "$(node -p "require('./package.json').version")"
expect 'Cargo.toml package version bumped' 'version = "1.1.0"' "$(grep -m1 'version' Cargo.toml)"
expect 'dependency version untouched' 'version = "9.9.9"' "$(tail -1 Cargo.toml)"
expect 'changelog section added' 'yes' "$(grep -q '## \[1.1.0\]' CHANGELOG.md && echo yes || echo no)"
expect 'unreleased kept empty' 'yes' "$(sed -n '/## \[Unreleased\]/,/## \[1.1.0\]/p' CHANGELOG.md | grep -q '^-' && echo no || echo yes)"

# tyx layout: workspace package version plus path dependencies that must ship the same version
cat > CHANGELOG.md <<'EOF'
## [Unreleased]

### Fixed

- nope

## [0.4.0] - 2026-01-01
EOF
cat > Cargo.toml <<'EOF'
[package]
name = "tyx"
version = "0.4.0"

[dependencies]
tyx-ir = { path = "../ir" }
tyx-derive = { path = "../derive", version = "0.4.0" }

[dev-dependencies]
helper = { path = "../helper" }
EOF
node "$OLDPWD/$release" --version 0.4.1 --write-manifest > /dev/null
expect 'path dep without version gains one' 'tyx-ir = { path = "../ir", version = "0.4.1" }' "$(sed -n '6p' Cargo.toml)"
expect 'path dep with version is bumped' 'tyx-derive = { path = "../derive", version = "0.4.1" }' "$(sed -n '7p' Cargo.toml)"
expect 'dev-dependencies path version bumped too' 'helper = { path = "../helper", version = "0.4.1" }' "$(sed -n '10p' Cargo.toml)"

# napi layout: optional dependencies follow the package version
cat > package.json <<'EOF'
{"name":"orisu","version":"0.4.0","optionalDependencies":{"@orisu/binding-darwin-x64":"0.4.0"}}
EOF
node "$OLDPWD/$release" --version 0.4.1 --write-manifest > /dev/null
expect 'optionalDependencies bumped' '0.4.1' "$(node -p "require('./package.json').optionalDependencies['@orisu/binding-darwin-x64']")"

# changesets mode: version comes from the bumped manifest, notes from its CHANGELOG
mkdir -p pkg
echo '{"name":"@x/core","version":"0.5.0"}' > pkg/package.json
printf '# @x/core\n\n## 0.5.0\n\n### Minor Changes\n\n- Add the thing\n\n## 0.4.0\n\n### Patch Changes\n\n- old\n' > pkg/CHANGELOG.md
cs=$(node "$OLDPWD/$changesets" --package pkg)
cs_notes=$(echo "$cs" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).notes)')
out=$(NOTES="$cs_notes" node "$OLDPWD/$release" --version "$(echo "$cs" | grep -o '"version": "[^"]*"' | cut -d'"' -f4)" --notes-file notes-cs.md)
expect 'changesets reads the manifest version' '0.5.0' "$(echo "$out" | grep -o '"version": "[^"]*"' | cut -d'"' -f4)"
expect 'changesets tag' 'v0.5.0' "$(echo "$out" | grep -o '"tag": "[^"]*"' | cut -d'"' -f4)"
expect 'changesets notes are the top section' '### Minor Changes' "$(head -1 notes-cs.md)"
expect 'changesets notes stop at the previous release' 'no' "$(grep -q 'old' notes-cs.md && echo yes || echo no)"

# Blank lines are normalised around the new heading only, so a fenced block in
# the older part of the file keeps its spacing.
printf '%s\n' '## [Unreleased]' '' '### Fixed' '' '- x' '' '## [1.0.0] - 2026-01-01' '' '```' 'a' '' '' 'b' '```' > CHANGELOG.md
node "$OLDPWD/$changelog" --write > /dev/null
expect 'code block blank lines kept' '4' "$(sed -n '/^a$/,/^b$/p' CHANGELOG.md | wc -l | tr -d ' ')"

# Notes leave the action as text, so they survive a job boundary.
printf '%s\n' '## [Unreleased]' '' '### Fixed' '' '- y' '' '## [1.0.0] - 2026-01-01' > CHANGELOG.md
GITHUB_OUTPUT="$work/output" NOTES="$(printf '### Fixed\n\n- y')" node "$OLDPWD/$release" --version 1.0.1 --notes-file notes.md > /dev/null
expect 'version output is plain' 'yes' "$(grep -q '^version=1.0.1$' output && echo yes || echo no)"
expect 'multi-line notes use a delimiter' 'yes' "$(grep -q '^notes<<ghadelimiter_' output && echo yes || echo no)"
expect 'notes text is the unreleased section' 'yes' "$(grep -q '^### Fixed$' output && echo yes || echo no)"
expect 'notes-file output is the path' 'yes' "$(grep -q '^notes-file=notes.md$' output && echo yes || echo no)"

# No source: the latest tag plus bump, or an explicit version.
git init -q tags && cd tags
release=$root/prepare-release/release.mjs
git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
for t in v1.2.3 v1.10.0 other-9.9.9; do git -c tag.gpgsign=false tag "$t"; done
out=$(node "$release")
expect 'no source: latest tag plus patch' '1.10.1' "$(echo "$out" | grep -o '"version": "[^"]*"' | cut -d'"' -f4)"
out=$(node "$release" --bump minor)
expect 'no source: bump minor' '1.11.0' "$(echo "$out" | grep -o '"version": "[^"]*"' | cut -d'"' -f4)"
out=$(node "$release" --version v2.0.0)
expect 'explicit version drops the prefix' 'v2.0.0' "$(echo "$out" | grep -o '"tag": "[^"]*"' | cut -d'"' -f4)"
cd ..

exit "$fail"
