// Local glyph engine: renders any CSS-loaded web font into MapLibre's SDF
// glyph PBF format at runtime, served through a "glyphs://" custom protocol.
// This removes the need for a font-glyph server and is what allows arbitrary
// fonts (blackletter, terminal, typewriter...) on map labels.
//
// Metric conventions match MapLibre's own local glyph generation
// (GlyphManager._drawGlyph) and fontnik server glyphs: 24px em, 3px SDF
// buffer, top adjusted by -27.5 from the alphabetic baseline, and a bitmap
// sized (metricWidth + 6) x (metricHeight + 6).

import TinySDF from './vendor-tinysdf.js';

const TOP_ADJUSTMENT = 27.5;

// --- Minimal protobuf writer (only what the glyph PBF schema needs) ---

export class PbfWriter {
  constructor() {
    this.buf = new Uint8Array(1024);
    this.pos = 0;
  }
  _ensure(n) {
    if (this.pos + n <= this.buf.length) return;
    let len = this.buf.length;
    while (len < this.pos + n) len *= 2;
    const next = new Uint8Array(len);
    next.set(this.buf);
    this.buf = next;
  }
  writeVarint(v) {
    this._ensure(10);
    while (v >= 0x80) {
      this.buf[this.pos++] = (v & 0x7f) | 0x80;
      v = Math.floor(v / 128);
    }
    this.buf[this.pos++] = v;
  }
  writeTag(field, wireType) {
    this.writeVarint((field << 3) | wireType);
  }
  writeVarintField(field, v) {
    this.writeTag(field, 0);
    this.writeVarint(v);
  }
  writeSVarintField(field, v) {
    // zigzag encoding
    this.writeVarintField(field, v < 0 ? -v * 2 - 1 : v * 2);
  }
  writeBytesField(field, bytes) {
    this.writeTag(field, 2);
    this.writeVarint(bytes.length);
    this._ensure(bytes.length);
    this.buf.set(bytes, this.pos);
    this.pos += bytes.length;
  }
  writeStringField(field, str) {
    this.writeBytesField(field, new TextEncoder().encode(str));
  }
  writeMessageField(field, writer) {
    this.writeBytesField(field, writer.finish());
  }
  finish() {
    return this.buf.subarray(0, this.pos);
  }
}

// --- Font stack parsing ---
// Stack names follow the "Family Weight/Style" convention used by map styles,
// e.g. "UnifrakturMaguntia Regular", "Playfair Display Bold Italic".

const WEIGHTS = { thin: '100', light: '300', regular: '400', medium: '500', semibold: '600', bold: '700', black: '900' };

export function parseFontName(name) {
  const words = name.trim().split(/\s+/);
  let weight = '400';
  let style = 'normal';
  while (words.length > 1) {
    const last = words[words.length - 1].toLowerCase();
    if (last === 'italic' || last === 'oblique') {
      style = 'italic';
      words.pop();
    } else if (last in WEIGHTS) {
      weight = WEIGHTS[last];
      words.pop();
    } else {
      break;
    }
  }
  return { family: words.join(' '), weight, style };
}

// --- Glyph generation ---

const rangeCache = new Map(); // "stack/range" -> Uint8Array

async function ensureFontsLoaded(fonts) {
  // Include Czech Extended-A sample chars so unicode-range latin-ext faces
  // (č Ř ů ě …) are fetched, not just the basic latin subset.
  const sample = 'AÁČŘŮĚŽ';
  await Promise.all(fonts.map((f) =>
    document.fonts.load(`${f.style} ${f.weight} 24px "${f.family}"`, sample).catch(() => {})
  ));
}

function buildGlyphMessage(sdf, id) {
  let char;
  try {
    char = sdf.draw(String.fromCodePoint(id));
  } catch {
    return null;
  }
  const advance = Math.round(char.glyphAdvance);
  if (char.glyphWidth === 0 || char.glyphHeight === 0) {
    if (advance === 0) return null; // invisible, nonspacing: skip entirely
    const g = new PbfWriter(); // e.g. the space character: metrics only
    g.writeVarintField(1, id);
    g.writeVarintField(3, 0);
    g.writeVarintField(4, 0);
    g.writeSVarintField(5, 0);
    g.writeSVarintField(6, Math.round(-TOP_ADJUSTMENT));
    g.writeVarintField(7, advance);
    return g;
  }
  const g = new PbfWriter();
  g.writeVarintField(1, id);
  g.writeBytesField(2, char.data instanceof Uint8Array ? char.data : new Uint8Array(char.data.buffer, char.data.byteOffset, char.data.byteLength));
  g.writeVarintField(3, char.glyphWidth);
  g.writeVarintField(4, char.glyphHeight);
  g.writeSVarintField(5, char.glyphLeft);
  g.writeSVarintField(6, Math.round(char.glyphTop - TOP_ADJUSTMENT));
  g.writeVarintField(7, advance);
  return g;
}

export async function generateGlyphRange(stackName, rangeStr) {
  const cacheKey = `${stackName}/${rangeStr}`;
  const cached = rangeCache.get(cacheKey);
  if (cached) return cached;

  const [beginStr, endStr] = rangeStr.split('-');
  const begin = parseInt(beginStr, 10);
  const end = parseInt(endStr, 10);

  const fonts = stackName.split(',').map(parseFontName);
  await ensureFontsLoaded(fonts);

  // The comma-joined family list lets canvas fall back through the MapLibre
  // text-font stack (e.g. UnifrakturMaguntia → IM Fell English) for glyphs
  // missing from the lead face. We intentionally do NOT append a generic
  // system sans-serif here — that produced mismatched metrics for Czech
  // diacritics (Ř, č, …) when a theme font lacked latin-ext coverage.
  const fontFamily = fonts.map((f) => `"${f.family}"`).join(',');
  const sdf = new TinySDF({
    fontSize: 24,
    buffer: 3,
    radius: 8,
    cutoff: 0.25,
    fontFamily,
    fontWeight: fonts[0].weight,
    fontStyle: fonts[0].style,
  });

  const stack = new PbfWriter();
  stack.writeStringField(1, stackName);
  stack.writeStringField(2, rangeStr);
  for (let id = begin; id <= end; id++) {
    if (id < 32 || (id >= 0x7f && id <= 0x9f)) continue; // control chars
    if (id >= 0xd800 && id <= 0xdfff) continue; // surrogates
    const g = buildGlyphMessage(sdf, id);
    if (g) stack.writeMessageField(3, g);
  }

  const root = new PbfWriter();
  root.writeMessageField(1, stack);
  const data = root.finish().slice();
  rangeCache.set(cacheKey, data);
  return data;
}

// --- MapLibre protocol registration ---
// Style JSON uses: "glyphs": "glyphs://{fontstack}/{range}"

export function registerGlyphProtocol(maplibregl) {
  maplibregl.addProtocol('glyphs', async (params) => {
    const match = params.url.match(/^glyphs:\/\/(.+)\/(\d+-\d+)$/);
    if (!match) throw new Error(`Bad glyph URL: ${params.url}`);
    const stackName = decodeURIComponent(match[1]);
    const data = await generateGlyphRange(stackName, match[2]);
    return { data };
  });
}
