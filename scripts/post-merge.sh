#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# This imported requirement is not published to the Replit package index and is
# not imported by the current backend. Keep it in requirements.txt for source
# compatibility, but do not let it block environment setup.
python -m pip install --disable-pip-version-check \
  -r <(grep -v '^emergentintegrations==' "$ROOT_DIR/backend/requirements.txt")

if [[ -f "$ROOT_DIR/frontend/package.json" ]]; then
  npm install --prefix "$ROOT_DIR/frontend" --no-audit --no-fund --no-progress --package-lock=false
fi