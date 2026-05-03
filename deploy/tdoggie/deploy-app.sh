#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/baron-de-botetourt/lifts.git"
APP_DIR="/home/tindell/lifts"

if [[ "$(id -un)" != "tindell" ]]; then
  echo "Run this script as tindell." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required before deploying Lifts." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required before deploying Lifts." >&2
  echo "Run sudo /home/tindell/codex-lifts-deploy/prepare-lifts-root.sh first." >&2
  exit 1
fi

node_major=$(node -p "Number(process.versions.node.split('.')[0])")
if [[ "${node_major}" -lt 20 ]]; then
  echo "Node.js 20+ is required; found $(node --version)." >&2
  echo "Run sudo /home/tindell/codex-lifts-deploy/prepare-lifts-root.sh first." >&2
  exit 1
fi

if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" fetch --prune origin
  git -C "${APP_DIR}" switch main
  git -C "${APP_DIR}" pull --ff-only origin main
elif [[ -e "${APP_DIR}" ]]; then
  echo "${APP_DIR} exists but is not a git checkout; move it aside before deploying." >&2
  exit 1
else
  git clone --branch main "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"
npm ci
npm test
npm prune --omit=dev

echo "App checkout ready at ${APP_DIR}"
echo "Next: sudo ${APP_DIR}/deploy/tdoggie/apply-lifts-root.sh"
