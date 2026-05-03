#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script with sudo: sudo $0" >&2
  exit 1
fi

APP_USER="tindell"
APP_DIR="/home/tindell/lifts"
ENV_DIR="/etc/lifts"
ENV_FILE="${ENV_DIR}/lifts.env"
DATA_DIR="/var/lib/lifts"
DB_FILE="${DATA_DIR}/lifts.sqlite"
SERVICE_FILE="/etc/systemd/system/lifts.service"
NGINX_AVAILABLE="/etc/nginx/sites-available/lifts.tdoggie.com"
NGINX_ENABLED="/etc/nginx/sites-enabled/lifts.tdoggie.com"
DOMAIN="lifts.tdoggie.com"
PORT="3002"

if [[ ! -f "${APP_DIR}/server.js" ]]; then
  echo "Expected app checkout at ${APP_DIR}" >&2
  exit 1
fi

ts=$(date +%Y%m%d-%H%M%S)
backup="/root/codex-lifts-deploy-${ts}"
mkdir -p "${backup}"
cp -a /etc/nginx/nginx.conf "${backup}/" 2>/dev/null || true
cp -a /etc/nginx/sites-available "${backup}/" 2>/dev/null || true
cp -a /etc/nginx/sites-enabled "${backup}/" 2>/dev/null || true
[[ -f "${SERVICE_FILE}" ]] && cp -a "${SERVICE_FILE}" "${backup}/"
[[ -f "${ENV_FILE}" ]] && cp -a "${ENV_FILE}" "${backup}/"

mkdir -p "${ENV_DIR}" "${DATA_DIR}"
chown "${APP_USER}:${APP_USER}" "${DATA_DIR}"
chmod 750 "${DATA_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  if [[ -t 0 ]]; then
    read -r -s -p "Lifts login password: " lifts_password
    echo
  else
    echo "Set LIFTS_PASSWORD in the environment or run interactively." >&2
    exit 1
  fi

  if [[ -z "${lifts_password}" ]]; then
    echo "LIFTS_PASSWORD cannot be empty." >&2
    exit 1
  fi

  session_secret=$(openssl rand -base64 48)
  cat > "${ENV_FILE}" <<EOF
HOST=127.0.0.1
PORT=${PORT}
NODE_ENV=production
LIFTS_DB_PATH=${DB_FILE}
LIFTS_PASSWORD=${lifts_password}
LIFTS_SESSION_SECRET=${session_secret}
EOF
  chown root:"${APP_USER}" "${ENV_FILE}"
  chmod 640 "${ENV_FILE}"
else
  echo "Keeping existing ${ENV_FILE}"
fi

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Lifts workout tracker
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > "${NGINX_AVAILABLE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"

systemctl daemon-reload
systemctl enable lifts.service
systemctl restart lifts.service

nginx -t
systemctl reload nginx

if command -v certbot >/dev/null 2>&1; then
  if getent ahostsv4 "${DOMAIN}" | awk '{print $1; exit}' | grep -qx '173.230.136.222'; then
    certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --redirect || {
      echo "Certbot failed. The app is running over HTTP; rerun certbot after DNS is settled." >&2
    }
  else
    echo "Skipping certbot because ${DOMAIN} does not resolve to 173.230.136.222 yet."
  fi
else
  echo "Skipping certbot because certbot is not available on PATH."
fi

systemctl status lifts.service --no-pager
echo "Root setup complete. Backup: ${backup}"
