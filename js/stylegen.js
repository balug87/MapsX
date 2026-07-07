// Style factory: builds a complete MapLibre style JSON from a theme spec.
// Data: OpenStreetMap vector tiles in the OpenMapTiles schema, served by
// OpenFreeMap (free, no API key). Glyphs come from the local glyph engine.

import { POI_CHARS } from './themes.js';

export const TILE_URL = 'https://tiles.openfreemap.org/planet';
export const ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a> · ' +
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a>';

const NAME = ['coalesce', ['get', 'name:latin'], ['get', 'name']];

// Exponential road width ramp: w px at z14, scaling 2x every ~2.4 zooms.
function roadWidth(w14) {
  return ['interpolate', ['exponential', 1.4], ['zoom'],
    6, w14 * 0.12, 10, w14 * 0.3, 14, w14, 18, w14 * 5];
}

// OpenMapTiles `poi.class` -> icon category (see POI_CHARS in themes.js)
const POI_CLASS_CATEGORY = {
  restaurant: 'food', fast_food: 'food', ice_cream: 'food', bakery: 'food',
  cafe: 'cafe',
  bar: 'drink', beer: 'drink', alcohol_shop: 'drink',
  shop: 'shop', clothing_store: 'shop', jewelry: 'shop',
  grocery: 'grocery',
  lodging: 'lodging', hotel: 'lodging', campsite: 'lodging',
  place_of_worship: 'worship',
  castle: 'castle',
  theatre: 'culture', cinema: 'culture', art_gallery: 'culture', entertainment: 'culture',
  museum: 'museum', monument: 'monument', attraction: 'monument',
  library: 'books', school: 'books', college: 'books', university: 'books',
  hospital: 'health', pharmacy: 'health', doctors: 'health', dentist: 'health', veterinary: 'health',
  bus: 'transit', tram: 'transit',
  railway: 'rail',
  airport: 'air', aerialway: 'air',
  harbor: 'harbor', ferry_terminal: 'harbor',
  fuel: 'fuel', charging_station: 'fuel',
  park: 'park', garden: 'park', zoo: 'park',
  stadium: 'sport', sport: 'sport', pitch: 'sport', swimming: 'sport', golf: 'sport', playground: 'sport',
  music: 'music',
  police: 'police', town_hall: 'police',
  post: 'post',
  cemetery: 'cemetery',
  information: 'info',
};

function poiCharExpression(theme) {
  const overrides = theme.poiChars || {};
  const charFor = (cat) => overrides[cat] || POI_CHARS[cat] || POI_CHARS.default;
  // Group classes by resolved char to keep the match expression small.
  const byChar = new Map();
  for (const [cls, cat] of Object.entries(POI_CLASS_CATEGORY)) {
    const ch = charFor(cat);
    if (!byChar.has(ch)) byChar.set(ch, []);
    byChar.get(ch).push(cls);
  }
  const expr = ['match', ['get', 'class']];
  for (const [ch, classes] of byChar) expr.push(classes, ch);
  expr.push(charFor('default'));
  return expr;
}

