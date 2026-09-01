// Build a Windows .ico from PNG files, the way Explorer actually wants it:
// small sizes as 32-bit BMP (BGRA + AND mask) so transparency renders on the
// taskbar / in dialogs, and only 256x256 as a PNG blob.
//
//   node scripts/png-to-ico.mjs <out.ico> <dir-with-png-N.png-files>
//
// No dependencies — PNG is decoded with the built-in zlib.

import zlib from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BMP_SIZES = [16, 24, 32, 48, 64, 128];
const PNG_SIZES = [256];

function decodePNG(buf) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIG[i]) throw new Error("not a PNG");
  }
  let p = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    p += 12 + len; // 4 len + 4 type + len + 4 crc
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
      if (data[12] !== 0) throw new Error("interlaced PNG unsupported");
      if (colorType === 6) channels = 4;
      else if (colorType === 2) channels = 3;
      else throw new Error(`unsupported color type ${colorType}`);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = Buffer.from(raw.subarray(rp, rp + stride));
    rp += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pr) & 255;
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

function bmpFrame({ width, height, rgba }) {
  const xorStride = width * 4;
  const xor = Buffer.alloc(xorStride * height);
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // BMP rows are bottom-up
    for (let x = 0; x < width; x++) {
      const s = (srcY * width + x) * 4;
      const d = y * xorStride + x * 4;
      xor[d] = rgba[s + 2]; // B
      xor[d + 1] = rgba[s + 1]; // G
      xor[d + 2] = rgba[s]; // R
      xor[d + 3] = rgba[s + 3]; // A
    }
  }
  // 1bpp AND mask, rows padded to 32 bits. All zero: alpha channel does the work.
  const maskStride = ((width + 31) >> 5) << 2;
  const mask = Buffer.alloc(maskStride * height);
  const hdr = Buffer.alloc(40);
  hdr.writeUInt32LE(40, 0); // biSize
  hdr.writeInt32LE(width, 4); // biWidth
  hdr.writeInt32LE(height * 2, 8); // biHeight (image + mask)
  hdr.writeUInt16LE(1, 12); // biPlanes
  hdr.writeUInt16LE(32, 14); // biBitCount
  hdr.writeUInt32LE(0, 16); // biCompression = BI_RGB
  hdr.writeUInt32LE(xor.length, 20); // biSizeImage
  return Buffer.concat([hdr, xor, mask]);
}

const [outPath, dir] = process.argv.slice(2);
if (!outPath || !dir) {
  console.error("usage: node png-to-ico.mjs <out.ico> <png-dir>");
  process.exit(1);
}

const frames = [];
for (const s of BMP_SIZES) {
  frames.push({ s, buf: bmpFrame(decodePNG(readFileSync(join(dir, `png-${s}.png`)))) });
}
for (const s of PNG_SIZES) {
  frames.push({ s, buf: readFileSync(join(dir, `png-${s}.png`)) });
}

const N = frames.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type = icon
header.writeUInt16LE(N, 4);
const dirBuf = Buffer.alloc(16 * N);
let off = 6 + 16 * N;
frames.forEach((f, i) => {
  const o = i * 16;
  dirBuf.writeUInt8(f.s >= 256 ? 0 : f.s, o);
  dirBuf.writeUInt8(f.s >= 256 ? 0 : f.s, o + 1);
  dirBuf.writeUInt16LE(1, o + 4); // planes
  dirBuf.writeUInt16LE(32, o + 6); // bit count
  dirBuf.writeUInt32LE(f.buf.length, o + 8);
  dirBuf.writeUInt32LE(off, o + 12);
  off += f.buf.length;
});

writeFileSync(outPath, Buffer.concat([header, dirBuf, ...frames.map((f) => f.buf)]));
console.log(
  `wrote ${outPath}: ${frames.length} frames (BMP32 ${BMP_SIZES.join("/")}, PNG ${PNG_SIZES.join("/")})`,
);
