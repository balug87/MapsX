// Unit tests for the glyph PBF writer and font-name parsing (node --test).

import test from 'node:test';
import assert from 'node:assert/strict';
import { PbfWriter, parseFontName } from '../js/glyphs.js';

// Minimal protobuf reader, just enough to verify PbfWriter output.
class Reader {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }
  varint() {
    let v = 0;
    let shift = 0;
    for (;;) {
      const b = this.buf[this.pos++];
      v += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) return v;
      shift += 7;
    }
  }
  svarint() {
    const v = this.varint();
    return v % 2 === 1 ? -(v + 1) / 2 : v / 2;
  }
  fields(end = this.buf.length) {
    const out = [];
    while (this.pos < end) {
      const tag = this.varint();
      const field = tag >> 3;
      const wire = tag & 7;
      if (wire === 0) out.push([field, this.varint()]);
      else if (wire === 2) {
        const len = this.varint();
        out.push([field, this.buf.subarray(this.pos, this.pos + len)]);
        this.pos += len;
      } else throw new Error(`unexpected wire type ${wire}`);
    }
    return out;
  }
}

test('varint encoding round-trips small and large values', () => {
  const w = new PbfWriter();
  for (const v of [0, 1, 127, 128, 300, 65535, 2 ** 28 + 5]) w.writeVarint(v);
  const r = new Reader(w.finish());
  for (const v of [0, 1, 127, 128, 300, 65535, 2 ** 28 + 5]) assert.equal(r.varint(), v);
});

test('svarint (zigzag) handles negatives', () => {
  const w = new PbfWriter();
  w.writeSVarintField(6, -27);
  w.writeSVarintField(6, 14);
  const r = new Reader(w.finish());
  const fields = r.fields();
  assert.deepEqual(fields.map(([f]) => f), [6, 6]);
  const r2 = new Reader(w.finish());
  r2.varint(); // tag
  assert.equal(r2.svarint(), -27);
  r2.varint();
  assert.equal(r2.svarint(), 14);
});

test('nested glyph message has the fontnik field layout', () => {
  const glyph = new PbfWriter();
  glyph.writeVarintField(1, 65); // id 'A'
  glyph.writeBytesField(2, new Uint8Array([1, 2, 3]));
  glyph.writeVarintField(3, 15); // width
  glyph.writeVarintField(4, 17); // height
  glyph.writeSVarintField(5, 1); // left
  glyph.writeSVarintField(6, -10); // top
  glyph.writeVarintField(7, 14); // advance

  const stack = new PbfWriter();
  stack.writeStringField(1, 'Test Font Regular');
  stack.writeStringField(2, '0-255');
  stack.writeMessageField(3, glyph);

  const root = new PbfWriter();
  root.writeMessageField(1, stack);

  const [rootField] = new Reader(root.finish()).fields();
  assert.equal(rootField[0], 1);
  const stackFields = new Reader(rootField[1]).fields();
  assert.equal(new TextDecoder().decode(stackFields[0][1]), 'Test Font Regular');
  assert.equal(new TextDecoder().decode(stackFields[1][1]), '0-255');
  const glyphFields = Object.fromEntries(new Reader(stackFields[2][1]).fields());
  assert.equal(glyphFields[1], 65);
  assert.deepEqual([...glyphFields[2]], [1, 2, 3]);
  assert.equal(glyphFields[3], 15);
  assert.equal(glyphFields[4], 17);
  // zigzag-decoded by hand: 2 -> 1, 19 -> -10
  assert.equal(glyphFields[5], 2);
  assert.equal(glyphFields[6], 19);
  assert.equal(glyphFields[7], 14);
});

test('parseFontName splits family, weight and style', () => {
  assert.deepEqual(parseFontName('UnifrakturMaguntia Regular'),
    { family: 'UnifrakturMaguntia', weight: '400', style: 'normal' });
  assert.deepEqual(parseFontName('Playfair Display Bold'),
    { family: 'Playfair Display', weight: '700', style: 'normal' });
  assert.deepEqual(parseFontName('IM Fell English Italic'),
    { family: 'IM Fell English', weight: '400', style: 'italic' });
  assert.deepEqual(parseFontName('Press Start 2P Regular'),
    { family: 'Press Start 2P', weight: '400', style: 'normal' });
  assert.deepEqual(parseFontName('Noto Sans Bold Italic'),
    { family: 'Noto Sans', weight: '700', style: 'italic' });
  // a bare family name never eats its only word
  assert.deepEqual(parseFontName('Regular'),
    { family: 'Regular', weight: '400', style: 'normal' });
});
