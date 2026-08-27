/**
 * @file Hazard Simulation layer — draws modelled disaster footprints on the globe.
 *
 * Pairs the pure maths in `data/hazardModel.js` with Cesium primitives. The
 * split matters: every number shown here comes from a tested, sourced relation,
 * and this file only decides how to paint it.
 *
 * Scope, stated plainly: these are ORDER-OF-MAGNITUDE planning footprints for
 * natural hazards. They ignore soil response, topography, fuel moisture and
 * bathymetry, so every readout is labelled MODEL ESTIMATE in the panel.
 *
 * @module hazardSimulation
 */
import * as Cesium from 'cesium';
import {
  earthquakeContours,
  fireSpreadEllipse,
  tsunamiTravelMinutes,
  intensityLabel,
} from './data/hazardModel.js';
import { governorRequestRender } from './renderGovernor.js';

/** Ring colours by Modified Mercalli intensity — cool (weak) to hot (violent). */
const INTENSITY_COLORS = {
  9: '#ff2d2d', 8: '#ff6a1f', 7: '#ffa41b', 6: '#ffd21f',
  5: '#c8e64a', 4: '#63d6c0', 3: '#4aa8ff',
};

/**
 * Owns the simulation overlay: one scenario at a time, fully torn down before
 * the next is drawn so scenarios can never visually accumulate.
 */
export class HazardSimulation {
  /**
   * @param {Cesium.Viewer} viewer - Viewer to draw into.
   */
  constructor(viewer) {
    this.viewer = viewer;
    /** @type {Cesium.CustomDataSource|null} */
    this._dataSource = null;
    /** @type {{lat: number, lon: number}|null} */
    this.origin = null;
    /** @type {object|null} Last computed readout, for the panel. */
    this.lastResult = null;
  }

  /** Lazily create (and register) the overlay data source. */
  _ensureDataSource() {
    if (this._dataSource) return this._dataSource;
    this._dataSource = new Cesium.CustomDataSource('hazard-simulation');
    this.viewer.dataSources.add(this._dataSource);
    return this._dataSource;
  }

  /**
   * Remove every drawn entity. Called before each run so a new scenario
   * replaces the previous one rather than stacking on top of it.
   * @returns {void}
   */
  clear() {
    this._dataSource?.entities.removeAll();
    this.lastResult = null;
    governorRequestRender('hazard-sim');
  }

  /** Tear the overlay down completely. */
  destroy() {
    if (!this._dataSource) return;
    this.viewer.dataSources.remove(this._dataSource, true);
    this._dataSource = null;
    this.lastResult = null;
  }

  /**
   * Set the scenario origin.
   * @param {number} lat - Latitude in degrees.
   * @param {number} lon - Longitude in degrees.
   * @returns {void}
   */
  setOrigin(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    this.origin = { lat, lon };
  }

  /**
   * Run a scenario and draw it.
   * @param {string} kind - 'earthquake' | 'wildfire' | 'tsunami'.
   * @param {object} params - Scenario parameters from the panel.
   * @returns {object|null} Readout for the panel, or null without an origin.
   */
  run(kind, params) {
    if (!this.origin) return null;
    this.clear();
    if (kind === 'earthquake') return this._runEarthquake(params);
    if (kind === 'wildfire') return this._runWildfire(params);
    if (kind === 'tsunami') return this._runTsunami(params);
    return null;
  }

