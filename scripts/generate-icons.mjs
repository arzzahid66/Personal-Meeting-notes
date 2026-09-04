/**
 * Generates the PWA icon set from a single vector description, so the icons in
 * public/ can be regenerated rather than being opaque binaries in the repo.
 *
 *   node scripts/generate-icons.mjs
 *
 * No image dependency: the PNGs are encoded here (RGBA + zlib), which keeps the
 * install lean and the output deterministic.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BG = [15, 23, 42]; // slate-900, matches theme_color
const FG = [165, 180, 252]; // indigo-300
const FG_BRIGHT = [255, 255, 255];

/* ------------------------------------------------------------ encoding --- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- drawing --- */

/** 4x supersampled coverage, so edges are smooth without a rasteriser. */
function render(size, shapes) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          let cr = 0;
          let cg = 0;
          let cb = 0;
          let ca = 0;
          for (const shape of shapes) {
            if (!shape.hit(px, py, size)) continue;
            const [sr, sg, sb] = shape.color;
            cr = sr;
            cg = sg;
            cb = sb;
            ca = 255;
          }
          r += cr;
          g += cg;
          b += cb;
          a += ca;
        }
      }

      const samples = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / samples);
      rgba[i + 1] = Math.round(g / samples);
      rgba[i + 2] = Math.round(b / samples);
      rgba[i + 3] = Math.round(a / samples);
    }
  }
  return rgba;
}

const roundedRect = (x, y, w, h, radius, color) => ({
  color,
  hit(px, py) {
    if (px < x || px > x + w || py < y || py > y + h) return false;
    const cx = Math.min(Math.max(px, x + radius), x + w - radius);
    const cy = Math.min(Math.max(py, y + radius), y + h - radius);
    return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2;
  },
});

const fullBleed = (color) => ({ color, hit: () => true });

/**
 * Five rounded bars, tallest in the middle: a waveform, which reads clearly
 * at 32px in a browser tab where a microphone silhouette turns to mush.
 */
function waveform(size, { inset = 0.26, color = FG, accent = FG_BRIGHT } = {}) {
  const heights = [0.34, 0.62, 1, 0.72, 0.42];
  const shapes = [];
  const area = size * (1 - inset * 2);
  const barWidth = area / 9;
  const gap = barWidth;
  const left = size * inset;

  heights.forEach((factor, i) => {
    const h = area * factor;
    const x = left + i * (barWidth + gap);
    const y = (size - h) / 2;
    shapes.push(
      roundedRect(x, y, barWidth, h, barWidth / 2, i === 2 ? accent : color),
    );
  });
  return shapes;
}

function icon(size, { maskable = false } = {}) {
  const radius = maskable ? 0 : size * 0.22;
  const background = maskable
    ? fullBleed(BG)
    : roundedRect(0, 0, size, size, radius, BG);
  // Maskable icons are cropped to a circle by some launchers, so the glyph is
  // pulled further inside the safe zone.
  return render(size, [background, ...waveform(size, { inset: maskable ? 0.33 : 0.26 })]);
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="113" fill="#0f172a"/>
  <g fill="#a5b4fc">
    <rect x="133" y="197" width="30" height="118" rx="15"/>
    <rect x="194" y="152" width="30" height="208" rx="15"/>
    <rect x="255" y="102" width="30" height="308" rx="15" fill="#ffffff"/>
    <rect x="316" y="142" width="30" height="228" rx="15"/>
    <rect x="377" y="187" width="30" height="138" rx="15"/>
  </g>
</svg>
`;

mkdirSync(OUT, { recursive: true });

const outputs = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, { maskable: true }],
];

for (const [name, size, options] of outputs) {
  writeFileSync(join(OUT, name), encodePng(size, size, icon(size, options)));
  console.log(`wrote public/${name} (${size}x${size})`);
}

writeFileSync(join(OUT, "icon.svg"), SVG);
console.log("wrote public/icon.svg");
