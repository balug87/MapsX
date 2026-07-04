// Print export: renders the region under the crop frame into a hidden
// high-DPI MapLibre instance, then composites a themed print frame (border,
// title cartouche, compass rose, scale bar, attribution) on a 2D canvas.

import { buildStyle } from './stylegen.js';

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
    pixelRatio: ratio,
    maxCanvasSize: [16384, 16384],
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  });

  try {
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
    ctx.drawImage(mapCanvas, mapX, mapY, mapPxW, mapPxH);

    if (opts.theme.effect === 'scanlines') drawScanlines(ctx, mapX, mapY, mapPxW, mapPxH, opts.dpi);

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

    if (t.exportFrame === 'parchment' || t.exportFrame === 'gazette') {
      drawCornerFlourishes(ctx, g, ink, dpi);
    }

    if (opts.title) {
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
  const s = Math.round(dpi * 0.16);
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
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y);
    ctx.quadraticCurveTo(x + dx * s * 0.45, y + dy * s * 0.45, x, y + dy * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + dx * s * 0.55, y + dy * s * 0.55, s * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  }
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