  /** Draw MMI contour rings. */
  _runEarthquake({ magnitude, depthKm }) {
    const ds = this._ensureDataSource();
    const { lat, lon } = this.origin;
    const rings = earthquakeContours({ magnitude, depthKm });

    // Paint outward-in so stronger (smaller) rings land on top of weaker ones.
    for (const ring of [...rings].reverse()) {
      const color = Cesium.Color.fromCssColorString(INTENSITY_COLORS[ring.intensity] || '#4aa8ff');
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        ellipse: {
          semiMajorAxis: ring.radiusKm * 1000,
          semiMinorAxis: ring.radiusKm * 1000,
          material: color.withAlpha(0.10),
          outline: true,
          outlineColor: color.withAlpha(0.85),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
    }

    ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: { pixelSize: 10, color: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
      label: {
        text: `M${Number(magnitude).toFixed(1)} · ${depthKm} km deep`,
        font: '12px monospace',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.65),
        pixelOffset: new Cesium.Cartesian2(0, -22),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    governorRequestRender('hazard-sim');
    this.lastResult = {
      kind: 'earthquake',
      rings: rings.map((r) => ({ ...r })),
      summary: rings.length
        ? `${rings.length} intensity contours · felt to ${Math.round(rings[rings.length - 1].radiusKm)} km`
        : 'Too small to produce a mapped contour',
    };
    return this.lastResult;
  }

  /** Draw the wind-driven fire ellipse. */
  _runWildfire({ rateOfSpreadMPerMin, windSpeedKmh, windDirectionDeg, durationMin }) {
    const ds = this._ensureDataSource();
    const { lat, lon } = this.origin;
    const shape = fireSpreadEllipse({ rateOfSpreadMPerMin, windSpeedKmh, durationMin });

    if (shape.lengthKm > 0) {
      // The ellipse centre sits half a run downwind of the ignition point: the
      // fire spreads FROM the origin, it is not centred on it.
      const bearing = ((Number(windDirectionDeg) || 0) * Math.PI) / 180;
      const halfRunM = (shape.lengthKm * 1000) / 2;
      const centre = Cesium.Cartesian3.fromDegrees(lon, lat);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(centre);
      const offset = Cesium.Matrix4.multiplyByPoint(
        enu,
        new Cesium.Cartesian3(Math.sin(bearing) * halfRunM, Math.cos(bearing) * halfRunM, 0),
        new Cesium.Cartesian3(),
      );

      ds.entities.add({
        position: offset,
        ellipse: {
          semiMajorAxis: halfRunM,
          semiMinorAxis: Math.max(1, (shape.widthKm * 1000) / 2),
          // Cesium rotates from north, clockwise-negative.
          rotation: Cesium.Math.toRadians(-(Number(windDirectionDeg) || 0)),
          material: Cesium.Color.fromCssColorString('#ff5a1f').withAlpha(0.22),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#ff8a3d'),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
    }

    ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: { pixelSize: 9, color: Cesium.Color.ORANGERED, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
      label: {
        text: `Ignition · ${durationMin} min`,
        font: '12px monospace',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.65),
        pixelOffset: new Cesium.Cartesian2(0, -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    governorRequestRender('hazard-sim');
    this.lastResult = {
      kind: 'wildfire',
      ...shape,
      summary: `${shape.lengthKm.toFixed(1)} km run · ${shape.areaKm2.toFixed(1)} km² · L/B ${shape.lengthToBreadth.toFixed(1)}`,
    };
    return this.lastResult;
  }

  /** Draw tsunami travel-time isochrones. */
  _runTsunami({ depthM }) {
    const ds = this._ensureDataSource();
    const { lat, lon } = this.origin;
    const isochrones = [];

    for (const minutes of [15, 30, 60, 120, 240]) {
      // Invert c = sqrt(g*d): distance the wave covers in `minutes`.
      const celerityMs = Math.sqrt(9.81 * Math.max(1, depthM));
      const distanceKm = (celerityMs * minutes * 60) / 1000;
      isochrones.push({ minutes, distanceKm });
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        ellipse: {
          semiMajorAxis: distanceKm * 1000,
          semiMinorAxis: distanceKm * 1000,
          material: Cesium.Color.TRANSPARENT,
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#4ad4ff').withAlpha(0.8),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
    }

    ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: { pixelSize: 10, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
      label: {
        text: `Source · ${depthM} m water`,
        font: '12px monospace',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.65),
        pixelOffset: new Cesium.Cartesian2(0, -22),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    governorRequestRender('hazard-sim');
    const oneThousand = tsunamiTravelMinutes(1000, depthM);
    this.lastResult = {
      kind: 'tsunami',
      isochrones,
      summary: oneThousand
        ? `${Math.sqrt(9.81 * depthM).toFixed(0)} m/s · 1000 km in ${Math.round(oneThousand)} min`
        : 'Invalid depth',
    };
    return this.lastResult;
  }
}
