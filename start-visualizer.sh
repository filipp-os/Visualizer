#!/bin/bash
# One-click launcher for the Pedro Pathing Visualizer (macOS / Linux).
#
# macOS: double-click "start-visualizer.command" (it runs this).
# Linux: mark this file executable, then run it, or use the .desktop launcher.
#
# It cds into its own folder, installs dependencies the first time, starts the
# dev server, and opens your browser. Close the window / Ctrl+C to stop.

set -e

# Resolve this script's directory (works whether run directly or via the
# .command wrapper), without GNU-only `readlink -f`.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Pedro Pathing Visualizer"
echo "Folder: $SCRIPT_DIR"
echo

# On Linux, register a "Pedro Visualizer" application menu entry with the duck
# icon so it shows up in the launcher / can be pinned to the dock. Cheap, runs
# every time so the path stays correct even if you move the folder.
install_linux_launcher() {
  [ "$(uname -s)" = "Linux" ] || return 0
  local apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  local icons="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
  mkdir -p "$apps" "$icons" || return 0
  cp -f "$SCRIPT_DIR/assets/visualizer.png" "$icons/pedro-visualizer.png" 2>/dev/null || return 0
  # Exec is the absolute path to the script (not a `bash -c` wrapper) so every
  # desktop environment accepts it as a launcher and lets you pin it.
  cat > "$apps/pedro-visualizer.desktop" <<EOF || return 0
[Desktop Entry]
Type=Application
Name=Pedro Visualizer
Comment=Path visualizer for Pedro Pathing
Exec="$SCRIPT_DIR/start-visualizer.sh"
Path=$SCRIPT_DIR
Icon=pedro-visualizer
Terminal=true
Categories=Development;Education;
EOF
  chmod +x "$apps/pedro-visualizer.desktop" 2>/dev/null || true
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$apps" >/dev/null 2>&1 || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" >/dev/null 2>&1 || true
}
install_linux_launcher || true

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: Node.js / npm is not installed (or not on PATH)."
  echo "Install the LTS version from https://nodejs.org and run this again."
  echo
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run - installing dependencies (a few minutes, only once)..."
  npm install
  echo
fi

echo "Checking for updates and starting the dev server..."
echo "A browser tab will open automatically. Leave this window open while you"
echo "use the visualizer; close it (or press Ctrl+C) to stop the server."
echo
exec npm start
