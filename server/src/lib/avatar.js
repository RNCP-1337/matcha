import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const SIZE = 400;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const table = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ];
  const [r, g, b] = table[Math.floor(h / 60) % 6];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function generateAvatarPng(seed) {
  const digest = createHash('sha256').update(String(seed)).digest();
  const hue = (digest[0] / 255) * 360;
  const background = hslToRgb(hue, 0.22, 0.82);
  const foreground = hslToRgb(hue, 0.3, 0.42);
  const accent = hslToRgb((hue + 28) % 360, 0.25, 0.62);

  const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
  const headRadius = 66 + (digest[1] % 12);
  const headCenterY = 150 + (digest[2] % 10);
  const shoulderTop = headCenterY + headRadius + 26;
  const shoulderRadius = 132 + (digest[3] % 18);

  for (let y = 0; y < SIZE; y += 1) {
    const rowStart = y * (SIZE * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < SIZE; x += 1) {
      const dxHead = x - SIZE / 2;
      const dyHead = y - headCenterY;
      const insideHead = dxHead * dxHead + dyHead * dyHead <= headRadius * headRadius;

      const dyBody = y - (shoulderTop + shoulderRadius);
      const insideBody =
        y >= shoulderTop &&
        dxHead * dxHead + dyBody * dyBody <= shoulderRadius * shoulderRadius;

      const inset = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y) < 6;

      const color = insideHead || insideBody ? foreground : inset ? accent : background;
      const offset = rowStart + 1 + x * 3;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8;
  header[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
