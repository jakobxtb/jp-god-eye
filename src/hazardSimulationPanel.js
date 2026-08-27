/**
 * @file Wiring for the Hazard Simulation panel.
 *
 * Kept out of ui.js deliberately: this is a self-contained third view with its
 * own lifecycle, and folding it into the 9k-line UI orchestrator would make
 * both harder to follow. Exposes one function that owns the whole panel.
 *
 * @module hazardSimulationPanel
 */
import * as Cesium from 'cesium';
import { HazardSimulation } from './hazardSimulation.js';

/**
 * Attach the simulation panel to a viewer.
 * @param {Cesium.Viewer} viewer - Viewer to draw scenarios into.
 * @returns {{destroy: () => void}|null} Handle, or null when the markup is absent.
 */
export function initHazardSimulationPanel(viewer) {
  const panel = document.getElementById('hazard-sim-panel');
  const navBtn = document.getElementById('sim-nav-btn');
  if (!panel || !navBtn || !viewer) return null;

  const sim = new HazardSimulation(viewer);
  const resultEl = document.getElementById('hazard-sim-result');
  const originText = document.getElementById('hazard-sim-origin-text');
  const pickBtn = document.getElementById('hazard-sim-pick');
  let kind = 'earthquake';
  let picking = false;
  /** @type {Cesium.ScreenSpaceEventHandler|null} */
  let pickHandler = null;

  const readNumber = (id, fallback) => {
    const value = Number(document.getElementById(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  };

  // ── Live slider readouts ────────────────────────────────────────────────
  const OUTPUTS = [
    ['sim-magnitude', 'mag', (v) => Number(v).toFixed(1)],
    ['sim-depth', 'depth', (v) => `${v} km`],
    ['sim-ros', 'ros', (v) => `${v} m/min`],
    ['sim-wind', 'wind', (v) => `${v} km/h`],
    ['sim-winddir', 'winddir', (v) => `${v}°`],
    ['sim-duration', 'dur', (v) => `${v} min`],
    ['sim-waterdepth', 'wdepth', (v) => `${v} m`],
  ];
  for (const [id, out, format] of OUTPUTS) {
    const input = document.getElementById(id);
    const label = panel.querySelector(`span[data-out="${out}"]`);
    if (!input || !label) continue;
    const sync = () => { label.textContent = format(input.value); };
    input.addEventListener('input', sync);
    sync();
  }

  // ── Scenario tabs ───────────────────────────────────────────────────────
  for (const tab of panel.querySelectorAll('.hazard-sim-tab')) {
    tab.addEventListener('click', () => {
      kind = tab.dataset.simKind || 'earthquake';
      for (const other of panel.querySelectorAll('.hazard-sim-tab')) {
        const active = other === tab;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-selected', String(active));
      }
      for (const group of panel.querySelectorAll('[data-sim-fields]')) {
        group.hidden = group.dataset.simFields !== kind;
      }
      // A scenario switch invalidates the drawn footprint; leaving the old one
      // on screen under new controls would misrepresent it.
      sim.clear();
      if (resultEl) resultEl.innerHTML = '';
    });
  }

  // ── Origin picking ──────────────────────────────────────────────────────
  /**
   * Ground point the camera is currently over.
   *
   * Used to seed the origin so the panel is never in a dead "no origin" state,
   * and as the fallback when a map click cannot be resolved to a surface point
   * (a ray that misses the globe, or terrain that has not streamed in yet).
   * @returns {{lat: number, lon: number}|null}
   */
  const cameraSubpoint = () => {
    try {
      const carto = viewer.camera.positionCartographic;
      if (!carto) return null;
      return {
        lat: Cesium.Math.toDegrees(carto.latitude),
        lon: Cesium.Math.toDegrees(carto.longitude),
      };
    } catch {
      return null;
    }
  };

  const setOriginText = () => {
    if (!originText) return;
    originText.textContent = sim.origin
      ? `${sim.origin.lat.toFixed(3)}, ${sim.origin.lon.toFixed(3)}`
      : 'No origin set';
  };

  const stopPicking = () => {
    picking = false;
    pickBtn?.classList.remove('active');
    if (pickBtn) pickBtn.textContent = 'PICK ON MAP';
    pickHandler?.destroy();
    pickHandler = null;
  };

  pickBtn?.addEventListener('click', () => {
    if (picking) { stopPicking(); return; }
    picking = true;
    pickBtn.classList.add('active');
    pickBtn.textContent = 'CLICK MAP…';
    pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    pickHandler.setInputAction((movement) => {
      // Prefer the rendered surface (terrain or 3D tiles) so an origin placed
      // on a mountain is where the user actually clicked, not its ellipsoid
      // shadow; fall back to the ellipsoid when nothing is picked.
      const cartesian = viewer.scene.pickPosition?.(movement.position)
        || viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
      if (cartesian) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        sim.setOrigin(Cesium.Math.toDegrees(carto.latitude), Cesium.Math.toDegrees(carto.longitude));
      } else {
        // The click ray met no surface (pointing at sky, or tiles still
        // streaming). Fall back to where the camera is rather than silently
        // ignoring the click.
        const fallback = cameraSubpoint();
        if (fallback) sim.setOrigin(fallback.lat, fallback.lon);
      }
      setOriginText();
      stopPicking();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  });

  // ── Run / clear ─────────────────────────────────────────────────────────
  const render = (result) => {
    if (!resultEl) return;
    if (!result) {
      resultEl.textContent = 'Set an origin first.';
      return;
    }
    let html = `<strong>${result.summary}</strong>`;
    if (result.kind === 'earthquake' && result.rings?.length) {
      html += '<ul>' + result.rings
        .map((r) => `<li>MMI ${r.intensity} (${r.label}) — ${Math.round(r.radiusKm)} km</li>`)
        .join('') + '</ul>';
    }
    if (result.kind === 'tsunami' && result.isochrones?.length) {
      html += '<ul>' + result.isochrones
        .map((i) => `<li>${i.minutes} min — ${Math.round(i.distanceKm)} km</li>`)
        .join('') + '</ul>';
    }
    resultEl.innerHTML = html;
  };

  document.getElementById('hazard-sim-run')?.addEventListener('click', () => {
    const params = kind === 'earthquake'
      ? { magnitude: readNumber('sim-magnitude', 6.5), depthKm: readNumber('sim-depth', 10) }
      : kind === 'wildfire'
        ? {
            rateOfSpreadMPerMin: readNumber('sim-ros', 10),
            windSpeedKmh: readNumber('sim-wind', 25),
            windDirectionDeg: readNumber('sim-winddir', 90),
            durationMin: readNumber('sim-duration', 120),
          }
        : { depthM: readNumber('sim-waterdepth', 4000) };
    render(sim.run(kind, params));
  });

  document.getElementById('hazard-sim-clear')?.addEventListener('click', () => {
    sim.clear();
    if (resultEl) resultEl.innerHTML = '';
  });

  // ── Panel visibility ────────────────────────────────────────────────────
  const setOpen = (open) => {
    panel.hidden = !open;
    navBtn.classList.toggle('is-active', open);
    navBtn.setAttribute('aria-expanded', String(open));
    // Picking must not stay armed behind a closed panel — the next map click
    // would silently move an origin the user can no longer see.
    if (!open) stopPicking();
  };

  navBtn.addEventListener('click', () => {
    const opening = panel.hidden;
    // Seed the origin from the current view the first time the panel opens, so
    // RUN always has something to model. An explicit pick overrides it.
    if (opening && !sim.origin) {
      const here = cameraSubpoint();
      if (here) { sim.setOrigin(here.lat, here.lon); setOriginText(); }
    }
    setOpen(opening);
  });
  document.getElementById('hazard-sim-close')?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden) return;
    setOpen(false);
    navBtn.focus();
  });

  setOriginText();
  return {
    destroy() {
      stopPicking();
      sim.destroy();
    },
  };
}
