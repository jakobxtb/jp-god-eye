import * as Cesium from 'cesium';
import { governorRequestRender } from './renderGovernor.js';

export const MAP_STACKS = [
  {
    id: 'photoreal',
    label: 'Google 3D',
    shortLabel: '3D',
    kind: 'photoreal',
    requiresIon: false,
    // Metered Google Map Tiles API. Off unless the operator explicitly supplies
    // GOOGLE_MAPS_API_KEY — nothing in the app defaults here (free-tier migration).
    requiresGoogle: true,
  },
  {
    id: 'satellite',
    label: 'Satellite',
    shortLabel: 'SAT',
    kind: 'satellite',
    requiresIon: false,
  },
  {
    id: 'bing-aerial',
    label: 'Bing Aerial',
    shortLabel: 'Aerial',
    kind: 'ion',
    style: Cesium.IonWorldImageryStyle.AERIAL,
    requiresIon: true,
  },
  {
    id: 'bing-labels',
    label: 'Bing Labels',
    shortLabel: 'Labels',
    kind: 'ion',
    style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
    requiresIon: true,
  },
  {
    id: 'hd-europe',
    label: 'HD Europe',
    shortLabel: 'HD',
    kind: 'hd-europe',
    requiresIon: false,
  },
  {
    id: 'osm',
    label: 'OSM',
    shortLabel: 'OSM',
    kind: 'osm',
    requiresIon: false,
  },
];

/**
 * Stack the app falls back to when the requested one can't be activated and no
 * Google tileset exists. Keyless by construction, so it is always available.
 * @const {string}
 */
export const DEFAULT_KEYLESS_STACK_ID = 'satellite';

const DEFAULT_OSM_CREDIT = '© OpenStreetMap contributors';

// Keyless global satellite imagery (primary). Sentinel-2 L2A cloudless mosaic,
// 10 m native resolution, served as RESTful WMTS by EOX. Verified live against
// the service's own WMTSCapabilities: TileMatrixSet `GoogleMapsCompatible`,
// format image/jpeg, matrix identifiers 0..21. Native resolution runs out around
// level 14, so MAX_LEVEL caps requests at 15 rather than fetching upsampled
// tiles the source cannot actually resolve.
//
// LICENSE: CC BY-NC-SA 4.0 — NonCommercial. The abstract-mandated attribution
// is registered as an on-globe Cesium credit below and in `dataCredits.js`.
// Commercial deployments must switch this stack to the public-domain NASA GIBS
// fallback (set GEV_KEYLESS_IMAGERY=gibs) or license the mosaic from EOX.
const EOX_S2CLOUDLESS_URL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/GoogleMapsCompatible/{TileMatrix}/{TileRow}/{TileCol}.jpg';
const EOX_S2CLOUDLESS_LAYER = 's2cloudless-2025_3857';
const EOX_S2CLOUDLESS_MAX_LEVEL = 15;
const EOX_S2CLOUDLESS_CREDIT = 'Sentinel-2 cloudless 2025 by <a href="https://cloudless.eox.at" target="_blank" rel="noopener noreferrer">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2025) — CC BY-NC-SA 4.0';

// Keyless global satellite imagery (secondary). NASA GIBS Blue Marble shaded
// relief + bathymetry: a STATIC layer (no Time dimension to go stale), U.S.
// public domain, no key, no usage restrictions. Coarse (level 8 ceiling,
// ~600 m/px) — it exists so that an EOX outage degrades to real, correctly
// licensed imagery instead of a blank globe, not as an equal substitute.
const GIBS_BLUEMARBLE_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/default/GoogleMapsCompatible_Level8/{TileMatrix}/{TileRow}/{TileCol}.jpeg';
const GIBS_BLUEMARBLE_LAYER = 'BlueMarble_ShadedRelief_Bathymetry';
const GIBS_BLUEMARBLE_MAX_LEVEL = 8;
const GIBS_CREDIT = 'Imagery courtesy of NASA EOSDIS GIBS (Blue Marble, public domain)';

// One cheap real request decides which keyless imagery source backs the
// `satellite` stack. Cesium's RESTful WMTS provider never fetches capabilities,
// so a dead upstream would otherwise surface as a silently blank globe rather
// than a fallback. The z0 tile is ~14 KB and the answer is cached for the
// session, so this costs one request per page load at most.
const IMAGERY_PROBE_TIMEOUT_MS = 6000;

