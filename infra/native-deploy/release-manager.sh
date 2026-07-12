#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: release-manager.sh <prepare|nest-smoke|deploy|rollback> --root PATH [options]

All commands default to dry-run. Mutating commands require --apply and PATH must
contain .rightnow-isolated-root. This tool has no SSH or remote-host support.

Options:
  --release-id ID       Safe release directory name (prepare/deploy)
  --source PATH         Source tree (prepare; defaults to resolved root/current)
  --apply               Perform the requested local mutation
  --service NAME        Service to restart after deploy/rollback (repeatable)
  --service-command CMD Service controller (defaults to systemctl; tests may replace)
  --timeout SECONDS     Nest smoke timeout (default 15)
EOF
}

die() { echo "release-manager: $*" >&2; exit 1; }
log() { echo "release-manager: $*"; }

command_name="${1:-}"
[[ -n "$command_name" ]] || { usage; exit 2; }
shift

root=""
source_path=""
release_id=""
apply=false
timeout_seconds=15
service_command="systemctl"
services=()
while (($#)); do
  case "$1" in
    --root) root="${2:-}"; shift 2 ;;
    --source) source_path="${2:-}"; shift 2 ;;
    --release-id) release_id="${2:-}"; shift 2 ;;
    --apply) apply=true; shift ;;
    --service) services+=("${2:-}"); shift 2 ;;
    --service-command) service_command="${2:-}"; shift 2 ;;
    --timeout) timeout_seconds="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ -n "$root" ]] || die "--root is required"
[[ "$root" = /* ]] || die "--root must be absolute"
root="$(realpath -m -- "$root")"
[[ -f "$root/.rightnow-isolated-root" ]] || die "root lacks .rightnow-isolated-root safety marker"
[[ "$root" != / && "$root" != /opt/rightnow ]] || die "refusing protected root: $root"
[[ "$release_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ || -z "$release_id" ]] || die "invalid release id"
[[ "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] || die "invalid timeout"
for service in "${services[@]}"; do
  [[ "$service" =~ ^rightnow-(backend|rag|provisioner)\.service$ ]] || die "invalid service: $service"
done

resolve_current() {
  local current="$root/current"
  [[ -e "$current" ]] || die "current does not exist: $current"
  realpath -e -- "$current"
}

manifest_release() {
  local release="$1"
  (
    cd "$release"
    find . -type f ! -name ARTIFACTS.sha256 -print0 |
      sort -z |
      xargs -0 -r sha256sum > ARTIFACTS.sha256
  )
}

validate_source() {
  local source="$1"
  if find "$source" -type l -print -quit | grep -q .; then
    die "source contains symbolic links"
  fi
  if find "$source" -type f \( \
      -name '.env' -o -name '.env.*' -o -name '*.dump' -o -name '*.sql' -o \
      -name 'id_*' -o -name '*.pem' -o -name '*.key' \
    \) -print | grep -vE '/\.env\.example$' | grep -q .; then
    die "source contains a forbidden secret or database artifact"
  fi
  if find "$source" -type d \( \
      -name 'chroma_*' -o -name 'workspace-rightnow-*' -o \
      -name 'sessions' -o -name 'uploads' \
    \) -print -quit | grep -q .; then
    die "source contains a forbidden runtime directory"
  fi
}

restart_services() {
  local service
  for service in "${services[@]}"; do
    "$service_command" restart "$service"
    "$service_command" is-active --quiet "$service"
  done
}

case "$command_name" in
  prepare)
    [[ -n "$release_id" ]] || die "prepare requires --release-id"
    if [[ -z "$source_path" ]]; then source_path="$(resolve_current)"; fi
    source_path="$(realpath -e -- "$source_path")"
    [[ -d "$source_path" ]] || die "source is not a directory"
    validate_source "$source_path"
    destination="$root/releases/$release_id"
    [[ ! -e "$destination" ]] || die "release already exists: $destination"
    if ! $apply; then
      log "dry-run prepare source=$source_path destination=$destination"
      exit 0
    fi
    mkdir -p -- "$root/releases"
    staging="$(mktemp -d "$root/releases/.${release_id}.staging.XXXXXX")"
    trap 'rm -rf -- "${staging:-}"' EXIT
    tar -C "$source_path" --exclude=.git --exclude=node_modules --exclude=ARTIFACTS.sha256 -cf - . | tar -C "$staging" -xf -
    manifest_release "$staging"
    (cd "$staging" && sha256sum -c ARTIFACTS.sha256 >/dev/null)
    mv -- "$staging" "$destination"
    trap - EXIT
    log "prepared release=$destination"
    ;;
  nest-smoke)
    release="${release_id:+$root/releases/$release_id}"
    [[ -n "$release" ]] || release="$(resolve_current)"
    release="$(realpath -e -- "$release")"
    entry="$release/backend/dist/main.js"
    [[ -f "$entry" ]] || die "Nest entrypoint missing: $entry"
    log_file="$(mktemp "${TMPDIR:-/tmp}/rightnow-nest-smoke.XXXXXX")"
    trap 'rm -f -- "$log_file"' EXIT
    set +e
    timeout "${timeout_seconds}s" env HOST=127.0.0.1 PORT=0 NODE_ENV=test node "$entry" >"$log_file" 2>&1
    status=$?
    set -e
    if [[ $status -eq 124 ]]; then
      log "Nest startup/DI smoke passed (process remained healthy until timeout)"
    else
      sed -n '1,80p' "$log_file" >&2
      die "Nest startup/DI smoke failed with status $status"
    fi
    ;;
  deploy)
    [[ -n "$release_id" ]] || die "deploy requires --release-id"
    release="$(realpath -e -- "$root/releases/$release_id")"
    [[ -f "$release/ARTIFACTS.sha256" ]] || die "release manifest missing"
    (cd "$release" && sha256sum -c ARTIFACTS.sha256 >/dev/null)
    if ! $apply; then
      log "dry-run deploy release=$release services=${services[*]:-none}"
      exit 0
    fi
    previous=""
    [[ ! -e "$root/current" ]] || previous="$(resolve_current)"
    ln -sfn -- "$release" "$root/current.next"
    mv -Tf -- "$root/current.next" "$root/current"
    [[ -z "$previous" ]] || ln -sfn -- "$previous" "$root/previous"
    if ! restart_services; then
      if [[ -n "$previous" ]]; then
        ln -sfn -- "$previous" "$root/current.next"
        mv -Tf -- "$root/current.next" "$root/current"
      fi
      die "service validation failed; current restored"
    fi
    log "deployed release=$release"
    ;;
  rollback)
    previous="$(realpath -e -- "$root/previous")"
    [[ "$previous" == "$root/releases/"* ]] || die "previous target is outside releases"
    [[ -f "$previous/ARTIFACTS.sha256" ]] || die "previous manifest missing"
    (cd "$previous" && sha256sum -c ARTIFACTS.sha256 >/dev/null)
    if ! $apply; then
      log "dry-run rollback target=$previous services=${services[*]:-none}"
      exit 0
    fi
    current="$(resolve_current)"
    ln -sfn -- "$previous" "$root/current.next"
    mv -Tf -- "$root/current.next" "$root/current"
    ln -sfn -- "$current" "$root/previous"
    if ! restart_services; then
      ln -sfn -- "$current" "$root/current.next"
      mv -Tf -- "$root/current.next" "$root/current"
      die "rollback service validation failed; current restored"
    fi
    log "rolled back target=$previous"
    ;;
  *) usage; die "unknown command: $command_name" ;;
esac
