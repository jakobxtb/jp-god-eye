/**
 * @file Shared dark Leaflet map for the map-centric MONITOR views (WIRE and
 *       SITUATION), mirroring the world-monitor / monitor-the-situation layout.
 *
 * Keyless: CartoDB dark raster tiles over OpenStreetMap data. Event markers are
 * plain circle markers coloured by category and sized by magnitude — no plugin,
 * no clustering library, so it stays small and dependency-light.
 *
 * @module monitor/monitorMap
 */
import L from 'leaflet';

/** Category → colour, matching the reference dashboards' bubble palette. */
export const CATEGORY_COLOR = {
  quake: '#ffd21f',
  disaster: '#ff5a1f',
  fire: '#ff2d2d',
  flight: '#4aa8ff',
  vessel: '#63d6c0',
  news: '#8ab4ff',
};

/**
 * Create a full-bleed dark map inside `container`.
 * @param {HTMLElement} container - Element to mount the map in.
 * @param {object} [opts]
 * @returns {L.Map}
 */
export function createDarkMap(container, opts = {}) {
  const map = L.map(container, {
    center: opts.center || [30, 10],
    zoom: opts.zoom || 2,
    minZoom: 2,
    maxZoom: 16,
    worldCopyJump: true,
    attributionControl: true,
    zoomControl: true,
  });
  // Esri World Dark Gray Base — keyless, official, dark raster. Esri tile URLs
  // are {z}/{y}/{x} (row before column), unlike the XYZ {z}/{x}/{y} order.
  // CartoDB's dark tiles started demanding an API key, so this replaces them.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri · © OpenStreetMap contributors',
    maxZoom: 16,
  }).addTo(map);
  return map;
}

/**
 * Add a circle marker for one event.
 * @param {L.Map} map
 * @param {number} lat
 * @param {number} lon
 * @param {object} spec - { category, radius, label, html }
 * @returns {L.CircleMarker}
 */
export function addEventMarker(map, lat, lon, spec = {}) {
  const color = CATEGORY_COLOR[spec.category] || '#8ab4ff';
  const marker = L.circleMarker([lat, lon], {
    radius: spec.radius || 6,
    color,
    weight: 1,
    fillColor: color,
    fillOpacity: 0.45,
  });
  if (spec.html) marker.bindPopup(spec.html, { className: 'mon-popup' });
  else if (spec.label) marker.bindTooltip(spec.label);
  marker.addTo(map);
  return marker;
}

/** Remove every marker in a layer group, leaving the base tiles. */
export function clearLayer(group) {
  if (group) group.clearLayers();
}

export { L };
