// Theme specs. Each theme is a purely declarative description — palette,
// fonts, line treatments, POI glyph mapping, export frame — consumed by
// stylegen.js (map style), app.css/main.js (UI chrome) and export.js (print
// frame). Adding a theme means adding an entry here (plus optional fonts).

// Map font stack names must match families declared in css/fonts.css.
// POI icons are unicode/emoji characters rendered through the local glyph
// engine as monochrome SDF silhouettes, so they inherit the theme color.

export const POI_CHARS = {
  // category -> default char (themes can override per category)
  food: '\u{1F374}',      // fork and knife
  cafe: '☕',         // hot beverage
  drink: '\u{1F37A}',     // beer mug
  shop: '\u{1F6CD}',      // shopping bags
  grocery: '\u{1F34E}',   // apple
  lodging: '\u{1F6CC}',   // person in bed
  worship: '⛪',      // church
  castle: '\u{1F3F0}',    // castle
  culture: '\u{1F3AD}',   // performing arts
  museum: '\u{1F3DB}',    // classical building
  books: '\u{1F4D6}',     // open book
  health: '✚',       // heavy greek cross
  transit: '\u{1F68D}',   // bus
  rail: '\u{1F686}',      // train
  air: '✈',          // airplane
  harbor: '⚓',       // anchor
  fuel: '⛽',         // fuel pump
  park: '\u{1F333}',      // tree
  sport: '⚽',        // football
  music: '♫',        // beamed notes
  monument: '\u{1F5FF}',  // moai (statue)
  police: '\u{1F6E1}',    // shield
  post: '✉',         // envelope
  cemetery: '⚰',     // coffin
  info: 'ℹ',         // information
  default: '◆',      // diamond
};

