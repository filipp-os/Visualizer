// Knock the corners of a square PNG transparent with a rounded-rect alpha mask.
// The logo SVG rounds its corners via a clipPath that macOS QuickLook ignores
// when it rasterises, leaving opaque (white) corners that show on the Windows
// taskbar. This re-applies the rounding to the pixels. Edits the file in place.
//
//   node scripts/round-corners.mjs <file.png> [radiusFraction]
//
// radiusFraction defaults to 0.2 (matches the SVG: 200 / 1000).

import zlib from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

function decodePNG(buf) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error("not a PNG");
  let p = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    p += 12 + len;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error(`bit depth ${data[8]} unsupported`);
      if (data[12] !== 0) throw new Error("interlaced PNG unsupported");
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      if (!channels) throw new Error(`color type ${data[9]} unsupported`);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[rp++];
    const line = Buffer.from(raw.subarray(rp, rp + stride));
    rp += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      line[x] = v;
    }
    prev = line;
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      rgba[d] = line[s];
      rgba[d + 1] = line[s + 1];
      rgba[d + 2] = line[s + 2];
      rgba[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
  }
  return { width, height, rgba };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function roundCorners(width, height, rgba, frac) {
  const R = Math.min(width, height) * frac;
  const centers = [
    [R, R],
    [width - R, R],
    [R, height - R],
    [width - R, height - R],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let cov = 1;
      for (const [cx, cy] of centers) {
        const inX = cx < width / 2 ? x + 0.5 < cx : x + 0.5 > cx;
        const inY = cy < height / 2 ? y + 0.5 < cy : y + 0.5 > cy;
        if (inX && inY) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          cov = Math.min(cov, Math.max(0, Math.min(1, R - d + 0.5)));
        }
      }
      if (cov < 1) {
        const i = (y * width + x) * 4 + 3;
        rgba[i] = Math.round(rgba[i] * cov);
      }
    }
  }
}

const [file, fracArg] = process.argv.slice(2);
if (!file) {
  console.error("usage: node round-corners.mjs <file.png> [radiusFraction]");
  process.exit(1);
}
const frac = fracArg ? Number(fracArg) : 0.2;
const { width, height, rgba } = decodePNG(readFileSync(file));
roundCorners(width, height, rgba, frac);
writeFileSync(file, encodePNG(width, height, rgba));
console.log(`rounded ${file} (${width}x${height}, r=${(frac * 100).toFixed(0)}%)`);
