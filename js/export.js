// Print export: renders the region under the crop frame into a hidden
// high-DPI MapLibre instance, then composites a themed print frame (border,
// title cartouche, compass rose, scale bar, attribution) on a 2D canvas.

import { buildStyle } from './stylegen.js';
import { applyLandPatterns } from './patterns.js';

export const PAPER_SIZES = {
  a5: { name: 'A5', w: 5.83, h: 8.27 },
  a4: { name: 'A4', w: 8.27, h: 11.69 },
  a3: { name: 'A3', w: 11.69, h: 16.54 },
  letter: { name: 'Letter', w: 8.5, h: 11 },
  square: { name: 'Square', w: 8, h: 8 },
};

export function paperAspect(paperId, orientation) {
  const p = PAPER_SIZES[paperId];
  const [w, h] = orientation === 'landscape' ? [p.h, p.w] : [p.w, p.h];
  return w / h;
}

// Renders and returns a canvas. `opts`: {theme, paper, orientation, dpi,
// title, frame:boolean}, `view`: {center, zoom, bearing} for the crop region
// at a given CSS pixel width `viewCssWidth`.
export async function renderPrint(maplibregl, opts, view) {
  const p = PAPER_SIZES[opts.paper];
  const [wIn, hIn] = opts.orientation === 'landscape' ? [p.h, p.w] : [p.w, p.h];
  const margin = opts.frame ? Math.round(0.42 * opts.dpi) : 0; // print margin
  const pxW = Math.round(wIn * opts.dpi);
  const pxH = Math.round(hIn * opts.dpi);
  const mapPxW = pxW - margin * 2;
  const mapPxH = pxH - margin * 2 - (opts.title && opts.frame ? Math.round(0.5 * opts.dpi) : 0);

  const ratio = opts.dpi / 96;
  const cssW = Math.round(mapPxW / ratio);
  const cssH = Math.round(mapPxH / ratio);

  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${cssW}px;height:${cssH}px;`;
  document.body.appendChild(holder);

  // Same geographic width as the crop frame => zoom offset by width ratio.
  const zoom = view.zoom + Math.log2(cssW / view.cssWidth);

  const exportMap = new maplibregl.Map({
    container: holder,
    style: buildStyle(opts.theme),
    center: view.center,
    zoom,
    bearing: view.bearing || 0,
    pitch: 0,
    interactive: false,
    attributionControl: false,
    // Pixel-art themes keep their low fixed ratio so print output stays as
    // blocky as the screen; the nearest-neighbor drawImage below upscales it.
    pixelRatio: opts.theme.pixelScale || ratio,
    maxCanvasSize: [16384, 16384],
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  });

  try {
    // Wait for style so land patterns can register before tiles paint
    await new Promise((resolve) => {
      if (exportMap.isStyleLoaded()) resolve();
      else exportMap.once('style.load', resolve);
    });
    applyLandPatterns(exportMap, opts.theme);
    await waitForIdle(exportMap);
    const mapCanvas = exportMap.getCanvas();

    const out = document.createElement('canvas');
    out.width = pxW;
    out.height = pxH;
    const ctx = out.getContext('2d');

    const ui = opts.theme.uiVars;
    ctx.fillStyle = ui['--panel'];
    ctx.fillRect(0, 0, pxW, pxH);

    const mapX = margin;
    const mapY = margin + (opts.title && opts.frame ? Math.round(0.5 * opts.dpi) : 0);
    if (opts.theme.pixelScale) ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mapCanvas, mapX, mapY, mapPxW, mapPxH);
    ctx.imageSmoothingEnabled = true;

    if (opts.theme.effect === 'scanlines') {
      drawCrtVignette(ctx, mapX, mapY, mapPxW, mapPxH);
      drawScanlines(ctx, mapX, mapY, mapPxW, mapPxH, opts.dpi);
    }
    if (opts.theme.effect === 'lcd-grid') drawLcdGrid(ctx, mapX, mapY, mapPxW, mapPxH, opts.dpi);
    if (opts.theme.effect === 'parchment') drawParchment(ctx, mapX, mapY, mapPxW, mapPxH, opts.dpi);
    if (opts.theme.effect === 'halftone') drawInkBlots(ctx, mapX, mapY, mapPxW, mapPxH);
    if (opts.theme.effect === 'blueprint-grid') drawBlueprintCreases(ctx, mapX, mapY, mapPxW, mapPxH, opts.dpi);

    const metersPerPx = metersPerPixel(view.center[1], zoom) / ratio;
    drawOverlays(ctx, opts, { mapX, mapY, mapPxW, mapPxH, pxW, pxH, margin, metersPerPx, bearing: view.bearing || 0 });

    return out;
  } finally {
    exportMap.remove();
    holder.remove();
  }
}

function waitForIdle(map) {
  return new Promise((resolve) => {
    // Failed tiles / glyph ranges must not abort the export — MapLibre still
    // reaches idle with whatever loaded. The timeout covers stalled sources.
    const timer = setTimeout(() => resolve(), 90000);
    map.once('idle', () => { clearTimeout(timer); resolve(); });
    map.on('error', (e) => console.warn('export map:', e.error || e));
  });
}

function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

function drawScanlines(ctx, x, y, w, h, dpi) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  const step = Math.max(3, Math.round(dpi / 32));
  for (let yy = y; yy < y + h; yy += step) ctx.fillRect(x, yy, w, Math.max(1, step / 3));
  ctx.restore();
}

// Soft CRT edge darkening behind terminal scanlines
function drawCrtVignette(ctx, x, y, w, h) {
  ctx.save();
  const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.25, x + w / 2, y + h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// Graph-paper mesh matching the retro-lcd-design-language screen overlay
// (1px lines every 4 CSS px, scaled up for print DPI).
function drawLcdGrid(ctx, x, y, w, h, dpi) {
  ctx.save();
  const step = Math.max(4, Math.round((4 * dpi) / 96));
  const line = Math.max(1, Math.round(dpi / 96));
  // Horizontal lines (~6% ink opacity, like #2d33240f)
  ctx.fillStyle = 'rgba(45, 51, 36, 0.06)';
  for (let yy = y; yy < y + h; yy += step) ctx.fillRect(x, yy, w, line);
  // Vertical lines (~5% ink opacity, like #2d33240d)
  ctx.fillStyle = 'rgba(45, 51, 36, 0.05)';
  for (let xx = x; xx < x + w; xx += step) ctx.fillRect(xx, y, line, h);
  ctx.restore();
}

// Warm edge vignette + fine fiber grain for medieval parchment prints
function drawParchment(ctx, x, y, w, h, dpi) {
  ctx.save();
  const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(90,55,20,0)');
  g.addColorStop(1, 'rgba(90,55,20,0.2)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  const step = Math.max(2, Math.round((3 * dpi) / 96));
  const line = Math.max(1, Math.round(dpi / 96));
  ctx.fillStyle = 'rgba(80,50,20,0.04)';
  for (let yy = y; yy < y + h; yy += step) ctx.fillRect(x, yy, w, line);
  ctx.fillStyle = 'rgba(80,50,20,0.03)';
  for (let xx = x; xx < x + w; xx += Math.round(step * 1.6)) ctx.fillRect(xx, y, line, h);
  ctx.restore();
}

// Screen-fixed ink blots for gazette prints (same relative positions as CSS)
function drawInkBlots(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(210,200,175,0.12)';
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = 'multiply';
  const blots = [
    { px: 0.14, py: 0.18, rx: 0.07, ry: 0.05, a: 0.42 },
    { px: 0.78, py: 0.28, rx: 0.045, ry: 0.055, a: 0.36 },
    { px: 0.36, py: 0.72, rx: 0.055, ry: 0.04, a: 0.34 },
    { px: 0.88, py: 0.78, rx: 0.038, ry: 0.034, a: 0.3 },
    { px: 0.52, py: 0.42, rx: 0.05, ry: 0.045, a: 0.26 },
    { px: 0.08, py: 0.58, rx: 0.028, ry: 0.035, a: 0.28 },
    { px: 0.62, py: 0.12, rx: 0.035, ry: 0.025, a: 0.24 },
    { px: 0.24, py: 0.48, rx: 0.024, ry: 0.03, a: 0.2 },
  ];
  for (const b of blots) {
    const cx = x + w * b.px;
    const cy = y + h * b.py;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w * b.rx, h * b.ry));
    g.addColorStop(0, `rgba(28,26,21,${b.a})`);
    g.addColorStop(0.45, `rgba(28,26,21,${b.a * 0.4})`);
    g.addColorStop(1, 'rgba(28,26,21,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * b.rx, h * b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Small deterministic PRNG (mulberry32) so print exports of the same crop
// reproduce the same crumple/wobble instead of re-rolling on every render.
function rngExport(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draws a line as short connected segments with a sine wobble + per-step
// jitter (perpendicular to the line), so it reads as hand-drafted rather
// than a ruled straight edge.
function drawWobblyLine(ctx, x1, y1, x2, y2, amp, rand) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const steps = Math.max(6, Math.round(len / 10));
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  const phase = rand() * Math.PI * 2;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
    const wob = Math.sin(t * Math.PI * 3 + phase) * amp + (rand() - 0.5) * amp * 0.6;
    const qx = px + nx * wob, qy = py + ny * wob;
    if (i === 0) ctx.moveTo(qx, qy);
    else ctx.lineTo(qx, qy);
  }
  ctx.stroke();
}

// Weathered blueprint overlay for print: paper grain + a hand-worn wobbly
// grid + a crumpled crease network (ridge+shadow pairs at random angles) +
// vignette. Matches the CSS version used on screen (see app.css's
// body[data-effect='blueprint-grid'] rules) so screen and print agree.
function drawBlueprintCreases(ctx, x, y, w, h, dpi) {
  const scale = dpi / 96;
  const rand = rngExport(20260722);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // paper grain: sparse light/dark mottling, density independent of dpi
  const cssArea = (w / scale) * (h / scale);
  const grainCount = Math.min(6000, Math.round(cssArea / 220));
  for (let i = 0; i < grainCount; i++) {
    const gx = x + rand() * w, gy = y + rand() * h;
    const r = (4 + rand() * 10) * scale;
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    const dark = rand() > 0.5;
    grad.addColorStop(0, dark ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
  }

  // hand-drafted grid, wobbly rather than ruled
  const cell = 70 * scale;
  ctx.strokeStyle = 'rgba(180,210,240,0.16)';
  ctx.lineWidth = Math.max(1, scale);
  for (let gx = x + cell; gx < x + w; gx += cell) drawWobblyLine(ctx, gx, y, gx, y + h, 2.2 * scale, rand);
  for (let gy = y + cell; gy < y + h; gy += cell) drawWobblyLine(ctx, x, gy, x + w, gy, 2.2 * scale, rand);

  // crumpled crease network: long + short ridge/shadow pairs at random angles
  const count = 11;
  for (let i = 0; i < count; i++) {
    const long = i < 6;
    const cx = x + rand() * w, cy = y + rand() * h;
    const angle = rand() * Math.PI;
    const len = (long ? 0.75 + rand() * 0.55 : 0.18 + rand() * 0.3) * Math.max(w, h);
    const dx = Math.cos(angle) * len, dy = Math.sin(angle) * len;
    const x1 = cx - dx / 2, y1 = cy - dy / 2, x2 = cx + dx / 2, y2 = cy + dy / 2;
    const lw = (long ? 2.5 + rand() * 3 : 1.5 + rand() * 2) * scale;
    const nrmX = -dy / len, nrmY = dx / len;
    const off = (1.2 + rand() * 1.4) * scale;

    ctx.strokeStyle = `rgba(255,255,255,${(0.09 + rand() * 0.1).toFixed(2)})`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(8,30,60,${(0.16 + rand() * 0.14).toFixed(2)})`;
    ctx.lineWidth = lw * 0.7;
    ctx.beginPath();
    ctx.moveTo(x1 + nrmX * off, y1 + nrmY * off);
    ctx.lineTo(x2 + nrmX * off, y2 + nrmY * off);
    ctx.stroke();
  }

  // vignette
  const vr = Math.max(w, h) * 0.72;
  const vg = ctx.createRadialGradient(x + w / 2, y + h * 0.45, vr * 0.35, x + w / 2, y + h * 0.45, vr);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(x, y, w, h);

  ctx.restore();
}

