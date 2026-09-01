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
