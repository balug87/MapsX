// Ordered-dither post process for the Dither Press filter.
//
// Screen patterns follow the live WebGL demos on
// https://webdev.teknium.io/?tag=webgl#dither :
//   • Paper Shaders — ordered / random dither, matrix size, pixel size
//   • basement shader-lab — Bayer 8×8, duo-tone inks, pixelSize, spread
//   • React Bits — Bayer, halftone, line, crosshatch and noise screens
//
// Flat theme colours that sit on the palette stay solid. Hillshade, edges
// and type — the in-between tones — break into ink the way a risograph does.

export const DITHER_MODES = [
  { id: 'bayer8', label: 'Bayer 8' },
  { id: 'bayer4', label: 'Bayer 4' },
  { id: 'halftone', label: 'Halftone' },
  { id: 'lines', label: 'Lines' },
  { id: 'hatch', label: 'Hatch' },
  { id: 'noise', label: 'Noise' },
];

// Exact theme fills, so large land / water / road areas don't shimmer.
export const PRESS_PALETTE = [
  [0xf4, 0xef, 0xe4],
  [0xef, 0xe8, 0xd8],
  [0xb7, 0xc9, 0xdc],
  [0xcf, 0xdc, 0xb8],
  [0xe2, 0xd3, 0xbc],
  [0xd9, 0xa1, 0x5a],
  [0xe2, 0x4b, 0x3a],
  [0x1a, 0x16, 0x12],
];

const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

const BAYER_4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

const MODE_INDEX = {
  bayer8: 0,
  bayer4: 1,
  halftone: 2,
  lines: 3,
  hatch: 4,
  noise: 5,
};

function imod(n, m) {
  return ((n % m) + m) % m;
}

export function screenThreshold(mode, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (mode === 0) return BAYER_8[imod(yi, 8) * 8 + imod(xi, 8)] / 64;
  if (mode === 1) return BAYER_4[imod(yi, 4) * 4 + imod(xi, 4)] / 16;
  if (mode === 2) {
    const s = 8;
    const fx = imod(xi, s) + 0.5 - s / 2;
    const fy = imod(yi, s) + 0.5 - s / 2;
    return Math.min(1, Math.hypot(fx, fy) / (s * 0.52));
  }
  if (mode === 3) return imod(yi, 6) / 6;
  if (mode === 4) return Math.min(imod(xi + yi, 6) / 6, imod(xi - yi, 6) / 6);
  let n = (xi * 374761393 + yi * 668265263) | 0;
  n = Math.imul(n ^ (n >> 13), 1274126177);
  n ^= n >> 16;
  return (n >>> 0) / 4294967295;
}

export function applySpread(t, spread) {
  const s = spread == null ? 1 : spread;
  return 0.5 + (t - 0.5) * s;
}

export function pickInk(r, g, b, thr) {
  let bestI = 0;
  let secondI = 1;
  let best = Infinity;
  let second = Infinity;
  for (let i = 0; i < PRESS_PALETTE.length; i++) {
    const p = PRESS_PALETTE[i];
    const dr = r - p[0];
    const dg = g - p[1];
    const db = b - p[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < best) {
      second = best;
      secondI = bestI;
      best = d;
      bestI = i;
    } else if (d < second) {
      second = d;
      secondI = i;
    }
  }
  const total = best + second;
  const f = total <= 0 ? 0 : best / total;
  return PRESS_PALETTE[thr < f ? secondI : bestI];
}

export function ditherRegion(ctx, x, y, w, h, opts) {
  if (w < 1 || h < 1) return;
  const scale = opts.scale || 1;
  const pixel = Math.max(1, Math.round((opts.pixelSize || 2) * scale));
  const mode = MODE_INDEX[opts.mode] ?? 0;
  const spread = opts.spread == null ? 0.86 : opts.spread;
  const img = ctx.getImageData(x, y, w, h);
  const data = img.data;
  const u32 = new Uint32Array(data.buffer, data.byteOffset, data.length / 4);

  for (let cy = 0; cy < h; cy += pixel) {
    const sy = Math.min(h - 1, cy + (pixel >> 1));
    const cellY = Math.floor(cy / pixel);
    const bh = Math.min(pixel, h - cy);
    for (let cx = 0; cx < w; cx += pixel) {
      const sx = Math.min(w - 1, cx + (pixel >> 1));
      const i = (sy * w + sx) * 4;
      const thr = applySpread(screenThreshold(mode, Math.floor(cx / pixel), cellY), spread);
      const ink = pickInk(data[i], data[i + 1], data[i + 2], thr);
      const packed = (255 << 24) | (ink[2] << 16) | (ink[1] << 8) | ink[0];
      const bw = Math.min(pixel, w - cx);
      for (let yy = 0; yy < bh; yy++) {
        let row = (cy + yy) * w + cx;
        for (let xx = 0; xx < bw; xx++) u32[row++] = packed;
      }
    }
  }
  ctx.putImageData(img, x, y);
}

const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uMap;
uniform vec2 uRes;
uniform float uPixel;
uniform float uSpread;
uniform int uMode;
uniform vec3 uPal[8];
out vec4 oColor;