// ── National orthophoto services ───────────────────────────────────────────
//
// The `hd-europe` stack is a STACK of imagery layers, not one provider: a
// global base (Bing where an ion token exists, else the Sentinel-2 mosaic)
// with each national orthophoto laid over it, clipped to that country's
// bounding rectangle. Cesium composites them top-down per tile, so a camera
// over Amsterdam draws 8 cm Dutch imagery while the same view's horizon keeps
// the global base — no seams, no per-country chip in the tray.
//
// Every entry below was verified live (HTTP 200, image/jpeg) with no API key.
// `rectangle` is [west, south, east, north] in DEGREES.
const HD_EUROPE_SOURCES = [
  {
    id: 'nl-pdok',
    // 8 cm — the sharpest public orthophoto in Europe.
    url: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{TileMatrix}/{TileCol}/{TileRow}.jpeg',
    layer: 'Actueel_orthoHR',
    tileMatrixSetID: 'EPSG:3857',
    maximumLevel: 19,
    rectangle: [3.2, 50.7, 7.3, 53.7],
    credit: 'Luchtfoto: <a href="https://www.pdok.nl" target="_blank" rel="noopener noreferrer">PDOK</a> / Kadaster (CC BY 4.0)',
  },
  {
    id: 'ch-swisstopo',
    // 25 cm SWISSIMAGE.
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{TileMatrix}/{TileCol}/{TileRow}.jpeg',
    layer: 'ch.swisstopo.swissimage',
    tileMatrixSetID: '3857',
    maximumLevel: 19,
    rectangle: [5.9, 45.8, 10.6, 47.9],
    credit: 'SWISSIMAGE © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener noreferrer">swisstopo</a>',
  },
  {
    id: 'fr-ign',
    // 20 cm BD ORTHO via the Géoplateforme (no key since the 2024 migration).
    url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={TileMatrix}&TILEROW={TileRow}&TILECOL={TileCol}',
    layer: 'ORTHOIMAGERY.ORTHOPHOTOS',
    tileMatrixSetID: 'PM',
    maximumLevel: 19,
    rectangle: [-5.3, 41.3, 9.7, 51.2],
    credit: 'Orthophotographies © <a href="https://www.ign.fr" target="_blank" rel="noopener noreferrer">IGN</a> — Géoplateforme',
  },
  {
    id: 'at-basemap',
    // 30 cm, Austria.
    url: 'https://maps.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{TileMatrix}/{TileRow}/{TileCol}.jpeg',
    layer: 'bmaporthofoto30cm',
    tileMatrixSetID: 'google3857',
    maximumLevel: 19,
    rectangle: [9.4, 46.3, 17.2, 49.1],
    credit: 'Orthofoto: <a href="https://basemap.at" target="_blank" rel="noopener noreferrer">basemap.at</a> — Datenquelle: Österreich, CC BY 4.0',
  },
  {
    id: 'es-pnoa',
    url: 'https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=OI.OrthoimageCoverage&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={TileMatrix}&TILEROW={TileRow}&TILECOL={TileCol}',
    layer: 'OI.OrthoimageCoverage',
    tileMatrixSetID: 'GoogleMapsCompatible',
    maximumLevel: 19,
    rectangle: [-9.6, 35.9, 4.4, 43.9],
    credit: 'PNOA © <a href="https://www.ign.es" target="_blank" rel="noopener noreferrer">Instituto Geográfico Nacional</a> de España',
  },
  {
    id: 'pl-geoportal',
    url: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTOFOTOMAPA&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=EPSG:3857&TILEMATRIX=EPSG:3857:{TileMatrix}&TILEROW={TileRow}&TILECOL={TileCol}',
    layer: 'ORTOFOTOMAPA',
    tileMatrixSetID: 'EPSG:3857',
    maximumLevel: 19,
    rectangle: [14.1, 49.0, 24.2, 54.9],
    credit: 'Ortofotomapa © <a href="https://www.geoportal.gov.pl" target="_blank" rel="noopener noreferrer">Geoportal</a> / GUGiK (Poland)',
  },
];

