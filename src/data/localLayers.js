import { createLocalGeoJsonLayer } from './localGeojson.js';
import { createFirmsHeatmapLayer } from './firmsHeatmap.js';
import submarineCablesLayer from './telegeographySubmarineCables.js';

// Use Vite's ?url import to properly resolve these assets in dev and build
import datacentersUrl from './local_data/datacenters/datacenters.geojsonl?url';
import damsUrl from './local_data/dams/dams.geojsonl?url';

/**
 * Registry of local GeoJSON datasets.
 * These are lazily loaded natively into Cesium when enabled.
 */
const datacenters = createLocalGeoJsonLayer({
  id: 'local-datacenters',
  url: datacentersUrl,
  name: 'Datacenters',
  color: '#00ffff', // Cyan
  icon: '▣',
  source: 'Local',
  labels: true,
  labelMax: 700,
  labelGridPx: 138,
});

const dams = createLocalGeoJsonLayer({
  id: 'local-dams',
  url: damsUrl,
  name: 'Dams',
  color: '#0088ff', // Blue
  icon: '▰',
  source: 'USACE',
  labels: true,
  labelMax: 900,
  labelGridPx: 132,
});

// ── Europe-first situational layers ────────────────────────────────────────
// All five ride the same GeoJSON renderer as the bundled datasets; only the
// URL differs (a live /api/situation feed instead of a bundled file), so they
// inherit its grounding, labelling, clustering and unavailable-state handling
// for free.

const euQuakes = createLocalGeoJsonLayer({
  id: 'local-emsc-quakes',
  url: '/api/situation/emsc',
  name: 'EU Seismic',
  color: '#ff5533',
  icon: '◈',
  source: 'EMSC',
  labels: true,
  labelMax: 400,
  labelGridPx: 130,
});

const disasters = createLocalGeoJsonLayer({
  id: 'local-gdacs',
  url: '/api/situation/gdacs',
  name: 'Disaster Alerts',
  color: '#ffaa00',
  icon: '⚠',
  source: 'GDACS',
  labels: true,
  labelMax: 200,
  labelGridPx: 150,
});

const autobahn = createLocalGeoJsonLayer({
  id: 'local-autobahn',
  url: '/api/situation/autobahn',
  name: 'Autobahn DE',
  color: '#ffdd44',
  icon: '⌁',
  source: 'Autobahn GmbH',
  labels: true,
  labelMax: 300,
  labelGridPx: 128,
});

const aurora = createLocalGeoJsonLayer({
  id: 'local-aurora',
  url: '/api/situation/aurora',
  name: 'Aurora',
  color: '#66ffcc',
  icon: '✳',
  source: 'NOAA SWPC',
  labels: false,
  labelMax: 0,
  labelGridPx: 200,
});

const airQuality = createLocalGeoJsonLayer({
  id: 'local-air-quality',
  url: '/api/situation/air-quality',
  name: 'Air Quality',
  color: '#88ff88',
  icon: '◉',
  source: 'Open-Meteo',
  labels: true,
  labelMax: 220,
  labelGridPx: 140,
});

// Live NASA FIRMS fires (VIIRS ×3 NRT via the /api/firms proxy). The id keeps
// the historical `local-` prefix for persistence + voice-tool-enum compat,
// but the data is NOT bundled anymore — it needs FIRMS_MAP_KEY server-side.
const fires = createFirmsHeatmapLayer({
  id: 'local-firms',
  name: 'FIRMS Active Fires',
  icon: '▲',
  source: 'NASA FIRMS · LIVE',
});

export default [
  datacenters,
  dams,
  submarineCablesLayer,
  fires,
  // Europe-first situational feeds (see the block above).
  euQuakes,
  disasters,
  autobahn,
  aurora,
  airQuality,
];
