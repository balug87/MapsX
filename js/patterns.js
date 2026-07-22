// Runtime landcover patterns (wood hatch, wetland stipple) registered with
// MapLibre via map.addImage so fill layers can use fill-pattern. Patterns are
// small power-of-two canvases tinted with the theme land colors.

const WOOD_ID = 'mapsx-wood-hatch';
const WETLAND_ID = 'mapsx-wetland-stipple';

function makeHatchImage(size, inkCss) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  // Transparent background; diagonal ink strokes become the hatch
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = inkCss;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -size; i < size * 2; i += 4) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
  }
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

function makeStippleImage(size, inkCss) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = inkCss;
  // Sparse dots for wetland texture
  const dots = [
    [2, 2], [10, 4], [6, 10], [14, 12], [4, 14], [12, 8],
  ];
  for (const [x, y] of dots) {
    ctx.beginPath();
    ctx.arc(x, y, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  return ctx.getImageData(0, 0, size, size);
}

function darken(hex, amount) {
  // Simple hex darken for pattern ink that sits on top of the fill color
  const h = hex.replace('#', '');
  if (h.length !== 6) return 'rgba(0,0,0,0.35)';
  const n = parseInt(h, 16);
  const r = Math.max(0, ((n >> 16) & 255) - amount);
  const g = Math.max(0, ((n >> 8) & 255) - amount);
  const b = Math.max(0, (n & 255) - amount);
  return `rgba(${r},${g},${b},0.55)`;
}

function upsertImage(map, id, imageData) {
  if (map.hasImage(id)) map.removeImage(id);
  map.addImage(id, imageData, { pixelRatio: 1 });
}

// Call after style.load (and after setStyle). Safe to call repeatedly.
export function applyLandPatterns(map, theme) {
  if (!map || !theme?.colors) return;
  try {
    const woodInk = darken(theme.colors.wood || '#000000', 40);
    const wetInk = darken(theme.colors.wetland || '#000000', 35);
    upsertImage(map, WOOD_ID, makeHatchImage(16, woodInk));
    upsertImage(map, WETLAND_ID, makeStippleImage(16, wetInk));

    if (map.getLayer('landcover-wood-pattern')) {
      map.setPaintProperty('landcover-wood-pattern', 'fill-pattern', WOOD_ID);
      map.setLayoutProperty('landcover-wood-pattern', 'visibility', 'visible');
    }
    if (map.getLayer('landcover-wetland-pattern')) {
      map.setPaintProperty('landcover-wetland-pattern', 'fill-pattern', WETLAND_ID);
      map.setLayoutProperty('landcover-wetland-pattern', 'visibility', 'visible');
    }
  } catch (err) {
    console.warn('land patterns:', err);
  }
}
