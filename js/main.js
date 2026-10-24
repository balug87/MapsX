// MapsX — stylized map filters over OpenStreetMap vector tiles.

import { THEMES, getTheme } from './themes.js';
import { buildStyle } from './stylegen.js';
import { registerGlyphProtocol } from './glyphs.js';
import { applyLandPatterns } from './patterns.js';
import { initSearch } from './search.js';
import { PAPER_SIZES, paperAspect, renderPrint, downloadCanvas, openPrintView } from './export.js';
import { DITHER_MODES, attachDither } from './dither.js';

const maplibregl = window.maplibregl;
registerGlyphProtocol(maplibregl);

// --- state / url hash ---

const DEFAULT_VIEW = { center: [14.4205, 50.0870], zoom: 14.4 }; // Prague old town

function parseHash() {
  const m = location.hash.match(/^#([\w-]+)\/([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)(?:\/(-?[\d.]+))?$/);
  if (!m) return null;
  return {
    theme: m[1],
    zoom: parseFloat(m[2]),
    center: [parseFloat(m[4]), parseFloat(m[3])],
    bearing: m[5] ? parseFloat(m[5]) : 0,
  };
}

const fromHash = parseHash();
let theme = getTheme(fromHash?.theme || localStorage.getItem('mapsx-theme') || 'medieval');

function writeHash() {
  const c = map.getCenter();
  const b = map.getBearing();
  const parts = [theme.id, map.getZoom().toFixed(2), c.lat.toFixed(5), c.lng.toFixed(5)];
  if (Math.abs(b) > 0.1) parts.push(b.toFixed(1));
  history.replaceState(null, '', `#${parts.join('/')}`);
}

// --- map ---

const map = new maplibregl.Map({
  container: 'map',
  style: buildStyle(theme),
  center: fromHash?.center || DEFAULT_VIEW.center,
  zoom: fromHash?.zoom ?? DEFAULT_VIEW.zoom,
  bearing: fromHash?.bearing || 0,
  pitch: 0,
  maxPitch: 0,
  attributionControl: { compact: true },
  canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
});
map.addControl(new maplibregl.NavigationControl({ showPitch: false }), 'top-right');

// Real-time GPS position: user taps the locate button, grants permission,
// then the blue (MapLibre) dot tracks them as they move.
const geolocateCtrl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserLocation: true,
  showAccuracyCircle: true,
});
map.addControl(geolocateCtrl, 'top-right');
geolocateCtrl.on('error', (err) => {
  const denied = err?.code === 1 || /denied|permission/i.test(String(err?.message || ''));
  showToast(
    denied
      ? 'Location permission denied — enable it in your browser settings to see your position.'
      : 'Location unavailable — check that GPS/location services are on.',
    true,
  );
});

applyPixelScale();
const ditherCtl = attachDither(map);
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
map.on('moveend', writeHash);

map.on('error', (e) => {
  const msg = String(e?.error?.message || e?.error || '');
  if (/tiles\.openfreemap|Failed to fetch|NetworkError|AJAXError/i.test(msg)) {
    showToast('Map tiles failed to load — check your internet connection.', true);
  }
  console.warn('map error:', e.error || e);
});

// After every style load, register wood/wetland hatch images and show overlays
map.on('style.load', () => applyLandPatterns(map, theme));

// --- theming (map + app chrome) ---

function applyThemeToUI() {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.uiVars)) root.style.setProperty(k, v);
  root.style.setProperty('--font-display', theme.uiFonts.display);
  root.style.setProperty('--font-body', theme.uiFonts.body);
  document.body.dataset.theme = theme.id;
  document.body.dataset.effect = theme.effect || '';
  for (const card of document.querySelectorAll('.theme-card')) {
    card.classList.toggle('active', card.dataset.theme === theme.id);
  }
  syncDitherControls();
  ditherCtl.sync(theme);
}

function applyPixelScale() {
  // Pixel-art themes render the canvas at a low fixed ratio and let CSS
  // upscale it nearest-neighbor (see [data-effect='pixelate'] in app.css).
  map.setPixelRatio(theme.pixelScale || window.devicePixelRatio || 1);
}

function setTheme(id) {
  theme = getTheme(id);
  localStorage.setItem('mapsx-theme', theme.id);
  map.setStyle(buildStyle(theme));
  applyPixelScale();
  applyThemeToUI();
  writeHash();
  // On phones, picking a filter should put the map front-and-center again
  closeDrawer();
}

// --- theme cards ---

