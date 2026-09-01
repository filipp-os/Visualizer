#!/bin/bash
# Regenerate every launcher icon from assets/visualizer.svg.
#
# macOS only (uses the built-in qlmanage / sips / iconutil, plus node). Run it
# after changing the logo:  bash scripts/make-icons.sh
#
# Outputs, all committed:
#   assets/visualizer.icns          -> Pedro Visualizer.app
#   assets/visualizer.ico           -> Windows shortcut icon
#   assets/visualizer.png (256)     -> Linux menu icon
#   assets/visualizer-512.png, -1024.png

set -e
cd "$(cd "$(dirname "$0")/.." && pwd)"

SRC="assets/visualizer.svg"
[ -f "$SRC" ] || { echo "Missing $SRC"; exit 1; }
command -v qlmanage >/dev/null || { echo "qlmanage not found (macOS only script)"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Rasterising $SRC ..."
qlmanage -t -s 1024 -o "$WORK" "$SRC" >/dev/null 2>&1
MASTER="$WORK/$(basename "$SRC").png"
[ -f "$MASTER" ] || { echo "qlmanage produced no PNG"; exit 1; }

# QuickLook ignores the SVG's rounded-corner clipPath, so it leaves opaque
# white corners. Re-apply the rounding to the master before downscaling.
echo "Rounding corners ..."
node "$(dirname "$0")/round-corners.mjs" "$MASTER" 0.2

for s in 16 24 32 48 64 128 256 512 1024; do
  sips -z "$s" "$s" "$MASTER" --out "$WORK/png-$s.png" >/dev/null
done

echo "Building .icns ..."
ISET="$WORK/icon.iconset"; mkdir -p "$ISET"
cp "$WORK/png-16.png"  "$ISET/icon_16x16.png"
cp "$WORK/png-32.png"  "$ISET/icon_16x16@2x.png"
cp "$WORK/png-32.png"  "$ISET/icon_32x32.png"
cp "$WORK/png-64.png"  "$ISET/icon_32x32@2x.png"
cp "$WORK/png-128.png" "$ISET/icon_128x128.png"
cp "$WORK/png-256.png" "$ISET/icon_128x128@2x.png"
cp "$WORK/png-256.png" "$ISET/icon_256x256.png"
cp "$WORK/png-512.png" "$ISET/icon_256x256@2x.png"
cp "$WORK/png-512.png" "$ISET/icon_512x512.png"
cp "$WORK/png-1024.png" "$ISET/icon_512x512@2x.png"
iconutil -c icns "$ISET" -o assets/visualizer.icns

echo "Building .ico ..."
node "$(dirname "$0")/png-to-ico.mjs" assets/visualizer.ico "$WORK"

cp "$WORK/png-256.png"  assets/visualizer.png
cp "$WORK/png-512.png"  assets/visualizer-512.png
cp "$WORK/png-1024.png" assets/visualizer-1024.png

# keep the .app bundle's copy in sync
cp assets/visualizer.icns "Pedro Visualizer.app/Contents/Resources/visualizer.icns" 2>/dev/null || true

echo "Done. Review assets/ and commit."
