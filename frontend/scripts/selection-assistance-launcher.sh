#!/usr/bin/env bash
set -euo pipefail

LAUNCHER_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
FRONTEND_DIR="$(cd "$(dirname "$LAUNCHER_PATH")/.." && pwd)"
ELECTRON_BIN="$FRONTEND_DIR/node_modules/electron/dist/electron"

if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "划词助手依赖未安装，请先在 $FRONTEND_DIR 执行 npm install。" >&2
  exit 1
fi

export NODE_ENV=production
cd "$FRONTEND_DIR"
exec "$ELECTRON_BIN" "$FRONTEND_DIR" --no-sandbox "$@"
