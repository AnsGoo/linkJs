// 生成扩展图标（PNG）：圆形/圆角背景 + 白色 "L"，输出彩色(active)与灰色(off)两套。
// 纯 Node（zlib），无三方依赖。运行：node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'icons');
mkdirSync(outDir, { recursive: true });

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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function inRoundedRect(x, y, size, radius) {
  const min = 0;
  const max = size - 1;
  const cx = Math.min(Math.max(x, min + radius), max - radius);
  const cy = Math.min(Math.max(y, min + radius), max - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function makeIcon(size, bg, fg) {
  const buf = Buffer.alloc(size * size * 4); // transparent
  const px = (x, y, c) => {
    const i = (y * size + x) * 4;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = 255;
  };
  const radius = Math.round(size * 0.22);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRoundedRect(x, y, size, radius)) px(x, y, bg);
    }
  }
  // 白色 "L"
  const t = Math.max(1, Math.round(size * 0.15));
  const left = Math.round(size * 0.32);
  const right = Math.round(size * 0.7);
  const top = Math.round(size * 0.26);
  const bottom = Math.round(size * 0.74);
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < left + t; x++) px(x, y, fg);
  }
  for (let y = bottom - t; y < bottom; y++) {
    for (let x = left; x < right; x++) px(x, y, fg);
  }
  return buf;
}

const ACTIVE = [66, 184, 131]; // Vue 风格绿 #42b883
const OFF = [138, 143, 152]; // 灰
const FG = [255, 255, 255];

for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(outDir, `icon-${size}.png`), encodePng(size, size, makeIcon(size, ACTIVE, FG)));
  writeFileSync(resolve(outDir, `icon-off-${size}.png`), encodePng(size, size, makeIcon(size, OFF, FG)));
}
console.log('icons written to', outDir);
