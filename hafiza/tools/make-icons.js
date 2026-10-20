// Uygulama simgesini (koyu yeşil zemin üzerinde sarı "H") saf Node ile üretir:
//   build/icon.ico  → .exe simgesi (electron-builder)
//   assets/icon.ico → pencere ve sistem tepsisi simgesi
//   assets/icon.png → bildirim simgesi
// Çalıştırma: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [0x1d, 0x43, 0x32];
const FG = [0xf7, 0xd0, 0x71];

// 64 birimlik tasarım ızgarası: köşesi yuvarlak kare ve üç kalın çizgi.
const strokes = [[20, 17, 20, 47], [44, 17, 44, 47], [21, 32, 43, 32]];
const STROKE = 3.6, RADIUS = 15;

function insideRoundedSquare(x, y) {
  const dx = Math.max(RADIUS - x, 0, x - (64 - RADIUS));
  const dy = Math.max(RADIUS - y, 0, y - (64 - RADIUS));
  return x >= 0 && x <= 64 && y >= 0 && y <= 64 && dx * dx + dy * dy <= RADIUS * RADIUS;
}

function distanceToSegment(px, py, [x1, y1, x2, y2]) {
  const vx = x2 - x1, vy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
}

// RGBA piksel dizisi (üstten alta), 4×4 örnekleme ile kenar yumuşatma.
function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 4, scale = 64 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let alpha = 0, fg = 0;
      for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
        const px = (x + (sx + 0.5) / samples) * scale, py = (y + (sy + 0.5) / samples) * scale;
        if (!insideRoundedSquare(px, py)) continue;
        alpha++;
        if (strokes.some(segment => distanceToSegment(px, py, segment) <= STROKE)) fg++;
      }
      const offset = (y * size + x) * 4;
      if (!alpha) continue;
      const mix = fg / alpha;
      for (let c = 0; c < 3; c++) pixels[offset + c] = Math.round(BG[c] * (1 - mix) + FG[c] * mix);
      pixels[offset + 3] = Math.round(alpha / (samples * samples) * 255);
    }
  }
  return pixels;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buffer => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function png(size, pixels) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Küçük boyutlar için klasik 32 bit BMP girdisi (alttan üste BGRA + saydamlık maskesi).
function bmpEntry(size, pixels) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); header.writeInt32LE(size, 4); header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
  const color = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const from = ((size - 1 - y) * size + x) * 4, to = (y * size + x) * 4;
    color[to] = pixels[from + 2]; color[to + 1] = pixels[from + 1]; color[to + 2] = pixels[from]; color[to + 3] = pixels[from + 3];
  }
  const maskRow = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, color, Buffer.alloc(maskRow * size)]);
}

function ico(sizes) {
  const images = sizes.map(size => { const pixels = render(size); return { size, data: size >= 256 ? png(size, pixels) : bmpEntry(size, pixels) }; });
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(1, 2); directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    directory[entry] = image.size >= 256 ? 0 : image.size; directory[entry + 1] = image.size >= 256 ? 0 : image.size;
    directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.data.length, entry + 8); directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });
  return Buffer.concat([directory, ...images.map(image => image.data)]);
}

const root = path.join(__dirname, '..');
for (const dir of ['build', 'assets']) fs.mkdirSync(path.join(root, dir), { recursive: true });
const icon = ico([16, 20, 24, 32, 40, 48, 64, 128, 256]);
fs.writeFileSync(path.join(root, 'build', 'icon.ico'), icon);
fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), icon);
fs.writeFileSync(path.join(root, 'assets', 'icon.png'), png(256, render(256)));
console.log(`Simge üretildi: ${icon.length} bayt`);
