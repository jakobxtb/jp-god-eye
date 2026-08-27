/**
 * @file Hazard footprint modelling — the maths behind the Simulation tab.
 *
 * Every model here is a published empirical relation, not an invention, and
 * each function names its source. They are deliberately pure and Cesium-free
 * so they can be unit-tested directly and reused by any renderer.
 *
 * These are ORDER-OF-MAGNITUDE planning tools. Real shaking, real fire spread
 * and real inundation depend on soil, topography, fuel moisture and structures
 * that a closed-form radius cannot represent. The UI labels every output as a
 * model estimate for exactly that reason.
 *
 * @module data/hazardModel
 */

/** Mean Earth radius in kilometres. */
const EARTH_RADIUS_KM = 6371;

/**
 * Modified Mercalli intensity at a distance from an earthquake epicentre.
 *
 * Uses the Bakun & Wentworth (1997) style intensity–attenuation form, in the
 * shape widely used for California-calibrated ShakeMap comparisons:
 *
 *   I = 1.41 + 1.68·M − 1.46·ln(D)
 *
 * where D is hypocentral distance in km. The logarithm is why intensity falls
 * off fast near the source and slowly far away.
 *
 * @param {number} magnitude - Moment magnitude.
 * @param {number} distanceKm - Epicentral distance in km.
 * @param {number} [depthKm=10] - Focal depth in km.
 * @returns {number} Modified Mercalli intensity, clamped to the I–XII scale.
 */
export function shakingIntensity(magnitude, distanceKm, depthKm = 10) {
  if (!Number.isFinite(magnitude) || !Number.isFinite(distanceKm)) return NaN;
  // Hypocentral, not epicentral: directly above a deep quake the ground is
  // still `depthKm` away from the rupture, and ignoring that makes the
  // near-field intensity diverge as distance approaches zero.
  const hypocentral = Math.sqrt(distanceKm * distanceKm + depthKm * depthKm);
  const intensity = 1.41 + 1.68 * magnitude - 1.46 * Math.log(Math.max(1, hypocentral));
  return Math.max(1, Math.min(12, intensity));
}

/**
 * Distance at which shaking drops to a given intensity — the inverse of
 * `shakingIntensity`, used to draw one contour ring.
 *
 * @param {number} magnitude - Moment magnitude.
 * @param {number} intensity - Target Modified Mercalli intensity.
 * @param {number} [depthKm=10] - Focal depth in km.
 * @returns {number|null} Epicentral radius in km, or null when the quake never
 *   reaches that intensity anywhere (including directly above the hypocentre).
 */
export function radiusForIntensity(magnitude, intensity, depthKm = 10) {
  if (!Number.isFinite(magnitude) || !Number.isFinite(intensity)) return null;
  const hypocentral = Math.exp((1.41 + 1.68 * magnitude - intensity) / 1.46);
  // A contour closer to the rupture than its own depth has no surface
  // expression — the ring would be imaginary.
  if (!Number.isFinite(hypocentral) || hypocentral <= depthKm) return null;
  return Math.sqrt(hypocentral * hypocentral - depthKm * depthKm);
}

/** Modified Mercalli descriptions, index 0 unused so index == intensity. */
const MMI_LABELS = [
  '', 'Not felt', 'Weak', 'Weak', 'Light', 'Moderate', 'Strong',
  'Very strong', 'Severe', 'Violent', 'Extreme', 'Extreme', 'Extreme',
];

/**
 * Human-readable shaking description for an intensity.
 * @param {number} intensity - Modified Mercalli intensity.
 * @returns {string}
 */
export function intensityLabel(intensity) {
  const index = Math.max(1, Math.min(12, Math.round(intensity)));
  return MMI_LABELS[index] || '';
}

/**
 * Elliptical wildfire spread footprint after a burn period.
 *
 * Implements the Alexander (1985) length-to-breadth relation used in the
 * Canadian Forest Fire Behaviour Prediction system:
 *
 *   L/B = 1 + 8.729·(1 − e^(−0.03·U))^2.155
 *
 * with U the 10 m open wind speed in km/h. The fire is modelled as an ellipse
 * whose long axis lies along the wind — which is why a wind-driven fire is a
 * long finger rather than a circle.
 *
 * @param {object} params
 * @param {number} params.rateOfSpreadMPerMin - Head fire rate of spread (m/min).
 * @param {number} params.windSpeedKmh - 10 m open wind speed (km/h).
 * @param {number} params.durationMin - Burn duration (minutes).
 * @returns {{lengthKm: number, widthKm: number, areaKm2: number, lengthToBreadth: number}}
 */
export function fireSpreadEllipse({ rateOfSpreadMPerMin, windSpeedKmh, durationMin }) {
  const ros = Math.max(0, Number(rateOfSpreadMPerMin) || 0);
  const wind = Math.max(0, Number(windSpeedKmh) || 0);
  const minutes = Math.max(0, Number(durationMin) || 0);

  const lengthToBreadth = 1 + 8.729 * ((1 - Math.exp(-0.03 * wind)) ** 2.155);
  const lengthKm = (ros * minutes) / 1000;
  const widthKm = lengthToBreadth > 0 ? lengthKm / lengthToBreadth : 0;
  // Ellipse area with the spread distance as the FULL major axis.
  const areaKm2 = Math.PI * (lengthKm / 2) * (widthKm / 2);
  return { lengthKm, widthKm, areaKm2, lengthToBreadth };
}

/**
 * Shallow-water tsunami travel time between two points.
 *
 * Long-wave celerity is c = sqrt(g·d): a tsunami crosses deep ocean at jet
 * speed and slows dramatically on the shelf. Uses a single representative
 * depth, which is what makes this an estimate rather than a bathymetric
 * propagation model.
 *
 * @param {number} distanceKm - Great-circle distance in km.
 * @param {number} depthM - Representative water depth in metres.
 * @returns {number|null} Travel time in minutes, or null for invalid input.
 */
export function tsunamiTravelMinutes(distanceKm, depthM) {
  const distance = Number(distanceKm);
  const depth = Number(depthM);
  if (!Number.isFinite(distance) || !Number.isFinite(depth) || depth <= 0 || distance < 0) {
    return null;
  }
  const celerityMs = Math.sqrt(9.81 * depth);
  return (distance * 1000) / celerityMs / 60;
}

/**
 * Great-circle distance between two WGS84 points.
 * @param {number} lat1 - Latitude A in degrees.
 * @param {number} lon1 - Longitude A in degrees.
 * @param {number} lat2 - Latitude B in degrees.
 * @param {number} lon2 - Longitude B in degrees.
 * @returns {number} Distance in kilometres.
 */
export function greatCircleKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Ring set for an earthquake scenario: one contour per intensity that the
 * event actually produces.
 *
 * @param {object} params
 * @param {number} params.magnitude - Moment magnitude.
 * @param {number} [params.depthKm=10] - Focal depth.
 * @returns {Array<{intensity: number, label: string, radiusKm: number}>}
 *   Contours ordered outward (strongest shaking first).
 */
export function earthquakeContours({ magnitude, depthKm = 10 }) {
  const rings = [];
  for (let intensity = 9; intensity >= 3; intensity -= 1) {
    const radiusKm = radiusForIntensity(magnitude, intensity, depthKm);
    if (radiusKm == null || radiusKm <= 0) continue;
    rings.push({ intensity, label: intensityLabel(intensity), radiusKm });
  }
  return rings;
}