// Nationwide German aerial imagery has no keyless endpoint — the BKG service
// answers 403 without registration — so Germany is covered by the global base
// layer plus the one state service verified reachable without a key.
//
// Germany publishes no keyless NATIONWIDE aerial service — the federal BKG
// endpoint answers 403 without registration — so coverage is assembled from
// the state services that are reachable without a key. Each was verified live
// (HTTP 200, a real JPEG rather than a blank tile) and is clipped to its own
// state so it never paints over a neighbour it has no data for.
const HD_EUROPE_WMS_SOURCES = [
  {
    id: 'de-nrw',
    url: 'https://www.wms.nrw.de/geobasis/wms_nw_dop',
    layers: 'nw_dop_rgb',
    maximumLevel: 19,
    rectangle: [5.8, 50.3, 9.5, 52.6],
    credit: 'DOP © <a href="https://www.bezreg-koeln.nrw.de" target="_blank" rel="noopener noreferrer">Geobasis NRW</a> (dl-de/by-2-0)',
  },
  {
    id: 'de-by',
    url: 'https://geoservices.bayern.de/od/wms/dop/v1/dop40',
    layers: 'by_dop40c',
    maximumLevel: 19,
    rectangle: [8.9, 47.2, 13.9, 50.6],
    credit: 'DOP © <a href="https://geodaten.bayern.de" target="_blank" rel="noopener noreferrer">Bayerische Vermessungsverwaltung</a> (CC BY 4.0)',
  },
  {
    id: 'de-bw',
    url: 'https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C',
    layers: 'IMAGES_DOP_20_RGB',
    maximumLevel: 19,
    rectangle: [7.4, 47.4, 10.6, 49.8],
    credit: 'DOP © <a href="https://www.lgl-bw.de" target="_blank" rel="noopener noreferrer">LGL Baden-Württemberg</a> (dl-de/by-2-0)',
  },
  {
    id: 'de-ni',
    url: 'https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms',
    layers: 'ni_dop20',
    maximumLevel: 19,
    rectangle: [6.5, 51.2, 11.6, 53.9],
    credit: 'DOP © <a href="https://www.lgln.niedersachsen.de" target="_blank" rel="noopener noreferrer">LGLN Niedersachsen</a> (CC BY 4.0)',
  },
];

// basemap.de — the German federal raster MAP (not imagery). Backs the
// `map` view mode over Germany, where it is markedly more detailed and more
// current than the global OSM raster.
const BASEMAP_DE_URL = 'https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/DE_EPSG_3857_ADV/{TileMatrix}/{TileRow}/{TileCol}.png';

// Keyless global ellipsoidal terrain (Re:Earth Terrain / Mapterhorn, CC BY 4.0,
// EGM2008 geoid via NGA) — quantized-mesh 1.0, `ellipsoid` data-type. Fixes
// regime C (keyless globe stacks previously rendered a flat
// EllipsoidTerrainProvider — see the height-datum contract in docs/CURRENT-STATE.md
// §1a). Constructed via `.fromUrl()`, never a hand-built `{z}/{x}/{y}.terrain`
// URL (spec correction, spec §1a).
const REEARTH_TERRAIN_URL = 'https://terrain.reearth.land/cesium-mesh/ellipsoid';

/**
 * Controls the active globe/map stack. Google Photorealistic 3D Tiles remain
 * the cinematic default, while Cesium ion world imagery and OSM run as globe
 * imagery stacks.
 */
export class MapStackController {
  constructor(viewer, {
    googleTileset = null,
    cesiumToken = '',
    initialStack = 'photoreal',
    onChange = null,
    onError = null,
  } = {}) {
    this.viewer = viewer;
    this.googleTileset = googleTileset;
    this.cesiumToken = String(cesiumToken || '').trim();
    this._onChange = onChange;
    this._onError = onError;
    this._activeId = googleTileset ? initialStack : DEFAULT_KEYLESS_STACK_ID;
    this._imageryLayer = null;
    // Extra layers composited ABOVE the base one (the `hd-europe` national
    // orthophotos). Tracked separately so _removeImageryLayer tears down the
    // whole stack, never leaving a national layer orphaned over a new base.
    this._overlayImageryLayers = [];
    this._imageryProviders = new Map();
    // Cesium OSM Buildings (ion asset 96188): the free-tier stand-in for the
    // 3D massing Google Photorealistic 3D Tiles used to supply. Rendered on
    // every GLOBE stack when an ion token exists, hidden on the photoreal stack
    // (Google's mesh already contains its own buildings) — so it costs the
    // operator's ion streaming quota only while a globe stack is actually up.
    // `undefined` = never attempted; a Promise once construction has started;
    // resolves to null when ion has no token or the asset can't be loaded.
    this._osmBuildingsPromise = undefined;
    this._osmBuildings = null;
    // Resolved id of the keyless imagery source actually backing the
    // `satellite` stack ('eox' | 'gibs'), or null before the probe has run.
    this._keylessImagerySource = null;
    this._keylessImageryProbe = null;
    this._isSwitching = false;
    this._lastError = null;
    // Tracks which terrain PROVIDER is actually installed on the scene, not
    // just an ion-available boolean: 'world' (Cesium World Terrain, ion
    // token), 'keyless' (Re:Earth or its Ellipsoid fallback), or null (never
    // set yet — Cesium's own startup default). Using a tri-state here (rather
    // than the `enabled` boolean `_setWorldTerrainEnabled` receives) matters
    // because both the "never set" and "keyless" states pass `enabled=false`;
    // collapsing them to a boolean would make the first real keyless switch
    // a no-op against the initial `false` default and leave Cesium's built-in
    // provider in place instead of installing Re:Earth terrain.
    this._terrainMode = null;
    // Cache of the constructed keyless Re:Earth CesiumTerrainProvider, so
    // repeat switches into a keyless globe stack don't refetch `layer.json`.
    // Lives independently of `_switchGen` — construction is async and racy
    // switches are guarded where it's awaited (`_setWorldTerrainEnabled`).
    this._reearthTerrainProvider = null;
    // Monotonic switch counter. setStack() awaits network-bound provider
    // creation; a rapid A→B switch where A (e.g. slow Bing) resolves AFTER B
    // (fast OSM) would otherwise revert the user's last choice (M7). Each call
    // captures a generation and aborts its own commit once superseded.
    this._switchGen = 0;

    if (!this.getStack(this._activeId) || !this.isStackAvailable(this._activeId)) {
      this._activeId = googleTileset ? 'photoreal' : DEFAULT_KEYLESS_STACK_ID;
    }
  }

