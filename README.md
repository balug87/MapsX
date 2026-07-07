# MapsX — Stylized Map Filters

A web app that applies fully stylized "filters" to real-world maps — color
palette, typography, and point-of-interest icons all change together — and
exports any selected area as a print-ready PNG.

Ships with six filters:

| Filter | Look |
|---|---|
| **Medieval Parchment** | Aged vellum, sepia inks, blackletter city names (UnifrakturMaguntia), IM Fell English labels |
| **Terminal** | Phosphor green on black, VT323 pixel type, scanline overlay |
| **Blueprint** | White ink on cyanotype blue, hand-drafted lettering (Architects Daughter) |
| **Noir Gazette** | Newsprint palette, Playfair Display headlines, typewriter details |
| **8-Bit Overworld** | NES sprite palette, Press Start 2P labels, genuinely pixelated rendering (low-res canvas upscaled nearest-neighbor, on screen and in print) |
| **Candy Pastel** | Soft sorbet tones with rounded Quicksand type |

## Run it

No build step, no API keys. Serve the folder with any static server:

```sh
npm start           # uses `npx serve` on port 8080
# or
python3 -m http.server 8080
```

Then open http://localhost:8080. (Opening `index.html` from `file://` won't
work — ES modules and the glyph protocol need an HTTP origin.)

Internet access is required at runtime for map tiles
(`tiles.openfreemap.org`) and place search (`nominatim.openstreetmap.org`).
Everything else — MapLibre, fonts, glyph rendering — is bundled and local.

## Why not Google Maps?

Google Maps' styling API only allows recoloring its fixed cartography — no
custom fonts, no custom POI icons — and its terms prohibit offline/print
export of tiles. MapsX instead renders **OpenStreetMap** vector data
([OpenFreeMap](https://openfreemap.org) tiles, free and keyless) with
[MapLibre GL JS](https://maplibre.org), which gives full control over every
color, line, label, and icon.

## How it works

- **`js/themes.js`** — each filter is a declarative spec: palette, font
  stacks, dash patterns, POI glyph mapping, UI chrome variables, export frame
  style. Adding a filter is adding one entry (plus optional fonts).
- **`js/stylegen.js`** — a style factory that compiles a theme spec into a
  complete MapLibre style JSON over the OpenMapTiles schema (~30 layers:
  land, water, roads with casings, rail, boundaries, POIs, place labels).
- **`js/glyphs.js`** — the trick that makes arbitrary map fonts possible:
  MapLibre normally needs a server that pre-renders fonts into SDF glyph
  PBFs. MapsX registers a `glyphs://` protocol that rasterizes any bundled
  web font (via `@mapbox/tiny-sdf`) into that exact PBF format at runtime in
  the browser. POI icons are unicode/emoji characters run through the same
  pipeline, so they become monochrome silhouettes tinted in theme colors.
- **`js/export.js`** — print export: draws a movable/resizable crop frame,
  re-renders that region in a hidden high-DPI MapLibre instance
  (up to A3 @ 300 dpi), and composites a themed border, title cartouche,
  compass rose, scale bar, and the required OpenStreetMap attribution on a
  2D canvas. Save as PNG or send straight to the print dialog.

## Tests

```sh
npm test                      # unit tests for the glyph PBF encoder
```

`tests/harness.html` is an offline end-to-end check of the glyph engine — it
renders labels and icon glyphs on a GeoJSON-only map (no tile server) and
verifies the generated PBF structure and the rendered pixels. Open it via a
static server, or drive it headlessly with Playwright.

## Licenses & attribution

- Code: MIT.
- Map data: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
  (ODbL). Keep the attribution visible on published or printed exports —
  the export pipeline draws it automatically.
- Tiles: [OpenFreeMap](https://openfreemap.org) (free to use).
- Bundled fonts (`fonts/`): from [Fontsource](https://fontsource.org),
  all under the SIL Open Font License.
- `vendor/maplibre-gl*`: MapLibre GL JS, BSD-3-Clause.
  `js/vendor-tinysdf.js`: @mapbox/tiny-sdf, BSD-2-Clause.
