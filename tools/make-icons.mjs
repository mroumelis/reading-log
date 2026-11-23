// Generates the Home Screen icons (PNG) with no dependencies: the pixel mouse's
// head and big ears on INK, drawn from the same grid the app uses (read out of
// index.html) and scaled by a whole number of pixels per cell — nearest-neighbour,
// so nothing is blurry. Run:  node tools/make-icons.mjs
// Icons are full-bleed squares (iOS rounds the corners itself) and the head stays
// inside the central 80% circle so they also work as "maskable" Android icons.
import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(html.split('/*CORE-START*/')[1].split('/*CORE-END*/')[0], ctx);
const C = ctx.Core;

const INK = [0x11, 0x11, 0x11];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Head + ears: rows 0–13, columns 0–21, minus the start of the tail (x ≥ 19 on rows 11–13).
const grid = C.mouseGrid('base');
const head = [];
for (let y = 0; y <= 13; y++) {
  let row = '';
  for (let x = 0; x <= 21; x++) row += y >= 11 && x >= 19 ? '.' : grid[y][x];
  head.push(row);
}
const W = head[0].length, H = head.length;
// Whole pixels per grid cell. 512 stays smaller so the ears fit the maskable safe zone.
const cellFor = (size) => (size >= 512 ? 15 : Math.floor((size * 0.75) / W));

function render(size) {
  const cell = cellFor(size);
  const ox = Math.floor((size - W * cell) / 2);
  const oy = Math.floor((size - H * cell) / 2);
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const cx = Math.floor((i - ox) / cell), cy = Math.floor((j - oy) / cell);
      const ch = i >= ox && j >= oy && cx < W && cy < H ? head[cy][cx] : '.';
      const rgb = C.MOUSE_COLORS[ch] ? hex(C.MOUSE_COLORS[ch]) : INK;
      const o = (j * size + i) * 4;
      px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255;
    }
  }
  return png(size, size, px);
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(join(ROOT, 'icons'), { recursive: true });
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  writeFileSync(join(ROOT, 'icons', name), render(size));
  console.log(`wrote icons/${name} (${cellFor(size)}px per cell)`);
}