const themeList = document.getElementById('theme-list');
for (const t of THEMES) {
  const card = document.createElement('button');
  card.className = 'theme-card';
  card.dataset.theme = t.id;
  card.type = 'button';
  const sw = [t.colors.background, t.colors.water, t.colors.primary, t.colors.building, t.colors.text]
    .map((color) => `<i style="background:${color}"></i>`).join('');
  card.innerHTML = `<span class="swatches">${sw}</span><span class="tname">${t.name}</span><span class="tblurb">${t.blurb}</span>`;
  card.addEventListener('click', () => setTheme(t.id));
  themeList.appendChild(card);
}

// Screen controls for Dither Press (Bayer / halftone / hatch…).
try {
  const saved = JSON.parse(localStorage.getItem('mapsx-dither') || 'null');
  const spec = getTheme('dither');
  if (saved && spec.dither) {
    if (DITHER_MODES.some((m) => m.id === saved.mode)) spec.dither.mode = saved.mode;
    const cell = Number(saved.pixelSize);
    if (cell >= 1 && cell <= 5) spec.dither.pixelSize = cell;
    const spread = Number(saved.spread);
    if (spread >= 0 && spread <= 1) spec.dither.spread = spread;
  }
} catch {
  /* ignore broken prefs */
}

const ditherBox = document.createElement('div');
ditherBox.id = 'dither-controls';
ditherBox.hidden = true;
ditherBox.innerHTML = `
  <p class="section-label">Screen</p>
  <div class="dither-modes" id="dither-modes"></div>
  <label class="dither-slider">Cell <input id="dither-cell" type="range" min="1" max="5" step="1" value="2" /></label>
  <label class="dither-slider">Spread <input id="dither-spread" type="range" min="0" max="100" step="1" value="86" /></label>
`;
themeList.after(ditherBox);
const ditherModesEl = ditherBox.querySelector('#dither-modes');
const ditherCell = ditherBox.querySelector('#dither-cell');
const ditherSpread = ditherBox.querySelector('#dither-spread');

function persistDither() {
  const d = getTheme('dither').dither;
  localStorage.setItem('mapsx-dither', JSON.stringify({
    mode: d.mode, pixelSize: d.pixelSize, spread: d.spread,
  }));
}

function syncDitherControls() {
  const on = !!theme.dither;
  ditherBox.hidden = !on;
  if (!on) return;
  const d = theme.dither;
  for (const b of ditherModesEl.querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.mode === d.mode);
  }
  ditherCell.value = String(d.pixelSize);
  ditherSpread.value = String(Math.round(d.spread * 100));
}

for (const m of DITHER_MODES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = m.label;
  b.dataset.mode = m.id;
  b.addEventListener('click', () => {
    getTheme('dither').dither.mode = m.id;
    persistDither();
    if (theme.dither) ditherCtl.sync(theme);
    syncDitherControls();
  });
  ditherModesEl.appendChild(b);
}
ditherCell.addEventListener('input', () => {
  getTheme('dither').dither.pixelSize = parseInt(ditherCell.value, 10);
  persistDither();
  if (theme.dither) ditherCtl.sync(theme);
});
ditherSpread.addEventListener('input', () => {
  getTheme('dither').dither.spread = parseInt(ditherSpread.value, 10) / 100;
  persistDither();
  if (theme.dither) ditherCtl.sync(theme);
});

// --- mobile filter drawer ---
// CSS owns the layout switch at 720px; JS only toggles open/closed state.

const menuBtn = document.getElementById('btn-menu');
const drawerCloseBtn = document.getElementById('btn-drawer-close');
const drawerBackdrop = document.getElementById('drawer-backdrop');

function openDrawer() {
  document.body.classList.add('drawer-open');
  menuBtn.setAttribute('aria-expanded', 'true');
  menuBtn.setAttribute('aria-label', 'Close filters');
}

function closeDrawer() {
  document.body.classList.remove('drawer-open');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.setAttribute('aria-label', 'Open filters');
}

function toggleDrawer() {
  if (document.body.classList.contains('drawer-open')) closeDrawer();
  else openDrawer();
}

menuBtn.addEventListener('click', toggleDrawer);
drawerCloseBtn.addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);

// Escape closes the drawer; resizing to desktop clears the open state
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});
window.matchMedia('(max-width: 720px)').addEventListener('change', (e) => {
  if (!e.matches) closeDrawer();
});

// --- search ---

initSearch(document.getElementById('search'), document.getElementById('search-results'), (r) => {
  if (r.boundingbox) {
    const [s, n, w, e] = r.boundingbox.map(parseFloat);
    map.fitBounds([[w, s], [e, n]], { padding: 40, maxZoom: 16, duration: 1200 });
  } else {
    map.flyTo({ center: [parseFloat(r.lon), parseFloat(r.lat)], zoom: 14 });
  }
  // After jumping to a place, close the drawer so the map is visible
  closeDrawer();
});

// --- export UI + crop frame ---

