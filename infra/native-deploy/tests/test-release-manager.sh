#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
tool="$script_dir/../release-manager.sh"
fixture="$(mktemp -d "${TMPDIR:-/tmp}/rightnow-release-test.XXXXXX")"
trap 'rm -rf -- "$fixture"' EXIT

root="$fixture/root"
source_tree="$fixture/source"
mkdir -p "$root/releases/base/backend/dist" "$source_tree/backend/dist"
touch "$root/.rightnow-isolated-root"
printf 'base\n' > "$root/releases/base/backend/dist/main.js"
(cd "$root/releases/base" && sha256sum backend/dist/main.js > ARTIFACTS.sha256)
ln -s "$root/releases/base" "$root/current"
printf 'candidate\n' > "$source_tree/backend/dist/main.js"

"$tool" prepare --root "$root" --source "$source_tree" --release-id next | grep -q 'dry-run'
[[ ! -e "$root/releases/next" ]]
"$tool" prepare --root "$root" --source "$source_tree" --release-id next --apply
(cd "$root/releases/next" && sha256sum -c ARTIFACTS.sha256 >/dev/null)

mkdir -p "$fixture/mock-bin"
cat > "$fixture/mock-bin/node" <<'EOF'
#!/usr/bin/env bash
sleep 5
EOF
chmod +x "$fixture/mock-bin/node"
PATH="$fixture/mock-bin:$PATH" "$tool" nest-smoke --root "$root" --release-id next --timeout 1 |
  grep -q 'startup/DI smoke passed'

if [[ -L "$root/current" ]]; then
  "$tool" deploy --root "$root" --release-id next | grep -q 'dry-run'
  [[ "$(realpath "$root/current")" == "$root/releases/base" ]]
  "$tool" deploy --root "$root" --release-id next --apply
  [[ "$(realpath "$root/current")" == "$root/releases/next" ]]
  [[ "$(realpath "$root/previous")" == "$root/releases/base" ]]

  "$tool" rollback --root "$root" --apply
  [[ "$(realpath "$root/current")" == "$root/releases/base" ]]
else
  echo 'release manager: symlink deploy/rollback skipped on this platform'
fi

if "$tool" prepare --root /opt/rightnow --release-id unsafe --apply 2>/dev/null; then
  echo 'protected production-like root was accepted' >&2
  exit 1
fi
if "$tool" deploy --root "$root" --release-id '../escape' --apply 2>/dev/null; then
  echo 'unsafe release id was accepted' >&2
  exit 1
fi

for forbidden in '.env' 'database.sql' 'id_ed25519'; do
  bad_source="$fixture/bad-${forbidden//[^A-Za-z0-9]/_}"
  mkdir -p "$bad_source/backend/dist"
  printf 'forbidden\n' > "$bad_source/$forbidden"
  if "$tool" prepare --root "$root" --source "$bad_source" --release-id "bad-${forbidden//[^A-Za-z0-9]/-}" --apply 2>/dev/null; then
    echo "forbidden artifact was accepted: $forbidden" >&2
    exit 1
  fi
done

link_source="$fixture/link-source"
mkdir -p "$link_source"
ln -s "$source_tree/backend" "$link_source/backend-link" 2>/dev/null || true
if [[ -L "$link_source/backend-link" ]] && "$tool" prepare --root "$root" --source "$link_source" --release-id bad-link --apply 2>/dev/null; then
  echo 'symbolic link artifact was accepted' >&2
  exit 1
fi

echo 'release manager isolation tests: OK'