export function buildStyle(theme) {
  const c = theme.colors;
  const f = theme.fonts;

  const layers = [
    { id: 'background', type: 'background', paint: { 'background-color': c.background } },

    // --- land ---
    {
      id: 'landcover-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'forest']]],
      paint: { 'fill-color': c.wood, 'fill-opacity': 0.85, 'fill-antialias': false },
    },
    {
      id: 'landcover-grass', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['grass', 'farmland']]],
      paint: { 'fill-color': c.grass, 'fill-opacity': 0.7, 'fill-antialias': false },
    },
    {
      id: 'landcover-sand', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'sand'],
      paint: { 'fill-color': c.sand, 'fill-antialias': false },
    },
    {
      id: 'landcover-wetland', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wetland'],
      paint: { 'fill-color': c.wetland, 'fill-opacity': 0.7, 'fill-antialias': false },
    },
    {
      id: 'landuse-residential', type: 'fill', source: 'omt', 'source-layer': 'landuse',
      filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood']]],
      paint: { 'fill-color': c.residential, 'fill-antialias': false },
    },
    {
      id: 'landuse-cemetery', type: 'fill', source: 'omt', 'source-layer': 'landuse',
      filter: ['==', ['get', 'class'], 'cemetery'],
      paint: { 'fill-color': c.cemetery },
    },
    {
      id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park',
      paint: { 'fill-color': c.park, 'fill-opacity': 0.8 },
    },

    // --- water ---
    {
      id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water',
      filter: ['!=', ['get', 'intermittent'], 1],
      paint: { 'fill-color': c.water },
    },
    {
      id: 'water-outline', type: 'line', source: 'omt', 'source-layer': 'water',
      minzoom: 8,
      paint: { 'line-color': c.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 16, 1.4] },
    },
    {
      id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
      paint: {
        'line-color': c.water,
        'line-width': ['interpolate', ['exponential', 1.3], ['zoom'], 9, 0.8, 16, 4],
      },
    },

    // --- aeroway ---
    {
      id: 'aeroway', type: 'line', source: 'omt', 'source-layer': 'aeroway',
      minzoom: 10,
      filter: ['in', ['get', 'class'], ['literal', ['runway', 'taxiway']]],
      paint: {
        'line-color': c.aeroway,
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 1, 16, ['match', ['get', 'class'], 'runway', 40, 8]],
      },
    },

    // --- buildings ---
    {
      id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-color': c.building,
        'fill-outline-color': c.buildingOutline,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 1],
      },
    },

    // --- roads (casings first, then fills) ---
    ...roadPair(theme, 'road-minor', ['minor', 'service', 'living_street', 'raceway', 'busway'],
      c.minor, c.minorCasing, 2.2, 13),
    ...roadPair(theme, 'road-secondary', ['secondary', 'tertiary'],
      c.secondary, c.secondaryCasing, 3.2, 10),
    ...roadPair(theme, 'road-primary', ['primary', 'trunk'],
      c.primary, c.primaryCasing, 4.2, 7),
    ...roadPair(theme, 'road-motorway', ['motorway'],
      c.motorway, c.motorwayCasing, 5, 5),
    {
      id: 'road-path', type: 'line', source: 'omt', 'source-layer': 'transportation',
      minzoom: 14,
      filter: ['in', ['get', 'class'], ['literal', ['path', 'track', 'pedestrian']]],
      paint: {
        'line-color': c.path,
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 14, 0.8, 18, 2.5],
        'line-dasharray': theme.pathDash || [1.5, 1.5],
      },
    },
    {
      id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation',
      minzoom: 11,
      filter: ['==', ['get', 'class'], 'rail'],
      paint: {
        'line-color': c.rail,
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 11, 0.6, 18, 3],
        'line-dasharray': [3, 2],
      },
    },

    // --- boundaries ---
    {
      id: 'boundary-state', type: 'line', source: 'omt', 'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      minzoom: 3,
      paint: {
        'line-color': c.boundary, 'line-opacity': 0.5, 'line-dasharray': theme.boundaryDash,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 12, 1.6],
      },
    },
    {
      id: 'boundary-country', type: 'line', source: 'omt', 'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: {
        'line-color': c.boundary, 'line-opacity': 0.8, 'line-dasharray': theme.boundaryDash,
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.8, 12, 2.4],
      },
    },

    // --- labels ---
    {
      id: 'label-waterway', type: 'symbol', source: 'omt', 'source-layer': 'waterway',
      minzoom: 12,
      layout: {
        'symbol-placement': 'line',
        'text-field': NAME,
        'text-font': [f.italic],
        'text-size': 12,
        'text-letter-spacing': 0.15,
      },
      paint: { 'text-color': c.waterText, 'text-halo-color': c.textHalo, 'text-halo-width': 1.2 },
    },
    {
      id: 'label-water', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
      layout: {
        'text-field': NAME,
        'text-font': [f.italic],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 12, 12, 18],
        'text-letter-spacing': 0.25,
      },
      paint: { 'text-color': c.waterText, 'text-halo-color': c.textHalo, 'text-halo-width': 1 },
    },
    {
      id: 'label-road', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name',
      minzoom: 13,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]],
      layout: {
        'symbol-placement': 'line',
        'text-field': NAME,
        'text-font': [f.label],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 15],
      },
      paint: { 'text-color': c.text, 'text-halo-color': c.textHalo, 'text-halo-width': 1.4, 'text-opacity': 0.9 },
    },

    // --- POIs (icon = themed glyph char, name below at high zoom) ---
    {
      id: 'poi-icon', type: 'symbol', source: 'omt', 'source-layer': 'poi',
      minzoom: 14,
      filter: ['<=', ['coalesce', ['get', 'rank'], 30], ['step', ['zoom'], 14, 15, 25, 16, 100]],
      layout: {
        'text-field': poiCharExpression(theme),
        'text-font': [f.label],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 12, 17, 17],
        'text-padding': 6,
      },
      paint: { 'text-color': c.poi, 'text-halo-color': c.textHalo, 'text-halo-width': 1.2 },
    },
    {
      id: 'poi-name', type: 'symbol', source: 'omt', 'source-layer': 'poi',
      minzoom: 16,
      filter: ['<=', ['coalesce', ['get', 'rank'], 30], 25],
      layout: {
        'text-field': NAME,
        'text-font': [f.label],
        'text-size': 10.5,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-max-width': 8,
        'text-optional': true,
      },
      paint: { 'text-color': c.poiText, 'text-halo-color': c.textHalo, 'text-halo-width': 1.2 },
    },

    // --- places ---
    {
      id: 'label-village', type: 'symbol', source: 'omt', 'source-layer': 'place',
      minzoom: 10, maxzoom: 15,
      filter: ['in', ['get', 'class'], ['literal', ['village', 'hamlet', 'suburb', 'neighbourhood', 'quarter']]],
      layout: {
        'text-field': NAME,
        'text-font': [f.label],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 14, 14],
        'text-letter-spacing': 0.1,
        'text-transform': ['match', ['get', 'class'], ['suburb', 'neighbourhood', 'quarter'], 'uppercase', 'none'],
      },
      paint: { 'text-color': c.text, 'text-halo-color': c.textHalo, 'text-halo-width': 1.4, 'text-opacity': 0.85 },
    },
    {
      id: 'label-town', type: 'symbol', source: 'omt', 'source-layer': 'place',
      minzoom: 7, maxzoom: 15,
      filter: ['==', ['get', 'class'], 'town'],
      layout: {
        'text-field': NAME,
        'text-font': [f.label],
        'text-size': ['interpolate', ['linear'], ['zoom'], 7, 11, 13, 18],
      },
      paint: { 'text-color': c.text, 'text-halo-color': c.textHalo, 'text-halo-width': 1.5 },
    },
    {
      id: 'label-city', type: 'symbol', source: 'omt', 'source-layer': 'place',
      minzoom: 4, maxzoom: 14,
      filter: ['==', ['get', 'class'], 'city'],
      layout: {
        'text-field': NAME,
        'text-font': [f.display],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 12, 8, 18, 12, 26],
      },
      paint: { 'text-color': c.text, 'text-halo-color': c.textHalo, 'text-halo-width': 1.6 },
    },
    {
      id: 'label-state', type: 'symbol', source: 'omt', 'source-layer': 'place',
      minzoom: 3, maxzoom: 8,
      filter: ['==', ['get', 'class'], 'state'],
      layout: {
        'text-field': NAME,
        'text-font': [f.label],
        'text-size': 11,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.3,
      },
      paint: { 'text-color': c.text, 'text-halo-color': c.textHalo, 'text-halo-width': 1.2, 'text-opacity': 0.7 },
    },
    {
      id: 'label-country', type: 'symbol', source: 'omt', 'source-layer': 'place',
      maxzoom: 7,
      filter: ['==', ['get', 'class'], 'country'],
      layout: {
        'text-field': NAME,
        'text-font': [f.display],
        'text-size': ['interpolate', ['linear'], ['zoom'], 1, 12, 5, 22],
        'text-letter-spacing': 0.15,
      },
      paint: { 'text-color': c.text, 'text-halo-color': c.textHalo, 'text-halo-width': 1.6 },
    },
  ];

  if (theme.textScale && theme.textScale !== 1) {
    for (const layer of layers) {
      if (layer.layout?.['text-size'] !== undefined) {
        layer.layout['text-size'] = scaleTextSize(layer.layout['text-size'], theme.textScale);
      }
    }
  }

  return {
    version: 8,
    name: `MapsX ${theme.name}`,
    glyphs: 'glyphs://{fontstack}/{range}',
    sources: {
      omt: { type: 'vector', url: TILE_URL, attribution: ATTRIBUTION },
    },
    layers,
  };
}

