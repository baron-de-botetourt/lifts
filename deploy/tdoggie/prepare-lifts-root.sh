#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script with sudo: sudo $0" >&2
  exit 1
fi

required_stream="20"

if ! grep -q '^ID="*rocky"*' /etc/os-release; then
  echo "This script is intended for the Rocky Linux VPS described in TDOGGIE_SERVER_SETUP.md." >&2
  exit 1
fi

dnf -y module reset nodejs
dnf -y module enable "nodejs:${required_stream}"
dnf -y install nodejs npm git nginx openssl python3 make gcc gcc-c++

systemctl enable --now nginx
nginx -t

node_major=$(node -p "Number(process.versions.node.split('.')[0])")
if [[ "${node_major}" -lt "${required_stream}" ]]; then
  echo "Expected Node.js ${required_stream}+ after install; found $(node --version)." >&2
  exit 1
fi

echo "Root prerequisites ready:"
echo "  node: $(node --version)"
echo "  npm: $(npm --version)"
echo "  git: $(git --version)"
echo "  nginx: $(systemctl is-active nginx)"
