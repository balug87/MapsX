// MapsX — stylized map filters over OpenStreetMap vector tiles.

import { THEMES, getTheme } from './themes.js';
import { buildStyle } from './stylegen.js';
import { registerGlyphProtocol } from './glyphs.js';
import { initSearch } from './search.js';
import { PAPER_SIZES, paperAspect, renderPrint, downloadCanvas, openPrintView } from './export.js';

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
});
map.addControl(new maplibregl.NavigationControl({ showPitch: false }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
map.on('moveend', writeHash);

map.on('error', (e) => {
  const msg = String(e?.error?.message || e?.error || '');
  if (/tiles\.openfreemap|Failed to fetch|NetworkError|AJAXError/i.test(msg)) {
    showToast('Map tiles failed to load — check your internet connection.', true);
  }
  console.warn('map error:', e.error || e);
});

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
}

function setTheme(id) {
  theme = getTheme(id);
  localStorage.setItem('mapsx-theme', theme.id);
  map.setStyle(buildStyle(theme));
  applyThemeToUI();
  writeHash();
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

// --- search ---

initSearch(document.getElementById('search'), document.getElementById('search-results'), (r) => {
  if (r.boundingbox) {
    const [s, n, w, e] = r.boundingbox.map(parseFloat);
    map.fitBounds([[w, s], [e, n]], { padding: 40, maxZoom: 16, duration: 1200 });
  } else {
    map.flyTo({ center: [parseFloat(r.lon), parseFloat(r.lat)], zoom: 14 });
  }
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