  getStacks() {
    return MAP_STACKS.map((stack) => {
      const available = this.isStackAvailable(stack.id);
      return {
        ...stack,
        available,
        // Why this stack can't be picked, from the ONE place that decides it.
        // A stack can be unavailable for reasons other than a missing ion
        // token (photoreal is unavailable when the Google tileset failed to
        // load), so callers must not infer the reason from `available` alone.
        unavailableReason: available ? null : this._unavailableReason(stack),
      };
    });
  }

  /**
   * Human-readable reason a stack can't be activated. Shared by `getStacks()`
   * and `setStack()` so the tooltip and the toast never drift apart.
   * @param {object} stack - Stack descriptor.
   * @returns {string}
   */
  _unavailableReason(stack) {
    if (stack?.requiresIon) return 'Cesium ion token required for Bing stacks';
    // Google Photorealistic 3D Tiles are metered and no longer part of the
    // default (free) configuration, so "unavailable" here is the ORDINARY
    // state, not a fault. Name the key rather than implying something broke.
    if (stack?.requiresGoogle) return 'Google Maps API key required for Google 3D Tiles';
    return `${stack?.label || 'This map stack'} is unavailable`;
  }

  getStack(id) {
    return MAP_STACKS.find((stack) => stack.id === id) || null;
  }

  getActiveId() {
    return this._activeId;
  }

  /**
   * Monotonic id of the most recently STARTED switch.
   *
   * A switch is only superseded by another `setStack()` — nothing else moves
   * this number — so a caller that must know whether the globe it is looking
   * at is still the one IT asked for can compare this across its own await.
   * Unchanged (or advanced by exactly its own call) means no newer switch has
   * claimed the globe.
   * @returns {number}
   */
  getSwitchGeneration() {
    return this._switchGen;
  }

  getActiveStack() {
    return this.getStack(this._activeId);
  }

  isStackAvailable(id) {
    const stack = this.getStack(id);
    if (!stack) return false;
    if (stack.kind === 'photoreal') return !!this.googleTileset;
    if (stack.requiresIon) return !!this.cesiumToken;
    return true;
  }

  /**
   * The stack this deployment should land on when nothing else is specified or
   * the requested stack can't be activated.
   *
   * Google stays the default ONLY when an operator-supplied key actually
   * produced a tileset; otherwise the keyless satellite stack owns the default,
   * which is what makes a zero-key install boot to a real globe.
   * @returns {string}
   */
  /**
   * The stack this deployment boots into. Public so the bootstrap asks the
   * controller rather than re-deriving the rule and drifting from it.
   * @returns {string}
   */
  getDefaultStackId() {
    return this._defaultStackId();
  }

  _defaultStackId() {
    if (this.googleTileset) return 'photoreal';
    // An ion token unlocks Bing aerial, whose native resolution is sub-metre
    // where the keyless Sentinel-2 mosaic tops out around 10 m. At the street
    // and building scale this app spends most of its time in, that difference
    // IS the difference between a sharp image and a soft one, so a configured
    // token gets the sharper default. The keyless stack stays the default when
    // there is no token, and remains one click away either way.
    if (this.cesiumToken) return 'bing-aerial';
    return DEFAULT_KEYLESS_STACK_ID;
  }

