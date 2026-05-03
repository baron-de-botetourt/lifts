#!/usr/bin/env bash
set -euo pipefail

DOMAIN="lifts.tdoggie.com"
PORT="3002"
EXPECTED_IP="173.230.136.222"

echo "Node: $(node --version 2>/dev/null || echo missing)"
echo "npm: $(npm --version 2>/dev/null || echo missing)"
echo "git: $(git --version 2>/dev/null || echo missing)"
echo "nginx active: $(systemctl is-active nginx 2>/dev/null || true)"
echo "nginx enabled: $(systemctl is-enabled nginx 2>/dev/null || true)"
echo "lifts active: $(systemctl is-active lifts 2>/dev/null || true)"
echo "lifts enabled: $(systemctl is-enabled lifts 2>/dev/null || true)"

resolved_ip=$(getent ahostsv4 "${DOMAIN}" | awk '{print $1; exit}' || true)
echo "${DOMAIN} resolves to: ${resolved_ip:-unresolved}"
if [[ "${resolved_ip:-}" != "${EXPECTED_IP}" ]]; then
  echo "Expected ${DOMAIN} to resolve to ${EXPECTED_IP}" >&2
fi

if command -v ss >/dev/null 2>&1; then
  echo "Listener on ${PORT}:"
  ss -ltnp "sport = :${PORT}" || true
fi

echo "Local app check:"
curl -fsSI "http://127.0.0.1:${PORT}/login" | sed -n '1,8p'

echo "Local nginx vhost check:"
curl -fsSI -H "Host: ${DOMAIN}" "http://127.0.0.1/login" | sed -n '1,8p'

if [[ "${resolved_ip:-}" == "${EXPECTED_IP}" ]]; then
  echo "Public HTTPS check:"
  curl -fsSI "https://${DOMAIN}/login" | sed -n '1,12p'
else
  echo "Skipping public HTTPS check until DNS resolves to ${EXPECTED_IP}."
fi
