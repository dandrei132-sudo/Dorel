#!/usr/bin/env node
// Generates placeholder PWA icons (public/icons/icon-192.png, icon-512.png)
// as a solid-color circle-on-background PNG, hand-encoded with zlib since
// no image library is available/needed for a simple placeholder. Replace
// these with real artwork whenever you like — they're just a starting
// point so the manifest has valid icons to point at.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BG = [0x0b, 0x0f, 0x14];
const FG = [0x4d, 0xa3, 0xff];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function generatePng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const radius = size * 0.36;
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const inCircle = dx * dx + dy * dy <= radius * radius;
      const [r, g, b] = inCircle ? FG : BG;
      const px = rowStart + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.resolve(import.meta.dirname, "../public/icons");
mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const outPath = path.join(outDir, `icon-${size}.png`);
  writeFileSync(outPath, generatePng(size));
  console.log(`wrote ${outPath}`);
}