  async setStack(id, { silent = false } = {}) {
    // An unknown id resolves to whatever this deployment can actually show —
    // `photoreal` only when a Google key produced a tileset, otherwise the
    // keyless default. Hardcoding 'photoreal' here used to strand keyless
    // deployments on a stack they can never activate.
    const stack = this.getStack(id) || this.getStack(this._defaultStackId());
    if (!stack) return null;

    if (!this.isStackAvailable(stack.id)) {
      const message = this._unavailableReason(stack);
      this._lastError = message;
      this._onError?.(message, stack);
      // Restoring a share link authored on a keyed machine must not leave the
      // globe blank on a keyless one: fall through to the default stack (once —
      // the default is keyless and therefore always available) instead of
      // returning with nothing activated.
      const fallbackId = this._defaultStackId();
      if (fallbackId !== stack.id && this.isStackAvailable(fallbackId)) {
        return this.setStack(fallbackId, { silent });
      }
      return this.getState();
    }

    const gen = ++this._switchGen;
    this._isSwitching = true;
    this._lastError = null;
    if (!silent) this._emitChange('switching');

    try {
      if (stack.kind === 'photoreal') {
        await this._activatePhotoreal(gen);
      } else {
        await this._activateGlobeStack(stack, gen);
      }
      // A newer switch started while we were awaiting the provider — that call
      // owns the final state now, so don't commit ours or emit a stale 'ready'.
      if (gen !== this._switchGen) return this.getState();
      this._activeId = stack.id;
      // Show/hide of tilesets + imagery swaps need a frame in idle mode;
      // subsequent tile loads self-request via Cesium. (perf wave 2)
      governorRequestRender('map-stack');
      if (!silent) this._emitChange('ready');
    } catch (error) {
      if (gen !== this._switchGen) return this.getState();
      const message = error?.message || String(error);
      this._lastError = message;
      this._onError?.(message, stack);
      if (this.googleTileset) {
        await this._activatePhotoreal(gen);
        if (gen !== this._switchGen) return this.getState();
        this._activeId = 'photoreal';
      } else if (stack.id !== 'osm') {
        // Keyless deployments have no photoreal globe to fall back onto. OSM
        // raster is the one stack with no upstream that can be misconfigured
        // (no token, no capabilities, no probe), so it is the recovery of last
        // resort — a degraded globe beats no globe. A failure recovering from
        // the failure is swallowed: `_lastError` already names the real cause
        // and the 'error' emission below still reaches the UI.
        try {
          await this._activateGlobeStack(this.getStack('osm'), gen);
          if (gen !== this._switchGen) return this.getState();
          this._activeId = 'osm';
        } catch { /* keep the original error; nothing better to offer */ }
      }
      if (!silent) this._emitChange('error');
    } finally {
      // Only the latest switch clears the switching flag; a superseded call
      // must not stomp a newer switch that is still in progress.
      if (gen === this._switchGen) this._isSwitching = false;
    }

    return this.getState();
  }

  getState(status = this._isSwitching ? 'switching' : 'ready') {
    return {
      activeId: this._activeId,
      activeStack: this.getActiveStack(),
      stacks: this.getStacks(),
      status,
      lastError: this._lastError,
      hasCesiumIonToken: !!this.cesiumToken,
      // Which keyless imagery source actually backs the `satellite` stack
      // ('eox' | 'gibs'), or null before the probe resolves. Surfaced so the
      // credit line and QA can report the REAL source rather than the intended
      // one after a fallback.
      keylessImagerySource: this._keylessImagerySource,
      // True once Cesium OSM Buildings are loaded and shown — the free-tier
      // stand-in for Google's photogrammetric massing.
      osmBuildingsActive: !!(this._osmBuildings && this._osmBuildings.show),
    };
  }

  async _activatePhotoreal(gen) {
    this._removeImageryLayer();
    if (this.googleTileset) this.googleTileset.show = true;
    this.viewer.scene.globe.show = false;
    // Terrain is left UNTOUCHED here. The photoreal globe is hidden
    // (`globe.show = false`), so the terrain provider is inert — it renders and
    // streams nothing. Routing this through `_setWorldTerrainEnabled(false)`
    // would make the DEFAULT startup stack await a keyless Re:Earth `layer.json`
    // fetch it can't use, delaying photoreal boot on a slow/blocked network and
    // (on failure) caching the flat `EllipsoidTerrainProvider` fallback for
    // later OSM switches. The Re:Earth fetch is therefore lazy: it happens on
    // the first switch to an actual globe stack (`_activateGlobeStack`).
    // `_terrainMode` is intentionally not changed — every globe-stack transition
    // re-derives the correct provider from it (null/'world'/'keyless'), so
    // leaving it as-is keeps the next switch correct without a photoreal fetch.
    //
    // OSM Buildings are hidden rather than left up: Google's photogrammetric
    // mesh already contains real building geometry, so keeping the extruded
    // OSM volumes on would double-draw every city AND keep burning the
    // operator's ion streaming quota behind an opaque mesh. Hiding never
    // awaits (the `visible=false` branch is synchronous when nothing was ever
    // constructed), so photoreal boot stays free of ion work.
    void this._setOsmBuildingsVisible(false, gen);
  }

