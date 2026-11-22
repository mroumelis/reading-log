// Generates the app icons (PNG) with no dependencies: a violet open book with a
// little bookmark ribbon, on chartreuse. Run:  node tools/make-icons.mjs
// Icons are full-bleed squares (iOS rounds the corners itself) and the mark
// stays inside the central 80% so they also work as "maskable" Android icons.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const BG = [0xda, 0xff, 0x72];
const FG = [0x49, 0x27, 0xd0];

// Shape test in unit coordinates (0..1, y down). Returns 'fg', 'bg'.
function shade(x, y) {
  const spineGap = 0.022;
  const L0 = 0.17, L1 = 0.5 - spineGap; // left page x-range
  const R0 = 0.5 + spineGap, R1 = 0.83; // right page x-range
  const page = (t) => ({
    // pages droop toward the spine, top edge curves gently like a real book
    top: 0.33 - 0.07 * Math.sin(Math.PI * t * 0.5 + Math.PI * 0.5) + 0.0,
    bottom: 0.71 - 0.05 * Math.sin(Math.PI * t * 0.5 + Math.PI * 0.5),
  });
  let inPage = false;
  if (x >= L0 && x <= L1) {
    const t = (L1 - x) / (L1 - L0); // 0 at spine, 1 at outer edge
    const p = page(1 - t);
    inPage = y >= p.top && y <= p.bottom;
  } else if (x >= R0 && x <= R1) {
    const t = (x - R0) / (R1 - R0);
    const p = page(1 - t);
    inPage = y >= p.top && y <= p.bottom;
  }
  // bookmark ribbon on the right page: chartreuse inside the page, violet below it
  const rx0 = 0.62, rx1 = 0.69;
  const inRibbonX = x >= rx0 && x <= rx1;
  if (inRibbonX) {
    const t = (x - R0) / (R1 - R0);
    const p = page(1 - t);
    const ribbonTop = p.top + 0.035;
    if (inPage && y >= ribbonTop) return 'bg';
    // tail with a V notch
    const tailEnd = 0.84;
    const notch = 0.035 * (1 - Math.abs((x - (rx0 + rx1) / 2) / ((rx1 - rx0) / 2)));
    if (y > p.bottom && y <= tailEnd - notch) return 'fg';
  }
  // a few text lines on the left page (chartreuse cutouts)
  if (inPage && x >= L0 + 0.05 && x <= L1 - 0.05) {
    const t = (L1 - x) / (L1 - L0);
    const p = page(1 - t);
    for (let i = 0; i < 3; i++) {
      const ly = p.top + 0.09 + i * 0.075;
      if (Math.abs(y - ly) < 0.012 && !(i === 2 && x < L0 + 0.13)) return 'bg';
    }
  }
  return inPage ? 'fg' : 'bg';
}

function render(size) {
  const ss = 4; // supersampling per axis
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let fg = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++)
          if (shade((i + (sx + 0.5) / ss) / size, (j + (sy + 0.5) / ss) / size) === 'fg') fg++;
      const a = fg / (ss * ss);
      const o = (j * size + i) * 4;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(BG[c] * (1 - a) + FG[c] * a);
      px[o + 3] = 255;
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

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  writeFileSync(join(OUT, name), render(size));
  console.log('wrote icons/' + name);
}