const exportPanel = document.getElementById('export-panel');
const frameEl = document.getElementById('crop-frame');
const paperSel = document.getElementById('exp-paper');
const orientSel = document.getElementById('exp-orient');
const dpiSel = document.getElementById('exp-dpi');
const titleInput = document.getElementById('exp-title');
const decorChk = document.getElementById('exp-decor');
const expStatus = document.getElementById('exp-status');

for (const [id, p] of Object.entries(PAPER_SIZES)) {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = `${p.name} (${p.w}″ × ${p.h}″)`;
  paperSel.appendChild(opt);
}
paperSel.value = 'a4';
orientSel.value = 'landscape';

let exporting = false;
let frame = { x: 0, y: 0, w: 0, h: 0 };

function frameAspect() {
  return paperAspect(paperSel.value, orientSel.value);
}

function resetFrame() {
  const mapEl = map.getContainer();
  const W = mapEl.clientWidth;
  const H = mapEl.clientHeight;
  const aspect = frameAspect();
  let w = W * 0.6;
  let h = w / aspect;
  if (h > H * 0.75) { h = H * 0.75; w = h * aspect; }
  frame = { x: (W - w) / 2, y: (H - h) / 2, w, h };
  positionFrame();
}

function positionFrame() {
  Object.assign(frameEl.style, {
    left: `${frame.x}px`, top: `${frame.y}px`,
    width: `${frame.w}px`, height: `${frame.h}px`,
  });
}

// drag to move, corner handle to resize (aspect locked)
let dragMode = null;
let dragStart = null;
frameEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  frameEl.setPointerCapture(e.pointerId);
  dragMode = e.target.classList.contains('handle') ? 'resize' : 'move';
  dragStart = { x: e.clientX, y: e.clientY, frame: { ...frame } };
});
frameEl.addEventListener('pointermove', (e) => {
  if (!dragMode) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  const mapEl = map.getContainer();
  const W = mapEl.clientWidth;
  const H = mapEl.clientHeight;
  if (dragMode === 'move') {
    frame.x = Math.min(Math.max(0, dragStart.frame.x + dx), W - frame.w);
    frame.y = Math.min(Math.max(0, dragStart.frame.y + dy), H - frame.h);
  } else {
    const aspect = frameAspect();
    let w = Math.max(120, dragStart.frame.w + dx);
    w = Math.min(w, W - dragStart.frame.x, (H - dragStart.frame.y) * aspect);
    frame.w = w;
    frame.h = w / aspect;
  }
  positionFrame();
});
const endDrag = () => { dragMode = null; };
frameEl.addEventListener('pointerup', endDrag);
frameEl.addEventListener('pointercancel', endDrag);

paperSel.addEventListener('change', resetFrame);
orientSel.addEventListener('change', resetFrame);

document.getElementById('btn-export-open').addEventListener('click', () => {
  const open = exportPanel.hidden;
  exportPanel.hidden = !open;
  frameEl.hidden = !open;
  if (open) resetFrame();
});
document.getElementById('btn-export-close').addEventListener('click', () => {
  exportPanel.hidden = true;
  frameEl.hidden = true;
});

function cropView() {
  const center = map.unproject([frame.x + frame.w / 2, frame.y + frame.h / 2]);
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    cssWidth: frame.w,
  };
}

async function doExport(kind) {
  if (exporting) return;
  exporting = true;
  expStatus.textContent = 'Rendering high-resolution map… (this can take a minute)';
  document.body.classList.add('busy');
  try {
    const canvas = await renderPrint(maplibregl, {
      theme,
      paper: paperSel.value,
      orientation: orientSel.value,
      dpi: parseInt(dpiSel.value, 10),
      title: titleInput.value.trim(),
      frame: decorChk.checked,
    }, cropView());
    if (kind === 'print') {
      if (!openPrintView(canvas, titleInput.value.trim())) {
        showToast('Pop-up blocked — allow pop-ups to print, or use Save PNG.', true);
      }
      expStatus.textContent = '';
    } else {
      await downloadCanvas(canvas, `mapsx-${theme.id}-${Date.now()}.png`);
      expStatus.textContent = 'Saved ✓';
      setTimeout(() => { expStatus.textContent = ''; }, 4000);
    }
  } catch (err) {
    console.error(err);
    expStatus.textContent = '';
    showToast(`Export failed: ${err.message || err}`, true);
  } finally {
    exporting = false;
    document.body.classList.remove('busy');
  }
}

document.getElementById('btn-export-png').addEventListener('click', () => doExport('png'));
document.getElementById('btn-export-print').addEventListener('click', () => doExport('print'));

// --- misc ---

function showToast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 6000);
}

document.getElementById('btn-about').addEventListener('click', () => {
  document.getElementById('about-dialog').showModal();
});

applyThemeToUI();
