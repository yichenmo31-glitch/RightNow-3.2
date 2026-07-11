#!/usr/bin/env bash
set -euo pipefail

for unit in nginx rightnow-backend rightnow-rag rightnow-provisioner; do
  systemctl is-active --quiet "$unit" || { echo "$unit is not active" >&2; exit 1; }
done

systemctl --user -M root@ is-active --quiet openclaw-gateway.service || {
  echo "root user OpenClaw Gateway is not active" >&2
  exit 1
}

for port in 5000 8000 8787 18789 5432; do
  listeners="$(ss -H -lnt "sport = :$port" | awk '{print $4}')"
  if [[ -z "$listeners" ]]; then
    echo "port $port has no listener" >&2
    exit 1
  fi
  if grep -Evq '^(127\.0\.0\.1|\[::1\]):' <<<"$listeners"; then
    echo "port $port has a non-loopback listener" >&2
    exit 1
  fi
done

curl -fsS http://127.0.0.1:8000/health >/dev/null
curl -fsS http://127.0.0.1:18789/healthz >/dev/null
nginx -t
echo "native host validation: OK"
