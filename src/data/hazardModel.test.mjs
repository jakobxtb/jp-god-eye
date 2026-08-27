// src/data/hazardModel.test.mjs — hazard footprint maths for the Simulation tab.
//
// These check the PROPERTIES the published relations must have (monotonicity,
// correct inversion, physical limits), not memorised outputs — a fitted
// coefficient could be refined without these tests becoming lies.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shakingIntensity,
  radiusForIntensity,
  intensityLabel,
  fireSpreadEllipse,
  tsunamiTravelMinutes,
  greatCircleKm,
  earthquakeContours,
} from './hazardModel.js';

test('shaking weakens with distance and strengthens with magnitude', () => {
  const near = shakingIntensity(6.5, 10);
  const far = shakingIntensity(6.5, 200);
  assert.ok(near > far, 'intensity must fall off with distance');

  const small = shakingIntensity(5.0, 50);
  const large = shakingIntensity(7.0, 50);
  assert.ok(large > small, 'a bigger quake shakes harder at the same distance');

  // The scale itself is bounded; no input may escape I..XII.
  assert.ok(shakingIntensity(9.5, 0.1) <= 12);
  assert.ok(shakingIntensity(2.0, 5000) >= 1);
});

test('depth is treated as hypocentral distance, not ignored', () => {
  // Directly above the epicentre, a deep quake must shake LESS than a shallow
  // one — the rupture is simply further away.
  const shallow = shakingIntensity(6.0, 0, 5);
  const deep = shakingIntensity(6.0, 0, 300);
  assert.ok(shallow > deep, 'a deep rupture is further from the surface');
  assert.ok(Number.isFinite(shallow), 'zero distance must not diverge');
});

test('radiusForIntensity inverts shakingIntensity', () => {
  const magnitude = 7.0;
  const depthKm = 15;
  for (const target of [4, 5, 6, 7]) {
    const radius = radiusForIntensity(magnitude, target, depthKm);
    assert.ok(radius > 0, `intensity ${target} must have a real radius`);
    const roundTrip = shakingIntensity(magnitude, radius, depthKm);
    assert.ok(
      Math.abs(roundTrip - target) < 0.01,
      `round trip for I${target} drifted: ${roundTrip}`,
    );
  }
});

test('an intensity the quake never reaches has no contour', () => {
  // A small quake cannot produce violent shaking anywhere, and a contour
  // nominally inside the focal depth has no surface expression.
  assert.equal(radiusForIntensity(3.0, 9, 10), null);
  assert.equal(radiusForIntensity(Number.NaN, 5, 10), null);
});

test('contours come back ordered outward and only where they exist', () => {
  const rings = earthquakeContours({ magnitude: 7.2, depthKm: 10 });
  assert.ok(rings.length > 0);
  for (let i = 1; i < rings.length; i += 1) {
    assert.ok(rings[i].radiusKm > rings[i - 1].radiusKm, 'radii must grow outward');
    assert.ok(rings[i].intensity < rings[i - 1].intensity, 'intensity must fall outward');
  }
  assert.ok(rings.every((r) => typeof r.label === 'string' && r.label.length > 0));
  // A magnitude too small to reach even MMI III produces nothing rather than
  // an imaginary ring.
  assert.deepEqual(earthquakeContours({ magnitude: 1.0, depthKm: 10 }), []);
});

test('intensity labels stay on the Modified Mercalli scale', () => {
  assert.equal(intensityLabel(1), 'Not felt');
  assert.equal(intensityLabel(9), 'Violent');
  // Out-of-range values clamp instead of returning undefined.
  assert.equal(intensityLabel(99), 'Extreme');
  assert.equal(intensityLabel(-5), 'Not felt');
});

test('wind stretches the fire ellipse along its axis', () => {
  const calm = fireSpreadEllipse({ rateOfSpreadMPerMin: 10, windSpeedKmh: 0, durationMin: 60 });
  const windy = fireSpreadEllipse({ rateOfSpreadMPerMin: 10, windSpeedKmh: 40, durationMin: 60 });
  assert.equal(calm.lengthToBreadth, 1, 'a windless fire is circular');
  assert.ok(windy.lengthToBreadth > calm.lengthToBreadth, 'wind elongates the fire');
  assert.ok(windy.widthKm < calm.widthKm, 'the same run is narrower when wind-driven');
  assert.equal(calm.lengthKm, 0.6, '10 m/min for 60 min is 600 m');
});

test('fire spread is zero for zero inputs and never negative', () => {
  const none = fireSpreadEllipse({ rateOfSpreadMPerMin: 0, windSpeedKmh: 20, durationMin: 60 });
  assert.equal(none.lengthKm, 0);
  assert.equal(none.areaKm2, 0);
  const bad = fireSpreadEllipse({ rateOfSpreadMPerMin: -5, windSpeedKmh: -1, durationMin: -10 });
  assert.ok(bad.lengthKm >= 0 && bad.areaKm2 >= 0, 'negative input must not produce negative area');
});

test('tsunami celerity follows sqrt(g*d)', () => {
  // Deep ocean is fast, shelf water is slow: the same distance must take
  // longer over shallower water.
  const deep = tsunamiTravelMinutes(1000, 4000);
  const shelf = tsunamiTravelMinutes(1000, 100);
  assert.ok(shelf > deep, 'shallow water slows the wave');
  // 4000 m deep gives c ~= 198 m/s, so 1000 km takes ~84 minutes.
  assert.ok(Math.abs(deep - 84) < 3, `expected ~84 min, got ${deep}`);
  assert.equal(tsunamiTravelMinutes(100, 0), null, 'zero depth has no celerity');
  assert.equal(tsunamiTravelMinutes(100, -5), null);
});

test('great-circle distance matches known separations', () => {
  // Vienna -> Berlin is ~524 km.
  const km = greatCircleKm(48.2082, 16.3738, 52.5200, 13.4050);
  assert.ok(Math.abs(km - 524) < 15, `expected ~524 km, got ${km}`);
  assert.equal(greatCircleKm(0, 0, 0, 0), 0);
});