function drawOverlays(ctx, opts, g) {
  const t = opts.theme;
  const ui = t.uiVars;
  const ink = ui['--ink'];
  const dpi = opts.dpi;
  const line = Math.max(1, Math.round(dpi / 150));

  if (opts.frame) {
    // double-rule border around the map area
    ctx.strokeStyle = ink;
    ctx.lineWidth = line * 2;
    ctx.strokeRect(g.mapX - line * 3, g.mapY - line * 3, g.mapPxW + line * 6, g.mapPxH + line * 6);
    ctx.lineWidth = line;
    ctx.strokeRect(g.mapX - line * 7, g.mapY - line * 7, g.mapPxW + line * 14, g.mapPxH + line * 14);

    // Theme-specific outer chrome (beyond the shared double-rule)
    if (t.exportFrame === 'parchment' || t.exportFrame === 'gazette') {
      drawCornerFlourishes(ctx, g, ink, dpi);
      if (t.exportFrame === 'parchment') drawParchmentCartouche(ctx, g, ink, dpi, opts.title, t);
    } else if (t.exportFrame === 'arcade') {
      drawPixelCorners(ctx, g, ink, dpi);
    } else if (t.exportFrame === 'blueprint') {
      drawBlueprintTitleBlock(ctx, g, ink, dpi, opts.title);
    } else if (t.exportFrame === 'terminal') {
      drawTerminalBezel(ctx, g, ink, dpi);
    } else if (t.exportFrame === 'lcd') {
      drawLcdChassis(ctx, g, ink, ui, dpi);
    }

    if (opts.title && t.exportFrame !== 'blueprint' && t.exportFrame !== 'parchment') {
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(dpi * 0.3)}px ${t.uiFonts.display}`;
      ctx.fillText(opts.title, g.pxW / 2, g.margin + dpi * 0.22, g.mapPxW);
    }
  }

  // scale bar (bottom-left, inside map)
  drawScaleBar(ctx, opts, g, ink);
  // compass rose (top-right, inside map)
  drawCompass(ctx, opts, g, ink);

  // attribution — required by OpenStreetMap's license, always drawn
  ctx.save();
  ctx.font = `${Math.round(dpi * 0.085)}px ${t.uiFonts.body}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const attr = '© OpenStreetMap contributors · OpenFreeMap · MapsX';
  const pad = Math.round(dpi * 0.06);
  if (opts.frame) {
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.75;
    ctx.fillText(attr, g.mapX + g.mapPxW, g.pxH - Math.round(g.margin * 0.3));
  } else {
    const m = ctx.measureText(attr);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = ui['--panel'];
    ctx.fillRect(g.pxW - m.width - pad * 3, g.pxH - Math.round(dpi * 0.085) - pad * 3, m.width + pad * 3, Math.round(dpi * 0.085) + pad * 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.fillText(attr, g.pxW - pad, g.pxH - pad);
  }
  ctx.restore();
}

function drawCornerFlourishes(ctx, g, ink, dpi) {
  const s = Math.round(dpi * 0.18);
  const o = Math.max(2, Math.round(dpi / 150)) * 7;
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, Math.round(dpi / 150));
  const corners = [
    [g.mapX - o, g.mapY - o, 1, 1],
    [g.mapX + g.mapPxW + o, g.mapY - o, -1, 1],
    [g.mapX - o, g.mapY + g.mapPxH + o, 1, -1],
    [g.mapX + g.mapPxW + o, g.mapY + g.mapPxH + o, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    // Outer curve
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y);
    ctx.quadraticCurveTo(x + dx * s * 0.45, y + dy * s * 0.45, x, y + dy * s);
    ctx.stroke();
    // Inner echo curve for richer cartouche corners
    ctx.beginPath();
    ctx.moveTo(x + dx * s * 0.72, y + dy * s * 0.12);
    ctx.quadraticCurveTo(x + dx * s * 0.4, y + dy * s * 0.4, x + dx * s * 0.12, y + dy * s * 0.72);
    ctx.stroke();
    // Decorative dots
    ctx.beginPath();
    ctx.arc(x + dx * s * 0.55, y + dy * s * 0.55, s * 0.09, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + dx * s * 0.28, y + dy * s * 0.28, s * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
  }
  ctx.restore();
}

// Small title banner for parchment prints (drawn in the top margin)
function drawParchmentCartouche(ctx, g, ink, dpi, title, theme) {
  if (!title) return;
  const cx = g.pxW / 2;
  const cy = g.margin + dpi * 0.22;
  const tw = Math.min(g.mapPxW * 0.7, Math.round(dpi * 3.2));
  const th = Math.round(dpi * 0.34);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, Math.round(dpi / 150));
  ctx.strokeRect(cx - tw / 2, cy - th / 2, tw, th);
  ctx.strokeRect(cx - tw / 2 + dpi * 0.04, cy - th / 2 + dpi * 0.04, tw - dpi * 0.08, th - dpi * 0.08);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(dpi * 0.22)}px ${theme.uiFonts.display}`;
  ctx.fillText(title, cx, cy, tw - dpi * 0.2);
  ctx.restore();
}

// staircase blocks on each corner, like an old game's dialog box
function drawPixelCorners(ctx, g, ink, dpi) {
  const u = Math.max(3, Math.round(dpi * 0.045)); // one "pixel"
  const off = Math.max(2, Math.round(dpi / 150)) * 7;
  ctx.save();
  ctx.fillStyle = ink;
  const corners = [
    [g.mapX - off, g.mapY - off, 1, 1],
    [g.mapX + g.mapPxW + off, g.mapY - off, -1, 1],
    [g.mapX - off, g.mapY + g.mapPxH + off, 1, -1],
    [g.mapX + g.mapPxW + off, g.mapY + g.mapPxH + off, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    // Slightly richer staircase than before (extra step)
    for (const [px, py] of [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [0, 2], [0, 3], [1, 1], [2, 1], [1, 2]]) {
      ctx.fillRect(x + dx * px * u - (dx < 0 ? u : 0), y + dy * py * u - (dy < 0 ? u : 0), u, u);
    }
  }
  ctx.restore();
}

// Drafting-table title plate in the lower-right corner
function drawBlueprintTitleBlock(ctx, g, ink, dpi, title) {
  const bw = Math.round(dpi * 2.1);
  const bh = Math.round(dpi * 0.85);
  const pad = Math.round(dpi * 0.08);
  const x = g.mapX + g.mapPxW - bw - Math.round(dpi * 0.15);
  const y = g.mapY + g.mapPxH - bh - Math.round(dpi * 0.15);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, Math.round(dpi / 120));
  ctx.strokeRect(x, y, bw, bh);
  ctx.strokeRect(x + pad * 0.5, y + pad * 0.5, bw - pad, bh - pad);
  // Divider lines inside the plate
  ctx.beginPath();
  ctx.moveTo(x + pad, y + bh * 0.38);
  ctx.lineTo(x + bw - pad, y + bh * 0.38);
  ctx.moveTo(x + bw * 0.55, y + bh * 0.38);
  ctx.lineTo(x + bw * 0.55, y + bh - pad);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(dpi * 0.11)}px "Architects Daughter", cursive`;
  ctx.fillText(title || 'MAP SHEET', x + pad * 1.4, y + bh * 0.22, bw - pad * 3);
  ctx.font = `${Math.round(dpi * 0.09)}px "Architects Daughter", cursive`;
  ctx.fillText('SHEET 1 / 1', x + pad * 1.4, y + bh * 0.62);
  ctx.fillText('SCALE AS SHOWN', x + bw * 0.58, y + bh * 0.62);
  ctx.restore();
}