export const THEMES = [
  {
    id: 'medieval',
    name: 'Medieval Parchment',
    blurb: 'Aged vellum, sepia inks & blackletter titles',
    fonts: {
      label: 'IM Fell English Regular',
      italic: 'IM Fell English Italic',
      display: 'UnifrakturMaguntia Regular',
    },
    uiFonts: {
      display: '"UnifrakturMaguntia", serif',
      body: '"IM Fell English", serif',
    },
    colors: {
      background: '#ecdfc3',
      residential: '#e6d7b5',
      wood: '#c2c194',
      grass: '#d5cda2',
      park: '#cbc697',
      sand: '#e8d9ae',
      wetland: '#cfd0a8',
      cemetery: '#d8cda6',
      water: '#a9c2b6',
      waterLine: '#7d9c8e',
      aeroway: '#d6c8a4',
      building: '#d8c294',
      buildingOutline: '#8a6a42',
      path: '#8a6a42',
      minor: '#e6d7b5',
      minorCasing: '#9c7c50',
      secondary: '#dfc18c',
      secondaryCasing: '#8a6a42',
      primary: '#d3a86e',
      primaryCasing: '#75542f',
      motorway: '#bd8a4e',
      motorwayCasing: '#5f4324',
      rail: '#7c5c38',
      boundary: '#7a4f33',
      text: '#43301a',
      textHalo: '#ecdfc3',
      waterText: '#3e5c52',
      poi: '#6e4e2c',
      poiText: '#5c452a',
    },
    boundaryDash: [4, 2, 1, 2],
    pathDash: [1.5, 1.5],
    uiVars: {
      '--bg': '#e8dabb', '--panel': '#f2e7cd', '--panel-edge': '#b09468',
      '--ink': '#43301a', '--muted': '#7d6748', '--accent': '#8a4a24',
      '--btn-bg': '#43301a', '--btn-ink': '#f2e7cd', '--radius': '4px',
    },
    exportFrame: 'parchment',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    blurb: 'Phosphor green on black, straight from the mainframe',
    fonts: {
      label: 'VT323 Regular',
      italic: 'VT323 Regular',
      display: 'VT323 Regular',
    },
    uiFonts: {
      display: '"VT323", monospace',
      body: '"Share Tech Mono", monospace',
    },
    colors: {
      background: '#040905',
      residential: '#071108',
      wood: '#06180c',
      grass: '#07160b',
      park: '#083315',
      sand: '#0a140a',
      wetland: '#06180e',
      cemetery: '#081408',
      water: '#02251a',
      waterLine: '#0a6b48',
      aeroway: '#0c2a14',
      building: '#0a1a0e',
      buildingOutline: '#1d5c33',
      path: '#1d7a42',
      minor: '#0f8f46',
      minorCasing: '#032a12',
      secondary: '#16b95c',
      secondaryCasing: '#032a12',
      primary: '#1fd66e',
      primaryCasing: '#04361a',
      motorway: '#32ff88',
      motorwayCasing: '#0a4d26',
      rail: '#0e7a3e',
      boundary: '#2bff7f',
      text: '#5cffa8',
      textHalo: '#021207',
      waterText: '#2fd695',
      poi: '#3dffa0',
      poiText: '#2fe08a',
    },
    boundaryDash: [3, 3],
    pathDash: [1, 2],
    uiVars: {
      '--bg': '#010402', '--panel': '#041008', '--panel-edge': '#0f5c2e',
      '--ink': '#4dffa0', '--muted': '#1e9e5c', '--accent': '#32ff88',
      '--btn-bg': '#0c3d1f', '--btn-ink': '#5cffa8', '--radius': '0px',
    },
    effect: 'scanlines',
    exportFrame: 'terminal',
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    blurb: 'White ink on cyanotype blue, drafted by hand',
    fonts: {
      label: 'Architects Daughter Regular',
      italic: 'Architects Daughter Regular',
      display: 'Architects Daughter Regular',
    },
    uiFonts: {
      display: '"Architects Daughter", cursive',
      body: '"Architects Daughter", cursive',
    },
    colors: {
      background: '#123a66',
      residential: '#16406e',
      wood: '#0f3f66',
      grass: '#124470',
      park: '#15486f',
      sand: '#164272',
      wetland: '#123f6b',
      cemetery: '#153f6c',
      water: '#0b2c50',
      waterLine: '#7ea6cf',
      aeroway: '#2a5586',
      building: 'rgba(0,0,0,0)',
      buildingOutline: '#9fc2e8',
      path: '#a9c8ea',
      minor: '#b9d3ee',
      minorCasing: 'rgba(0,0,0,0)',
      secondary: '#d3e4f6',
      secondaryCasing: 'rgba(0,0,0,0)',
      primary: '#e8f1fb',
      primaryCasing: 'rgba(0,0,0,0)',
      motorway: '#ffffff',
      motorwayCasing: 'rgba(0,0,0,0)',
      rail: '#8fb4dc',
      boundary: '#e8f1fb',
      text: '#eef5fd',
      textHalo: '#123a66',
      waterText: '#bcd6f0',
      poi: '#dcebfa',
      poiText: '#cfe2f6',
    },
    boundaryDash: [6, 3],
    pathDash: [1, 2],
    uiVars: {
      '--bg': '#0d2c4e', '--panel': '#123a66', '--panel-edge': '#4e79a8',
      '--ink': '#eef5fd', '--muted': '#9dbcdd', '--accent': '#ffffff',
      '--btn-bg': '#e8f1fb', '--btn-ink': '#123a66', '--radius': '2px',
    },
    exportFrame: 'blueprint',
  },
  {
    id: 'gazette',
    name: 'Noir Gazette',
    blurb: 'Yesterday’s newsprint: ink, halftones & headlines',
    fonts: {
      label: 'Playfair Display Regular',
      italic: 'Playfair Display Regular',
      display: 'Playfair Display Bold',
      typewriter: 'Special Elite Regular',
    },
    uiFonts: {
      display: '"Playfair Display", serif',
      body: '"Special Elite", serif',
    },
    colors: {
      background: '#f2eee2',
      residential: '#eae5d6',
      wood: '#dcd8c6',
      grass: '#e3dfcd',
      park: '#dedac7',
      sand: '#ece7d6',
      wetland: '#e0dcca',
      cemetery: '#e2decc',
      water: '#cdc9b8',
      waterLine: '#8f8b7c',
      aeroway: '#dfdaca',
      building: '#e0dbc9',
      buildingOutline: '#57534a',
      path: '#6e6a5f',
      minor: '#f7f4ea',
      minorCasing: '#8f8b7c',
      secondary: '#c9c4b2',
      secondaryCasing: '#57534a',
      primary: '#8f8b7c',
      primaryCasing: '#3a372f',
      motorway: '#3a372f',
      motorwayCasing: '#191713',
      rail: '#57534a',
      boundary: '#3a372f',
      text: '#1c1a15',
      textHalo: '#f2eee2',
      waterText: '#57534a',
      poi: '#2c2a24',
      poiText: '#3a372f',
    },
    boundaryDash: [5, 2, 1, 2],
    pathDash: [1.5, 1.5],
    uiVars: {
      '--bg': '#e7e2d2', '--panel': '#f2eee2', '--panel-edge': '#8f8b7c',
      '--ink': '#1c1a15', '--muted': '#6e6a5f', '--accent': '#8c1f1f',
      '--btn-bg': '#1c1a15', '--btn-ink': '#f2eee2', '--radius': '0px',
    },
    exportFrame: 'gazette',
  },
  {
    id: 'candy',
    name: 'Candy Pastel',
    blurb: 'Soft sorbet tones for a storybook town',
    fonts: {
      label: 'Quicksand Regular',
      italic: 'Quicksand Regular',
      display: 'Quicksand SemiBold',
    },
    uiFonts: {
      display: '"Quicksand", sans-serif',
      body: '"Quicksand", sans-serif',
    },
    colors: {
      background: '#fdf3ec',
      residential: '#faeae0',
      wood: '#cdeac6',
      grass: '#daf0d2',
      park: '#c8ecc4',
      sand: '#faeccb',
      wetland: '#d8eee0',
      cemetery: '#dfeed8',
      water: '#b5e3f2',
      waterLine: '#8ecbe0',
      aeroway: '#f3e2da',
      building: '#f4e0d4',
      buildingOutline: '#dcb9a6',
      path: '#d8a8b8',
      minor: '#ffffff',
      minorCasing: '#f0cfd9',
      secondary: '#fbd9e5',
      secondaryCasing: '#eab6c8',
      primary: '#f9b8ce',
      primaryCasing: '#e397b3',
      motorway: '#f78fb3',
      motorwayCasing: '#d9739a',
      rail: '#c8b8d8',
      boundary: '#c9a2d8',
      text: '#69525e',
      textHalo: '#fff8f4',
      waterText: '#5c93a8',
      poi: '#a878c2',
      poiText: '#8c6aa0',
    },
    boundaryDash: [3, 2],
    pathDash: [1, 1.5],
    uiVars: {
      '--bg': '#fbe9e2', '--panel': '#fff7f2', '--panel-edge': '#eec4cf',
      '--ink': '#69525e', '--muted': '#a88a96', '--accent': '#e0709c',
      '--btn-bg': '#e0709c', '--btn-ink': '#fff7f2', '--radius': '14px',
    },
    exportFrame: 'candy',
  },
];

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}