  async _activateGlobeStack(stack, gen) {
    const provider = await this._getImageryProvider(stack);
    // A newer switch started while the provider was resolving — don't touch the
    // scene's imagery layers, the winning switch already owns them (M7).
    if (gen != null && gen !== this._switchGen) return;
    this._removeImageryLayer();

    this._imageryLayer = new Cesium.ImageryLayer(provider);
    this.viewer.imageryLayers.add(this._imageryLayer, 0);

    // HD Europe composites the national orthophotos on top of that base.
    if (stack.kind === 'hd-europe') {
      this._overlayImageryLayers = this._buildHdEuropeOverlays();
      for (const layer of this._overlayImageryLayers) {
        this.viewer.imageryLayers.add(layer);
      }
    }

    if (this.googleTileset) this.googleTileset.show = false;
    this.viewer.scene.globe.show = true;
    await this._setWorldTerrainEnabled(!!this.cesiumToken, gen);
    // Buildings ride on top of whichever globe stack is up (satellite, Bing, or
    // OSM) — they are 3D massing, not imagery, so they are not part of the
    // stack identity. Keyless deployments skip this entirely.
    await this._setOsmBuildingsVisible(true, gen);
  }

  async _getImageryProvider(stack) {
    if (this._imageryProviders.has(stack.id)) {
      return this._imageryProviders.get(stack.id);
    }

    // HD Europe's BASE is whatever global imagery this deployment has: Bing
    // sub-metre when an ion token exists, otherwise the keyless Sentinel-2
    // mosaic. The national overlays supply the detail on top of it.
    if (stack.kind === 'hd-europe') {
      const base = this.cesiumToken
        ? await Cesium.createWorldImageryAsync({ style: Cesium.IonWorldImageryStyle.AERIAL })
        : await this._createKeylessSatelliteProvider();
      this._imageryProviders.set(stack.id, base);
      return base;
    }

    let provider;
    if (stack.kind === 'ion') {
      provider = await Cesium.createWorldImageryAsync({ style: stack.style });
    } else if (stack.kind === 'satellite') {
      provider = await this._createKeylessSatelliteProvider();
    } else if (stack.kind === 'osm') {
      provider = new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
        credit: DEFAULT_OSM_CREDIT,
      });
    } else {
      throw new Error(`Unsupported map stack: ${stack.id}`);
    }

    this._imageryProviders.set(stack.id, provider);
    return provider;
  }

  _removeImageryLayer() {
    for (const layer of this._overlayImageryLayers) {
      this.viewer.imageryLayers.remove(layer, false);
    }
    this._overlayImageryLayers = [];
    if (!this._imageryLayer) return;
    this.viewer.imageryLayers.remove(this._imageryLayer, false);
    this._imageryLayer = null;
  }

  /**
   * Build the national-orthophoto overlay set for the `hd-europe` stack.
   *
   * Each layer is clipped to its country rectangle, so outside that country it
   * costs nothing and the base layer shows through. Providers are cached in
   * `_imageryProviders` under their source id, keyed separately from stacks.
   * @returns {Array<Cesium.ImageryLayer>} Layers in draw order (bottom first).
   */
  _buildHdEuropeOverlays() {
    const layers = [];
    const rect = (r) => Cesium.Rectangle.fromDegrees(r[0], r[1], r[2], r[3]);

    for (const src of HD_EUROPE_SOURCES) {
      try {
        let provider = this._imageryProviders.get(`hd:${src.id}`);
        if (!provider) {
          provider = new Cesium.WebMapTileServiceImageryProvider({
            url: src.url,
            layer: src.layer,
            style: 'default',
            format: 'image/jpeg',
            tileMatrixSetID: src.tileMatrixSetID,
            maximumLevel: src.maximumLevel,
            rectangle: rect(src.rectangle),
            credit: new Cesium.Credit(src.credit, false),
          });
          this._imageryProviders.set(`hd:${src.id}`, provider);
        }
        layers.push(new Cesium.ImageryLayer(provider, { rectangle: rect(src.rectangle) }));
      } catch (error) {
        // One unreachable national service must not take the whole stack down;
        // that country simply falls through to the global base layer.
        console.warn(`[mapStackController] HD source ${src.id} unavailable:`, error?.message || error);
      }
    }

    for (const src of HD_EUROPE_WMS_SOURCES) {
      try {
        let provider = this._imageryProviders.get(`hd:${src.id}`);
        if (!provider) {
          provider = new Cesium.WebMapServiceImageryProvider({
            url: src.url,
            layers: src.layers,
            parameters: { format: 'image/jpeg', transparent: false, version: '1.3.0' },
            maximumLevel: src.maximumLevel,
            rectangle: rect(src.rectangle),
            credit: new Cesium.Credit(src.credit, false),
          });
          this._imageryProviders.set(`hd:${src.id}`, provider);
        }
        layers.push(new Cesium.ImageryLayer(provider, { rectangle: rect(src.rectangle) }));
      } catch (error) {
        console.warn(`[mapStackController] HD WMS source ${src.id} unavailable:`, error?.message || error);
      }
    }
    return layers;
  }

  /**
   * Builds the keyless satellite imagery provider, choosing between the EOX
   * Sentinel-2 cloudless mosaic (primary, 10 m) and NASA GIBS Blue Marble
   * (secondary, public domain, coarse) from ONE real probe request.
   *
   * Cesium's RESTful WMTS provider constructs without touching the network, so
   * without this probe a dead or blocked upstream would present as a silently
   * black globe rather than a fallback. The probe result is cached for the
   * session; a probe that itself fails resolves to GIBS rather than throwing,
   * because a coarse real basemap is a better answer than no basemap.
   * @returns {Promise<Cesium.ImageryProvider>}
   */
  async _createKeylessSatelliteProvider() {
    const source = await this._resolveKeylessImagerySource();
    if (source === 'gibs') {
      return new Cesium.WebMapTileServiceImageryProvider({
        url: GIBS_BLUEMARBLE_URL,
        layer: GIBS_BLUEMARBLE_LAYER,
        style: 'default',
        format: 'image/jpeg',
        tileMatrixSetID: 'GoogleMapsCompatible_Level8',
        maximumLevel: GIBS_BLUEMARBLE_MAX_LEVEL,
        credit: new Cesium.Credit(GIBS_CREDIT, false),
      });
    }
    return new Cesium.WebMapTileServiceImageryProvider({
      url: EOX_S2CLOUDLESS_URL,
      layer: EOX_S2CLOUDLESS_LAYER,
      style: 'default',
      format: 'image/jpeg',
      tileMatrixSetID: 'GoogleMapsCompatible',
      maximumLevel: EOX_S2CLOUDLESS_MAX_LEVEL,
      credit: new Cesium.Credit(EOX_S2CLOUDLESS_CREDIT, false),
    });
  }

  /**
   * Resolves (once per session) which keyless imagery source is actually
   * reachable. Never throws and never rejects.
   * @returns {Promise<'eox'|'gibs'>}
   */
  _resolveKeylessImagerySource() {
    if (this._keylessImagerySource) return Promise.resolve(this._keylessImagerySource);
    if (this._keylessImageryProbe) return this._keylessImageryProbe;

    // An explicit operator choice is honoured without a probe. This is the
    // supported commercial path: the default Sentinel-2 mosaic is CC BY-NC-SA
    // (NonCommercial), so a commercial deployment pins the public-domain NASA
    // GIBS source instead of relying on a licence it cannot use.
    const forced = String(import.meta.env.GEV_KEYLESS_IMAGERY || '').trim().toLowerCase();
    if (forced === 'gibs' || forced === 'eox') {
      this._keylessImagerySource = forced;
      return Promise.resolve(forced);
    }

    const probeUrl = EOX_S2CLOUDLESS_URL
      .replace('{TileMatrix}', '0')
      .replace('{TileRow}', '0')
      .replace('{TileCol}', '0');

    this._keylessImageryProbe = (async () => {
      let source = 'gibs';
      try {
        const response = await fetch(probeUrl, {
          method: 'GET',
          cache: 'force-cache',
          signal: AbortSignal.timeout(IMAGERY_PROBE_TIMEOUT_MS),
        });
        // A 200 that isn't an image means an error page or a captive portal —
        // treat it as unreachable rather than wiring it to the globe.
        if (response.ok && (response.headers.get('content-type') || '').startsWith('image/')) {
          source = 'eox';
        }
      } catch {
        source = 'gibs';
      }
      if (source === 'gibs') {
        console.warn('[mapStackController] Sentinel-2 cloudless unreachable — falling back to NASA GIBS Blue Marble imagery.');
      }
      this._keylessImagerySource = source;
      return source;
    })();

    return this._keylessImageryProbe;
  }

  /**
   * Shows or hides Cesium OSM Buildings, the free-tier replacement for the 3D
   * massing that Google Photorealistic 3D Tiles used to carry.
   *
   * No-op without an ion token (the asset is ion-hosted), and no-op on the
   * photoreal stack, whose mesh already contains buildings. Construction is
   * lazy and attempted at most once: an ion account that lacks access to the
   * asset, or an offline start, must not re-request it on every stack switch.
   * @param {boolean} visible
   * @param {number} [gen] - Switch generation this call belongs to.
   * @returns {Promise<void>}
   */
  async _setOsmBuildingsVisible(visible, gen) {
    if (!visible) {
      if (this._osmBuildings) this._osmBuildings.show = false;
      return;
    }
    if (!this.cesiumToken) return;

    if (this._osmBuildingsPromise === undefined) {
      this._osmBuildingsPromise = (async () => {
        try {
          const tileset = await Cesium.createOsmBuildingsAsync();
          // Cesium's default (16) lets building tiles stay coarse well after
          // they fill the screen, which reads as soft, low-poly massing at
          // city scale. 8 roughly halves the error budget — visibly crisper
          // silhouettes at the zoom levels this app actually flies at, without
          // dropping to the per-building cost of a value near 1.
          tileset.maximumScreenSpaceError = 8;
          this.viewer.scene.primitives.add(tileset);
          tileset.show = false;
          return tileset;
        } catch (error) {
          console.warn('[mapStackController] Cesium OSM Buildings unavailable:', error?.message || error);
          return null;
        }
      })();
    }

    const tileset = await this._osmBuildingsPromise;
    // A newer switch started while the tileset was loading — that call owns
    // building visibility now (same M7 guard as imagery and terrain).
    if (gen != null && gen !== this._switchGen) return;
    this._osmBuildings = tileset;
    if (tileset) {
      tileset.show = true;
      governorRequestRender('map-stack-buildings');
    }
  }

  /**
   * Sets the scene's terrain provider for the current globe stack.
   *
   * `enabled` selects Cesium World Terrain (ion token present — regime B,
   * unchanged). Disabled/keyless (regime C: OSM or any globe stack without an
   * ion token) now tries the keyless Re:Earth ellipsoidal terrain instead of
   * the flat `EllipsoidTerrainProvider`, falling back to the flat provider
   * (today's behavior) if construction fails — no worse than before this fix.
   *
   * `CesiumTerrainProvider.fromUrl()` is async (fetches `layer.json`), so this
   * method is async-safe: `gen` is the caller's switch generation (from
   * `setStack`'s `_switchGen`, threaded through `_activatePhotoreal` /
   * `_activateGlobeStack`, mirroring the M7 pattern in `_activateGlobeStack`
   * for imagery providers). If a newer switch starts while the Re:Earth
   * fetch is in flight, this call's result is discarded instead of
   * clobbering the newer switch's terrain.
   * @param {boolean} enabled
   * @param {number} [gen] — switch generation this call belongs to
   */
  async _setWorldTerrainEnabled(enabled, gen) {
    const targetMode = enabled ? 'world' : 'keyless';
    if (targetMode === this._terrainMode) return;
    if (enabled) {
      this.viewer.scene.setTerrain(Cesium.Terrain.fromWorldTerrain({
        requestVertexNormals: true,
      }));
    } else {
      const provider = await this._getKeylessTerrainProvider();
      // A newer switch started while the Re:Earth layer.json fetch was in
      // flight — that call owns terrain now; don't stomp it (M7 pattern).
      if (gen != null && gen !== this._switchGen) return;
      this.viewer.terrainProvider = provider;
    }
    this._terrainMode = targetMode;
  }

  /**
   * Resolves (and caches) the keyless terrain provider for globe stacks
   * without an ion token: Re:Earth ellipsoidal quantized-mesh terrain, or
   * `EllipsoidTerrainProvider` (flat — current/prior behavior) if the
   * Re:Earth endpoint can't be constructed. Never throws.
   * @returns {Promise<Cesium.TerrainProvider>}
   */
  async _getKeylessTerrainProvider() {
    if (this._reearthTerrainProvider) return this._reearthTerrainProvider;
    try {
      this._reearthTerrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(REEARTH_TERRAIN_URL);
    } catch (error) {
      console.warn('[mapStackController] Re:Earth terrain unavailable, falling back to flat ellipsoid terrain:', error);
      this._reearthTerrainProvider = new Cesium.EllipsoidTerrainProvider();
    }
    return this._reearthTerrainProvider;
  }

  _emitChange(status) {
    this._onChange?.(this.getState(status));
  }
}
