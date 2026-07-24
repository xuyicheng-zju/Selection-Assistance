#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCAL_BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
LOCAL_DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
APPLICATIONS_DIR="$LOCAL_DATA_DIR/applications"
ICON_DIR="$LOCAL_DATA_DIR/icons/hicolor/512x512/apps"
AUTOSTART_DIR="$CONFIG_DIR/autostart"
APP_LAUNCHER="$LOCAL_BIN_DIR/selection-assistance"
APP_DESKTOP="$APPLICATIONS_DIR/selection-assistance.desktop"
AUTOSTART_DESKTOP="$AUTOSTART_DIR/selection-assistance.desktop"
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || true)"

if [[ -z "$DESKTOP_DIR" ]]; then
  DESKTOP_DIR="$HOME/Desktop"
fi

ENABLE_AUTOSTART=false
if [[ "${1:-}" == "--enable-autostart" ]]; then
  ENABLE_AUTOSTART=true
fi

mkdir -p "$LOCAL_BIN_DIR" "$APPLICATIONS_DIR" "$ICON_DIR" "$AUTOSTART_DIR"
ln -sfn "$FRONTEND_DIR/scripts/selection-assistance-launcher.sh" "$APP_LAUNCHER"
chmod +x "$FRONTEND_DIR/scripts/selection-assistance-launcher.sh"
install -m 0644 "$FRONTEND_DIR/assets/icon.png" "$ICON_DIR/selection-assistance.png"

write_desktop_entry() {
  local target="$1"
  local extra_args="${2:-}"
  local no_display="${3:-false}"
  {
    printf '%s\n' \
      "[Desktop Entry]" \
      "Type=Application" \
      "Version=1.0" \
      "Name=划词助手" \
      "Comment=选中文字即可翻译、解释和追问" \
      "Exec=$APP_LAUNCHER$extra_args" \
      "Icon=selection-assistance" \
      "Terminal=false" \
      "Categories=Utility;Education;" \
      "StartupNotify=true" \
      "StartupWMClass=selection-assistance"
    if [[ "$no_display" == "true" ]]; then
      printf '%s\n' \
        "NoDisplay=true" \
        "X-GNOME-Autostart-enabled=true" \
        "X-Selection-Assistance-Managed=true"
    fi
  } > "$target"
  chmod 0644 "$target"
}

write_desktop_entry "$APP_DESKTOP"

if [[ "$ENABLE_AUTOSTART" == "true" ]]; then
  write_desktop_entry "$AUTOSTART_DESKTOP" " --hidden" "true"
fi

if [[ -d "$DESKTOP_DIR" ]]; then
  install -m 0755 "$APP_DESKTOP" "$DESKTOP_DIR/划词助手.desktop"
  gio set "$DESKTOP_DIR/划词助手.desktop" metadata::trusted true >/dev/null 2>&1 || true
fi

update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true

printf '划词助手已安装到应用菜单。'
if [[ "$ENABLE_AUTOSTART" == "true" ]]; then
  printf ' 开机自启已开启。'
fi
printf '\n'