// Phosphor CRT lip / bezel around the terminal map area
function drawTerminalBezel(ctx, g, ink, dpi) {
  const o = Math.round(dpi * 0.08);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(2, Math.round(dpi / 90));
  ctx.strokeRect(g.mapX - o, g.mapY - o, g.mapPxW + o * 2, g.mapPxH + o * 2);
  // Inner glow lip
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(1, Math.round(dpi / 180));
  ctx.strokeRect(g.mapX - o * 0.35, g.mapY - o * 0.35, g.mapPxW + o * 0.7, g.mapPxH + o * 0.7);
  // Corner ticks
  ctx.globalAlpha = 0.9;
  const tick = Math.round(dpi * 0.12);
  const corners = [
    [g.mapX - o, g.mapY - o, 1, 1],
    [g.mapX + g.mapPxW + o, g.mapY - o, -1, 1],
    [g.mapX - o, g.mapY + g.mapPxH + o, 1, -1],
    [g.mapX + g.mapPxW + o, g.mapY + g.mapPxH + o, -1, -1],
  ];
  ctx.lineWidth = Math.max(2, Math.round(dpi / 100));
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * tick);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * tick, y);
    ctx.stroke();
  }
  ctx.restore();
}

// Olive LCD chassis: thicker outer band + recessed screen lip
function drawLcdChassis(ctx, g, ink, ui, dpi) {
  const o = Math.round(dpi * 0.1);
  ctx.save();
  // Outer chassis fill in the margin ring (already panel-colored; darken a band)
  ctx.fillStyle = ui['--bg'] || '#b6c1a4';
  ctx.globalAlpha = 0.55;
  ctx.fillRect(g.mapX - o * 1.6, g.mapY - o * 1.6, g.mapPxW + o * 3.2, o * 1.2);
  ctx.fillRect(g.mapX - o * 1.6, g.mapY + g.mapPxH + o * 0.4, g.mapPxW + o * 3.2, o * 1.2);
  ctx.fillRect(g.mapX - o * 1.6, g.mapY - o * 0.4, o * 1.2, g.mapPxH + o * 0.8);
  ctx.fillRect(g.mapX + g.mapPxW + o * 0.4, g.mapY - o * 0.4, o * 1.2, g.mapPxH + o * 0.8);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(2, Math.round(dpi / 80));
  ctx.strokeRect(g.mapX - o, g.mapY - o, g.mapPxW + o * 2, g.mapPxH + o * 2);
  ctx.lineWidth = Math.max(1, Math.round(dpi / 150));
  ctx.globalAlpha = 0.5;
  ctx.strokeRect(g.mapX - o * 0.35, g.mapY - o * 0.35, g.mapPxW + o * 0.7, g.mapPxH + o * 0.7);
  ctx.restore();
}

