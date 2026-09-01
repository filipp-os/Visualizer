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
node -e '
const fs=require("fs");
const W=process.argv[1], sizes=[16,24,32,48,64,128,256];
const imgs=sizes.map(s=>({s,buf:fs.readFileSync(`${W}/png-${s}.png`)}));
const h=Buffer.alloc(6); h.writeUInt16LE(1,2); h.writeUInt16LE(imgs.length,4);
const dir=Buffer.alloc(16*imgs.length); let off=6+16*imgs.length;
imgs.forEach((im,i)=>{const o=i*16;const d=im.s>=256?0:im.s;
  dir.writeUInt8(d,o);dir.writeUInt8(d,o+1);dir.writeUInt16LE(1,o+4);dir.writeUInt16LE(32,o+6);
  dir.writeUInt32LE(im.buf.length,o+8);dir.writeUInt32LE(off,o+12);off+=im.buf.length;});
fs.writeFileSync("assets/visualizer.ico",Buffer.concat([h,dir,...imgs.map(x=>x.buf)]));
' "$WORK"

cp "$WORK/png-256.png"  assets/visualizer.png
cp "$WORK/png-512.png"  assets/visualizer-512.png
cp "$WORK/png-1024.png" assets/visualizer-1024.png

# keep the .app bundle's copy in sync
cp assets/visualizer.icns "Pedro Visualizer.app/Contents/Resources/visualizer.icns" 2>/dev/null || true

echo "Done. Review assets/ and commit."