// Multiply a text-size value (number or interpolate expression) by a factor;
// used by themes that render at low pixel ratios and need bigger type.
function scaleTextSize(value, factor) {
  const scale = (n) => Math.round(n * factor * 10) / 10;
  if (typeof value === 'number') return scale(value);
  if (Array.isArray(value) && value[0] === 'interpolate') {
    const out = value.slice();
    for (let i = 4; i < out.length; i += 2) out[i] = scale(out[i]);
    return out;
  }
  return value;
}

function roadPair(theme, id, classes, fill, casing, w14, minzoom) {
  const filter = ['all',
    ['in', ['get', 'class'], ['literal', classes]],
    ['!=', ['get', 'ramp'], 1],
  ];
  const layers = [];
  const transparentCasing = casing === 'rgba(0,0,0,0)';
  if (!transparentCasing) {
    layers.push({
      id: `${id}-casing`, type: 'line', source: 'omt', 'source-layer': 'transportation',
      minzoom, filter,
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': casing,
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'],
          6, w14 * 0.12 + 0.6, 10, w14 * 0.3 + 0.8, 14, w14 + 1.6, 18, w14 * 5 + 2.5],
      },
    });
  }
  layers.push({
    id, type: 'line', source: 'omt', 'source-layer': 'transportation',
    minzoom, filter,
    layout: { 'line-cap': transparentCasing ? 'round' : 'butt', 'line-join': 'round' },
    paint: { 'line-color': fill, 'line-width': roadWidth(w14) },
  });
  return layers;
}