const float BAYER8[64] = float[64](
  0., 32., 8., 40., 2., 34., 10., 42.,
  48., 16., 56., 24., 50., 18., 58., 26.,
  12., 44., 4., 36., 14., 46., 6., 38.,
  60., 28., 52., 20., 62., 30., 54., 22.,
  3., 35., 11., 43., 1., 33., 9., 41.,
  51., 19., 59., 27., 49., 17., 57., 25.,
  15., 47., 7., 39., 13., 45., 5., 37.,
  63., 31., 55., 23., 61., 29., 53., 21.
);
const float BAYER4[16] = float[16](
  0., 8., 2., 10.,
  12., 4., 14., 6.,
  3., 11., 1., 9.,
  15., 7., 13., 5.
);

float imodf(float n, float m) {
  return mod(mod(n, m) + m, m);
}

float screenT(int mode, float x, float y) {
  int xi = int(floor(x));
  int yi = int(floor(y));
  if (mode == 0) {
    int i = int(imodf(float(yi), 8.0)) * 8 + int(imodf(float(xi), 8.0));
    return BAYER8[i] / 64.0;
  }
  if (mode == 1) {
    int i = int(imodf(float(yi), 4.0)) * 4 + int(imodf(float(xi), 4.0));
    return BAYER4[i] / 16.0;
  }
  if (mode == 2) {
    float s = 8.0;
    float fx = imodf(float(xi), s) + 0.5 - s * 0.5;
    float fy = imodf(float(yi), s) + 0.5 - s * 0.5;
    return min(1.0, length(vec2(fx, fy)) / (s * 0.52));
  }
  if (mode == 3) return imodf(float(yi), 6.0) / 6.0;
  if (mode == 4) {
    return min(imodf(float(xi + yi), 6.0) / 6.0, imodf(float(xi - yi), 6.0) / 6.0);
  }
  int n = xi * 374761393 + yi * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return float(uint(n)) / 4294967295.0;
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy / uPixel);
  vec2 uv = (cell * uPixel + uPixel * 0.5) / uRes;
  vec3 src = texture(uMap, uv).rgb * 255.0;
  float t = 0.5 + (screenT(uMode, cell.x, cell.y) - 0.5) * uSpread;

  float best = 1e12;
  float second = 1e12;
  int bestI = 0;
  int secondI = 1;
  for (int i = 0; i < 8; i++) {
    vec3 d = src - uPal[i];
    float dist = dot(d, d);
    if (dist < best) {
      second = best;
      secondI = bestI;
      best = dist;
      bestI = i;
    } else if (dist < second) {
      second = dist;
      secondI = i;
    }
  }
  float total = best + second;
  float f = total <= 0.0 ? 0.0 : best / total;
  vec3 ink = uPal[t < f ? secondI : bestI];
  oColor = vec4(ink / 255.0, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log || 'shader compile failed');
  }
  return sh;
}

export function attachDither(map) {
  const canvas = document.createElement('canvas');
  canvas.id = 'dither-overlay';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;display:none;';
  map.getCanvasContainer().appendChild(canvas);

  let gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    });
  } catch {
    gl = null;
  }

  const state = {
    active: false,
    mode: 'bayer8',
    pixelSize: 2,
    spread: 0.86,
  };

  if (!gl) {
    console.warn('Dither Press: WebGL2 unavailable');
    return {
      sync(theme) {
        state.active = !!theme?.dither;
        canvas.style.display = 'none';
      },
      getOptions: () => state,
    };
  }

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Canvas rows are top-down; flip so uv.y 0 (bottom of the screen) is the
  // bottom of the photographed map.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const loc = {
    map: gl.getUniformLocation(prog, 'uMap'),
    res: gl.getUniformLocation(prog, 'uRes'),
    pixel: gl.getUniformLocation(prog, 'uPixel'),
    spread: gl.getUniformLocation(prog, 'uSpread'),
    mode: gl.getUniformLocation(prog, 'uMode'),
    pal: gl.getUniformLocation(prog, 'uPal'),
  };
  const palFlat = new Float32Array(24);
  PRESS_PALETTE.forEach((c, i) => {
    palFlat[i * 3] = c[0];
    palFlat[i * 3 + 1] = c[1];
    palFlat[i * 3 + 2] = c[2];
  });
  gl.uniform1i(loc.map, 0);
  gl.uniform3fv(loc.pal, palFlat);

  let warned = false;
  function frame() {
    if (!state.active) return;
    const src = map.getCanvas();
    const w = src.width;
    const h = src.height;
    if (w < 2 || h < 2) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      const cssW = map.getContainer().clientWidth || w;
      const pxPerCss = w / cssW;
      gl.uniform2f(loc.res, w, h);
      gl.uniform1f(loc.pixel, Math.max(1, (state.pixelSize || 2) * pxPerCss));
      gl.uniform1f(loc.spread, state.spread);
      gl.uniform1i(loc.mode, MODE_INDEX[state.mode] ?? 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } catch (err) {
      if (!warned) {
        warned = true;
        console.warn('dither frame:', err);
      }
    }
  }

  map.on('render', frame);

  return {
    sync(theme) {
      const on = !!theme?.dither;
      state.active = on;
      canvas.style.display = on ? 'block' : 'none';
      if (on) {
        state.mode = theme.dither.mode || state.mode;
        state.pixelSize = theme.dither.pixelSize || state.pixelSize;
        state.spread = theme.dither.spread == null ? state.spread : theme.dither.spread;
        map.triggerRepaint();
      }
    },
    getOptions: () => state,
  };
}
