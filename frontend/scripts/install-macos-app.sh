#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
frontend_dir="$PWD"
backend_dir="$HOME/Library/Application Support/selection-assistance/backend"
app_path="/Applications/Selection Assistance.app"
if [[ ! -w /Applications ]]; then
  app_path="$HOME/Applications/Selection Assistance.app"
fi
if [[ -d "$app_path" ]] && ! /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Contents/Info.plist" |
  /usr/bin/grep -qx 'com.xuyicheng.selection-assistance'; then
  echo "已有应用占用 $app_path" >&2
  exit 1
fi

codex_bin="$(command -v codex)"
codex app-server --help >/dev/null
uv_bin="$(command -v uv)"
mkdir -p build
swiftc -O scripts/read-selection.swift -o build/read-selection
CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder \
  --mac dir \
  -c.mac.identity=null \
  -c.mac.icon=assets/icon.png \
  -c.directories.output=release

built_app="$(find "$frontend_dir/release" -type d -name 'Selection Assistance.app' -prune -print -quit)"
if [[ -z "$built_app" ]]; then
  echo "未找到打包的 macOS 应用" >&2
  exit 1
fi
/usr/bin/codesign --verify --deep "$built_app" 2>/dev/null ||
  /usr/bin/codesign --force --deep --sign - "$built_app"

mkdir -p "$backend_dir"
cp ../backend/pyproject.toml ../backend/README.md ../backend/uv.lock "$backend_dir/"
/usr/bin/ditto ../backend/app "$backend_dir/app"
if [[ ! -e "$backend_dir/.env" ]]; then
  printf 'MODEL_BACKEND=dashscope\nDASHSCOPE_MODEL=qwen3.8-flash\nDASHSCOPE_API_KEY=\nCODEX_APP_SERVER_BIN="%s"\nLOCAL_PHONETICS_ONLY=true\n' "$codex_bin" > "$backend_dir/.env"
  chmod 600 "$backend_dir/.env"
fi
"$uv_bin" sync --project "$backend_dir" --frozen --no-install-project
mkdir -p "$(dirname "$app_path")"
/usr/bin/ditto "$built_app" "$app_path"
/usr/bin/open -a "$app_path" --args --enable-autostart
printf '已安装到 %s\n' "$app_path"
