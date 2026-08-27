/**
 * @file View-mode cycling: MAP -> SATELLITE -> 3D.
 *
 * The map-stack chip row names concrete SOURCES (OSM, Bing Aerial, HD Europe,
 * Google 3D...). That is the right control once you know the catalog, and the
 * wrong one when the question is simply "show me the normal map". This module
 * maps the three ways people actually think about looking at the world onto
 * whichever sources a given deployment happens to have.
 *
 * Resolution is deliberately preference-ORDERED rather than fixed: a keyless
 * install has no Bing and no Google, so SATELLITE must fall to the Sentinel-2
 * stack and 3D must fall to the best globe stack that still renders buildings.
 * A mode is only offered when something can actually serve it.
 *
 * @module viewModes
 */

/** @typedef {'map'|'satellite'|'3d'} ViewMode */

/** Cycle order. */
export const VIEW_MODES = Object.freeze(['map', 'satellite', '3d']);

/** Presentation for each mode. */
export const VIEW_MODE_META = Object.freeze({
  map: { label: 'MAP', icon: '🗺' },
  satellite: { label: 'SATELLITE', icon: '🛰' },
  '3d': { label: '3D', icon: '🏙' },
});

/**
 * Stack ids each mode will accept, best first.
 *
 * `3d` prefers Google's photogrammetric mesh, then any globe stack — on those,
 * buildings come from the ion OSM Buildings tileset the controller already
 * mounts, so "3D" is real there too rather than a relabelled 2D view.
 */
const MODE_PREFERENCES = Object.freeze({
  map: ['osm'],
  satellite: ['hd-europe', 'bing-aerial', 'satellite'],
  '3d': ['photoreal', 'hd-europe', 'bing-aerial', 'satellite'],
});

/**
 * Resolve the stack id a mode should activate for this deployment.
 * @param {ViewMode} mode - Requested view mode.
 * @param {Array<{id: string, available?: boolean}>} stacks - `getStacks()` output.
 * @returns {string|null} Stack id, or null when nothing can serve the mode.
 */
export function stackIdForViewMode(mode, stacks) {
  const preferences = MODE_PREFERENCES[mode];
  if (!preferences) return null;
  const byId = new Map((Array.isArray(stacks) ? stacks : []).map((s) => [s?.id, s]));
  for (const id of preferences) {
    const stack = byId.get(id);
    if (stack && stack.available !== false) return id;
  }
  return null;
}

/**
 * Which mode best describes the stack that is currently active.
 *
 * Used to seed the button from live controller state instead of assuming the
 * cycle owns the map — the chip row can change the stack behind its back.
 * @param {string} activeId - Currently active stack id.
 * @returns {ViewMode} The describing mode; defaults to 'satellite'.
 */
export function viewModeForStackId(activeId) {
  if (activeId === 'osm') return 'map';
  if (activeId === 'photoreal') return '3d';
  return 'satellite';
}

/**
 * Next mode in the cycle that this deployment can actually serve.
 *
 * Skipping unserviceable modes matters on keyless installs: a cycle that
 * stopped on a mode with no stack behind it would look broken (press, nothing
 * happens) rather than simply offering fewer modes.
 * @param {ViewMode} current - Mode the button is showing.
 * @param {Array<object>} stacks - `getStacks()` output.
 * @returns {ViewMode|null} Next serviceable mode, or null if none is.
 */
export function nextViewMode(current, stacks) {
  const start = VIEW_MODES.indexOf(current);
  const from = start < 0 ? 0 : start;
  for (let step = 1; step <= VIEW_MODES.length; step += 1) {
    const candidate = VIEW_MODES[(from + step) % VIEW_MODES.length];
    if (stackIdForViewMode(candidate, stacks)) return candidate;
  }
  return null;
}