function drawScaleBar(ctx, opts, g, ink) {
  const dpi = opts.dpi;
  const target = g.mapPxW / 5; // aim for ~1/5 of the map width
  const targetMeters = target * g.metersPerPx;
  const nice = niceDistance(targetMeters);
  const barPx = nice.meters / g.metersPerPx;
  const x = g.mapX + Math.round(dpi * 0.25);
  const y = g.mapY + g.mapPxH - Math.round(dpi * 0.25);
  const h = Math.max(3, Math.round(dpi * 0.035));
  const halo = opts.theme.colors.textHalo;

  ctx.save();
  ctx.fillStyle = halo;
  ctx.globalAlpha = 0.65;
  ctx.fillRect(x - h, y - h * 4.6, barPx + h * 2, h * 5.6);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1, Math.round(dpi / 150));
  // alternating filled segments
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const sx = x + (barPx / segs) * i;
    if (i % 2 === 0) ctx.fillRect(sx, y - h, barPx / segs, h);
    else ctx.strokeRect(sx, y - h, barPx / segs, h);
  }
  ctx.strokeRect(x, y - h, barPx, h);
  ctx.font = `${Math.round(dpi * 0.1)}px ${opts.theme.uiFonts.body}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('0', x, y - h * 1.7);
  ctx.textAlign = 'right';
  ctx.fillText(nice.label, x + barPx, y - h * 1.7);
  ctx.restore();
}

function niceDistance(meters) {
  const steps = [1, 2, 5];
  let best = 1;
  for (let mag = 0; mag <= 6; mag++) {
    for (const s of steps) {
      const d = s * 10 ** mag;
      if (d <= meters) best = d;
    }
  }
  return { meters: best, label: best >= 1000 ? `${best / 1000} km` : `${best} m` };
}

function drawCompass(ctx, opts, g, ink) {
  const dpi = opts.dpi;
  const r = Math.round(dpi * 0.22);
  const cx = g.mapX + g.mapPxW - r - Math.round(dpi * 0.2);
  const cy = g.mapY + r + Math.round(dpi * 0.2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-g.bearing * Math.PI) / 180);
  ctx.globalAlpha = 0.9;

  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, Math.round(dpi / 150));
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  // four-point star: north filled
  ctx.fillStyle = ink;
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.68);
    ctx.lineTo(r * 0.13, -r * 0.13);
    ctx.lineTo(-r * 0.13, -r * 0.13);
    ctx.closePath();
    if (i === 0) ctx.fill();
    else ctx.stroke();
    ctx.restore();
  }
  ctx.font = `${Math.round(r * 0.55)}px ${opts.theme.uiFonts.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('N', 0, -r * 0.78);
  ctx.restore();
}

export function downloadCanvas(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      resolve();
    }, 'image/png');
  });
}

export function openPrintView(canvas, title) {
  const dataUrl = canvas.toDataURL('image/png');
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(
    `<!doctype html><title>${escapeHtml(title || 'MapsX print')}</title>` +
    '<style>@page{margin:0}body{margin:0}img{width:100vw;height:auto;display:block}</style>' +
    `<img src="${dataUrl}" onload="setTimeout(()=>print(),150)">`
  );
  win.document.close();
  return true;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
