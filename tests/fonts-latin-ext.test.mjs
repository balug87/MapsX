// Sanity checks that latin-ext font files are present and contain Czech glyphs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontsDir = join(root, 'fonts');

const REQUIRED_FILES = [
  'vt323-latin-ext-400-normal.woff2',
  'im-fell-english-latin-ext-400-normal.woff2',
  'im-fell-english-latin-ext-400-italic.woff2',
  'architects-daughter-latin-ext-400-normal.woff2',
  'playfair-display-latin-ext-400-normal.woff2',
  'playfair-display-latin-ext-700-normal.woff2',
  'special-elite-latin-ext-400-normal.woff2',
  'press-start-2p-latin-ext-400-normal.woff2',
];

test('latin-ext font files are bundled', () => {
  for (const name of REQUIRED_FILES) {
    assert.ok(existsSync(join(fontsDir, name)), `missing ${name}`);
  }
});

test('key latin-ext fonts include Czech č and Ř', (t) => {
  // Uses Python fontTools (already needed to build the IM Fell subsets).
  let hasFontTools = true;
  try {
    execFileSync('python3', ['-c', 'from fontTools.ttLib import TTFont'], { stdio: 'ignore' });
  } catch {
    hasFontTools = false;
  }
  if (!hasFontTools) {
    t.skip('fontTools not installed');
    return;
  }

  // Small Python helper: print OK if every codepoint is in the font cmap
  const script = `
from fontTools.ttLib import TTFont
import sys
path, *cps = sys.argv[1:]
font = TTFont(path)
cmap = {}
for table in font['cmap'].tables:
    cmap.update(table.cmap)
missing = [cp for cp in cps if int(cp) not in cmap]
print('OK' if not missing else 'MISSING:' + ','.join(missing))
`;

  const check = (file, ...cps) => {
    const out = execFileSync(
      'python3',
      ['-c', script, join(fontsDir, file), ...cps.map(String)],
      { encoding: 'utf8' },
    ).trim();
    assert.equal(out, 'OK', `${file}: ${out}`);
  };

  // U+010D = č, U+0158 = Ř
  check('vt323-latin-ext-400-normal.woff2', 0x010d, 0x0158);
  check('im-fell-english-latin-ext-400-normal.woff2', 0x010d, 0x0158);
  check('im-fell-english-latin-ext-400-italic.woff2', 0x010d, 0x0158);
});
