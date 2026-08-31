/**
 * @file MONITOR dashboard controller.
 *
 * Seven views drawing every function of the reference sites into one board:
 *   WIRE      — world-monitor.com   (global news wire + live stats + predictions)
 *   SITUATION — monitor-the-situation.com (severity-ranked global events + sources)
 *   THEATER   — war.direct          (military flights, conflict news, report card)
 *   MARKETS   — market monitoring    (crypto, metals, indices, FX, business news)
 *   STREAMS   — live TV wall         (24/7 public news livestreams)
 *   PULSE     — threat + outbreaks   (computed DEFCON gauge + global health)
 *   CAMERAS   — ~19,800 public cameras worldwide (6,000+ Europe)
 *
 * Every panel reads the app's own keyless proxies (/api/monitor/*, /api/situation/*,
 * /api/cctv/*, /api/opensky, /api/adsblol/mil). Each render is independent and
 * fails soft: a dead feed shows an error line, never a blank dashboard.
 *
 * @module monitor/monitor
 */
import {
  formatPrice, formatChange, changeDirection, formatCompact,
  relativeTime, severityScore, severityTier,
} from './monitorFormat.js';
import 'leaflet/dist/leaflet.css';
import { createDarkMap, addEventMarker, CATEGORY_COLOR, L } from './monitorMap.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Fetch JSON with a timeout; throws on non-OK. */
async function getJson(url, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// ── Clock ───────────────────────────────────────────────────────────────────
const clock = $('#clock');
setInterval(() => {
  clock.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}, 1000);
clock.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';

// ── View switching ──────────────────────────────────────────────────────────
const views = {};
const rendered = new Set();
for (const btn of document.querySelectorAll('.tab')) {
  btn.addEventListener('click', () => selectView(btn.dataset.view));
}
function selectView(name) {
  for (const btn of document.querySelectorAll('.tab')) btn.classList.toggle('on', btn.dataset.view === name);
  for (const sec of document.querySelectorAll('.view')) sec.classList.toggle('on', sec.id === `view-${name}`);
  if (!rendered.has(name)) { rendered.add(name); (views[name] || (() => {}))(); }
  highlightHeaderNav(name);
  try { history.replaceState(null, '', `?view=${name}`); } catch { /* file:// */ }
}

// ── WIRE (world-monitor.com) — world map + event bubbles + news ticker ───────
//
// Rebuilt to match world-monitor's layout: a full-bleed dark world map with
// colour-coded event markers (quakes, disasters, fires, military flights), a
// category legend to toggle them, a side WIRE feed and a scrolling news ticker.
views.wire = async () => {
  const root = $('#view-wire');
  root.innerHTML = `<div class="mapwrap">
      <div class="map" id="wire-map"></div>
      <div class="map-legend" id="wire-legend"></div>
      <div class="map-side"><h3>THE WIRE · LIVE HEADLINES</h3><div id="wire-feed"><div class="muted" style="padding:12px">Loading…</div></div></div>
      <div class="ticker"><span class="live">● LIVE</span><div class="track" id="wire-ticker"></div></div>
    </div>`;
  const map = createDarkMap($('#wire-map'), { center: [25, 15], zoom: 2 });
  const layers = {
    quake: L.layerGroup().addTo(map),
    disaster: L.layerGroup().addTo(map),
    fire: L.layerGroup().addTo(map),
    flight: L.layerGroup().addTo(map),
  };
  const counts = { quake: 0, disaster: 0, fire: 0, flight: 0 };

  // Quakes (EMSC) + disasters (GDACS) share the situation feeds.
  getJson('/api/situation/emsc', 60000).then((d) => {
    for (const f of d.features || []) {
      const c = f.geometry?.coordinates; const p = f.properties || {};
      if (!c) continue;
      addEventMarker(map, c[1], c[0], { category: 'quake', radius: 4 + Math.min(8, (p.magnitude || 0)), label: p.name });
      counts.quake++;
    }
    layers.quake.eachLayer && renderLegend();
  }).catch(() => {});
  getJson('/api/situation/gdacs', 60000).then((d) => {
    for (const f of d.features || []) {
      const c = f.geometry?.coordinates; const p = f.properties || {};
      if (!c) continue;
      const m = addEventMarker(map, c[1], c[0], { category: 'disaster', radius: 8, html: `<b>${esc(p.name || '')}</b><br>${esc(p.alertLevel || '')} · ${esc(p.country || '')}` });
      layers.disaster.addLayer(m); counts.disaster++;
    }
    renderLegend();
  }).catch(() => {});
  getJson('/api/adsblol/mil', 60000).then((d) => {
    for (const a of (d.ac || []).slice(0, 400)) {
      if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;
      const m = addEventMarker(map, a.lat, a.lon, { category: 'flight', radius: 3, label: `${a.flight || a.hex || ''} ${a.t || ''}`.trim() });
      layers.flight.addLayer(m); counts.flight++;
    }
    renderLegend();
  }).catch(() => {});

  function renderLegend() {
    const items = [
      ['quake', 'Earthquakes'], ['disaster', 'Disasters'],
      ['fire', 'Fires'], ['flight', 'Military flights'],
    ];
    $('#wire-legend').innerHTML = items.map(([k, lbl]) =>
      `<div class="row" data-cat="${k}"><span class="dot" style="background:${CATEGORY_COLOR[k]}"></span>${lbl} <b style="margin-left:auto;color:${CATEGORY_COLOR[k]}">${counts[k] || 0}</b></div>`).join('');
    for (const row of $('#wire-legend').querySelectorAll('.row')) {
      row.addEventListener('click', () => {
        const k = row.dataset.cat; const on = row.classList.toggle('off');
        if (on) map.removeLayer(layers[k]); else map.addLayer(layers[k]);
      });
    }
  }
  renderLegend();

  // Side feed + ticker from the wire feed.
  getJson('/api/monitor/wire?q=breaking OR conflict OR crisis', 30000).then((d) => {
    const arts = (d.articles || []).slice(0, 40);
    $('#wire-feed').innerHTML = arts.map((a) =>
      `<a class="feeditem" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" style="display:block;color:#fff;text-decoration:none">
        ${esc(a.title)}<div class="meta">${esc(a.domain || a.source || '')} · ${esc((a.country || '').toUpperCase())}</div></a>`).join('') || '<div class="muted" style="padding:12px">No headlines.</div>';
    $('#wire-ticker').innerHTML = arts.slice(0, 25).map((a) =>
      `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a>`).join('');
  }).catch(() => { $('#wire-feed').innerHTML = '<div class="err" style="padding:12px">Wire unavailable.</div>'; });

  setTimeout(() => map.invalidateSize(), 200);
};

// ── SITUATION (monitor-the-situation.com) — map + severity event feed ────────
//
// Rebuilt to match monitor-the-situation: a dark map centre with a left
// severity-ranked event FEED. Clicking a feed item flies the map to it. Events
// come from GDACS (disasters) and EMSC (quakes), severity-ordered.
views.situation = async () => {
  const root = $('#view-situation');
  root.innerHTML = `<div class="mapwrap">
      <div class="map" id="sit-map"></div>
      <div class="map-side" style="left:0;right:auto;border-left:0;border-right:1px solid var(--line);width:360px">
        <h3>FEED · SEVERITY-RANKED EVENTS</h3><div id="sit-feed"><div class="muted" style="padding:12px">Loading…</div></div>
      </div>
    </div>`;
  const map = createDarkMap($('#sit-map'), { center: [40, 20], zoom: 3 });
  setTimeout(() => map.invalidateSize(), 200);

  const events = [];
  const [gd, em] = await Promise.all([
    getJson('/api/situation/gdacs', 60000).catch(() => null),
    getJson('/api/situation/emsc', 60000).catch(() => null),
  ]);
  const KIND = { EQ: 'Earthquake', TC: 'Cyclone', FL: 'Flood', VO: 'Volcano', WF: 'Wildfire', DR: 'Drought' };
  for (const f of (gd?.features) || []) {
    const c = f.geometry?.coordinates; const p = f.properties || {};
    if (!c) continue;
    const sev = String(p.alertLevel).toLowerCase() === 'red' ? 90 : String(p.alertLevel).toLowerCase() === 'orange' ? 60 : 40;
    events.push({ lat: c[1], lon: c[0], title: p.name || p.eventType, cat: KIND[p.eventType] || 'Alert', sev, meta: `${p.country || ''} · ${p.alertLevel || ''}`, tier: sev >= 80 ? 'HIGH' : 'MODERATE', color: '#ff5a1f' });
  }
  for (const f of (em?.features) || []) {
    const c = f.geometry?.coordinates; const p = f.properties || {};
    if (!c || (p.magnitude || 0) < 4) continue;
    const sev = Math.round((p.magnitude || 0) * 10);
    events.push({ lat: c[1], lon: c[0], title: p.name || `M${p.magnitude}`, cat: 'Earthquake', sev, meta: `depth ${Math.round(p.depthKm || 0)} km`, tier: (p.magnitude || 0) >= 6 ? 'HIGH' : 'MODERATE', color: '#ffd21f' });
  }
  events.sort((a, b) => b.sev - a.sev);

  const markers = [];
  for (const e of events) {
    markers.push(addEventMarker(map, e.lat, e.lon, { category: e.cat === 'Earthquake' ? 'quake' : 'disaster', radius: 5 + Math.min(9, e.sev / 12), html: `<b>${esc(e.title)}</b><br>${esc(e.meta)}` }));
  }
  $('#sit-feed').innerHTML = events.slice(0, 80).map((e, i) =>
    `<div class="feeditem" data-i="${i}">
      <span class="badge" style="background:${e.color};color:#000">${e.tier} ${e.sev}</span>${esc(e.cat)} · ${esc(e.title)}
      <div class="meta">${esc(e.meta)}</div></div>`).join('') || '<div class="muted" style="padding:12px">No active events.</div>';
  for (const item of $('#sit-feed').querySelectorAll('.feeditem')) {
    item.addEventListener('click', () => {
      const e = events[Number(item.dataset.i)];
      map.flyTo([e.lat, e.lon], 6); markers[Number(item.dataset.i)]?.openPopup();
    });
  }
};

// ── THEATER (war.direct) — live TV player + channels + report card + wire ────
//
// Rebuilt to match war.direct: a large live-TV player centre with a channel
// switcher, a right conflict-news feed, a breaking ticker and a war report
// card. TV + news + stats fused on one screen.
views.theater = async () => {
  const root = $('#view-theater');
  root.innerHTML = `<div class="ticker" style="position:relative;height:26px;margin-bottom:8px"><span class="live">● BREAKING</span><div class="track" id="thr-ticker"></div></div>
    <div class="theater">
      <div class="stage">
        <div class="player" id="thr-player"></div>
        <div class="channels" id="thr-channels"></div>
      </div>
      <div class="side" style="padding:10px">
        <div class="rc" id="thr-rc"></div>
        <h3 style="margin:0 0 6px;font-size:11px;letter-spacing:.14em;color:var(--accent)">CONFLICT WIRE</h3>
        <div id="thr-wire"><div class="muted">Loading…</div></div>
      </div>
    </div>`;

  // Channels from the streams feed.
  const sd = await getJson('/api/monitor/streams').catch(() => null);
  const streams = (sd?.streams) || [];
  const player = $('#thr-player');
  const setChannel = (c) => {
    player.innerHTML = `<iframe src="${esc(c.embed)}" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
    for (const b of $('#thr-channels').querySelectorAll('.ch')) b.classList.toggle('on', b.dataset.id === c.ytId);
  };
  $('#thr-channels').innerHTML = streams.map((c) =>
    `<button class="ch" data-id="${esc(c.ytId)}">${esc(c.name)}</button>`).join('');
  for (const b of $('#thr-channels').querySelectorAll('.ch')) {
    b.addEventListener('click', () => setChannel(streams.find((s) => s.ytId === b.dataset.id)));
  }
  if (streams.length) setChannel(streams[0]);
  else player.innerHTML = '<div class="err" style="padding:20px">Live TV unavailable.</div>';

  // Report card from live signals.
  getJson('/api/monitor/threat', 60000).then((d) => {
    const s = d.signals || {};
    $('#thr-rc').innerHTML = [
      ['MIL AIRCRAFT', s.milAircraft], ['QUAKES 24H', s.quakes],
      ['DISASTERS', s.disasters], ['THREAT', d.level ? `L${d.level}` : '—'],
    ].map(([k, v]) => `<div><div class="n">${typeof v === 'number' ? v.toLocaleString() : esc(v)}</div><div class="k">${k}</div></div>`).join('');
  }).catch(() => { $('#thr-rc').innerHTML = ''; });

  // Conflict wire + breaking ticker.
  getJson('/api/monitor/wire?q=conflict OR strike OR military OR ceasefire', 30000).then((d) => {
    const arts = (d.articles || []).slice(0, 30);
    $('#thr-wire').innerHTML = arts.map((a) =>
      `<a class="feeditem" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" style="display:block;color:#fff;text-decoration:none">
        ${esc(a.title)}<div class="meta">${esc(a.domain || a.source || '')}</div></a>`).join('') || '<div class="muted">No conflict headlines.</div>';
    $('#thr-ticker').innerHTML = arts.slice(0, 20).map((a) =>
      `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" style="color:rgba(255,255,255,.85);text-decoration:none;margin-right:36px">${esc(a.title)}</a>`).join('');
  }).catch(() => { $('#thr-wire').innerHTML = '<div class="err">Wire unavailable.</div>'; });
};

// ── MARKETS (the 6th board) ──────────────────────────────────────────────────
views.markets = async () => {
  const root = $('#view-markets');
  root.innerHTML = '';
  const top = el('div', 'grid cols-2');
  const cryptoCard = el('div', 'card'); cryptoCard.append(el('h3', null, 'Cryptocurrency'));
  const cryptoBody = el('div', null, '<div class="loading">Loading…</div>'); cryptoCard.append(cryptoBody);
  const stacked = el('div', 'grid');
  const metalsCard = el('div', 'card'); metalsCard.append(el('h3', null, 'Precious Metals (USD/oz)'));
  const metalsBody = el('div', null, '<div class="loading">…</div>'); metalsCard.append(metalsBody);
  const idxCard = el('div', 'card'); idxCard.append(el('h3', null, 'Indices & Commodities'));
  const idxBody = el('div', null, '<div class="loading">…</div>'); idxCard.append(idxBody);
  const fxCard = el('div', 'card'); fxCard.append(el('h3', null, 'FX (per USD)'));
  const fxBody = el('div', null, '<div class="loading">…</div>'); fxCard.append(fxBody);
  stacked.append(metalsCard, idxCard, fxCard);
  top.append(cryptoCard, stacked);
  const newsCard = el('div', 'card'); newsCard.style.marginTop = '12px';
  newsCard.append(el('h3', null, 'Market News'));
  const newsBody = el('div', 'grid'); newsBody.style.gridTemplateColumns = 'repeat(auto-fill,minmax(280px,1fr))';
  newsBody.innerHTML = '<div class="loading">…</div>'; newsCard.append(newsBody);
  root.append(top, newsCard);

  const priceRow = (name, symImg, price, chg, sub) => {
    const dir = changeDirection(chg);
    const r = el('div', 'row');
    r.innerHTML = `<div class="sym">${symImg ? `<img src="${esc(symImg)}" alt="">` : ''}<span>${esc(name)}</span>${sub ? `<span class="name">${esc(sub)}</span>` : ''}</div>
      <div class="price">$${formatPrice(price)} ${chg != null ? `<span class="chg ${dir}">${formatChange(chg)}</span>` : ''}</div>`;
    return r;
  };

  getJson('/api/monitor/crypto').then((d) => {
    cryptoBody.innerHTML = '';
    for (const c of (d.coins || []).slice(0, 20)) cryptoBody.append(priceRow(c.symbol, c.image, c.price, c.change24h, c.name));
    if (!cryptoBody.children.length) cryptoBody.innerHTML = '<div class="err">Crypto unavailable.</div>';
  }).catch(() => { cryptoBody.innerHTML = '<div class="err">Crypto unavailable.</div>'; });

  getJson('/api/monitor/metals').then((d) => {
    metalsBody.innerHTML = '';
    for (const m of d.metals || []) metalsBody.append(priceRow(m.name, null, m.price, null, m.symbol));
    if (!metalsBody.children.length) metalsBody.innerHTML = '<div class="err">Metals unavailable.</div>';
  }).catch(() => { metalsBody.innerHTML = '<div class="err">Metals unavailable.</div>'; });

  getJson('/api/monitor/indices').then((d) => {
    idxBody.innerHTML = '';
    for (const i of d.indices || []) idxBody.append(priceRow(i.name, null, i.price, i.changePct, i.symbol));
    if (!idxBody.children.length) idxBody.innerHTML = '<div class="err">Indices unavailable.</div>';
  }).catch(() => { idxBody.innerHTML = '<div class="err">Indices unavailable.</div>'; });

  getJson('/api/monitor/fx').then((d) => {
    fxBody.innerHTML = '';
    for (const r of d.rates || []) {
      const row = el('div', 'row');
      row.innerHTML = `<div class="sym"><span>USD/${esc(r.code)}</span></div><div class="price">${Number(r.rate).toFixed(4)}</div>`;
      fxBody.append(row);
    }
    if (!fxBody.children.length) fxBody.innerHTML = '<div class="err">FX unavailable.</div>';
  }).catch(() => { fxBody.innerHTML = '<div class="err">FX unavailable.</div>'; });

  getJson('/api/monitor/wire?q=stock%20market%20OR%20economy%20OR%20crypto').then((d) => {
    newsBody.innerHTML = '';
    for (const a of (d.articles || []).slice(0, 12)) {
      const item = el('a', 'wire-item'); item.href = a.url || '#'; item.target = '_blank'; item.rel = 'noopener noreferrer';
      item.innerHTML = `<div class="t">${esc(a.title)}</div><div class="m"><span>${esc(a.domain || '')}</span><span>${esc(relativeTime(a.seenAt))}</span></div>`;
      newsBody.append(item);
    }
  }).catch(() => { newsBody.innerHTML = '<div class="err">Market news unavailable.</div>'; });
};

// ── STREAMS (live TV — world-monitor / war.direct) ──────────────────────────
//
// A wall of 24/7 public news livestreams. Iframes are lazy: only the ones
// scrolled near the viewport get a src, so opening the tab does not spin up a
// dozen video players at once.
views.streams = async () => {
  const root = $('#view-streams');
  root.innerHTML = '<div class="controls"><span class="muted">LIVE TELEVISION · public 24/7 news streams</span></div>';
  const grid = el('div', 'grid cols-tv'); root.append(grid);
  const d = await getJson('/api/monitor/streams').catch(() => null);
  const streams = d && d.streams;
  if (!streams || !streams.length) { grid.innerHTML = '<div class="err">Streams unavailable.</div>'; return; }
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const f = en.target; if (!f.dataset.src) continue;
      f.src = f.dataset.src; f.removeAttribute('data-src'); io.unobserve(f);
    }
  }, { rootMargin: '200px' }) : null;
  for (const c of streams) {
    const card = el('div', 'tv');
    const frame = el('iframe');
    frame.setAttribute('allow', 'encrypted-media; picture-in-picture');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    frame.loading = 'lazy';
    if (io) { frame.dataset.src = c.embed; } else { frame.src = c.embed; }
    card.append(frame);
    const lab = el('div', 'lab');
    lab.append(el('a', null, esc(c.name)));
    lab.querySelector('a').href = c.watch; lab.querySelector('a').target = '_blank'; lab.querySelector('a').rel = 'noopener noreferrer';
    lab.querySelector('a').style.color = 'var(--accent)'; lab.querySelector('a').style.textDecoration = 'none';
    lab.append(el('span', 'reg', esc(c.region)));
    card.append(lab);
    grid.append(card);
    if (io) io.observe(frame);
  }
};

// ── PULSE (threat level + outbreaks — world-monitor defcon/outbreaks) ─────────
//
// A computed DEFCON-style gauge (transparent: the contributing signals are
// shown) plus a global public-health readout from disease.sh.
views.pulse = async () => {
  const root = $('#view-pulse');
  root.innerHTML = '';
  const gaugeWrap = el('div'); root.append(gaugeWrap);
  const grid = el('div', 'grid cols-2'); root.append(grid);
  const threatBox = el('div', 'panel'); threatBox.innerHTML = '<h2>THREAT SIGNALS</h2><div class="muted">Loading…</div>';
  const healthBox = el('div', 'panel'); healthBox.innerHTML = '<h2>GLOBAL HEALTH</h2><div class="muted">Loading…</div>';
  grid.append(threatBox, healthBox);

  getJson('/api/monitor/threat', 60000).then((d) => {
    const lvl = d.level || 1;
    gaugeWrap.innerHTML = `<div class="gauge">
      <div class="lvl l${lvl}">${lvl}</div>
      <div class="meta">
        <div style="font-size:16px;letter-spacing:.16em" class="l${lvl}">THREAT LEVEL — ${esc(d.label || '')}</div>
        <div class="muted" style="margin-top:4px">Computed from live global signals · score ${d.score}</div>
        <div class="bars">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= lvl ? 'l' + lvl + 'b' : ''}"></i>`).join('')}</div>
      </div></div>`;
    const s = d.signals || {};
    threatBox.innerHTML = '<h2>THREAT SIGNALS</h2>'
      + [['Earthquakes (24h)', s.quakes], ['Major quakes ≥ M5', s.majorQuakes],
         ['Active disaster alerts', s.disasters], ['Red-level disasters', s.redDisasters],
         ['Military aircraft airborne', s.milAircraft]]
        .map(([k, v]) => `<div class="obk"><span>${k}</span><b>${(v || 0).toLocaleString()}</b></div>`).join('');
  }).catch(() => { gaugeWrap.innerHTML = '<div class="err">Threat feed unavailable.</div>'; threatBox.innerHTML = '<h2>THREAT SIGNALS</h2><div class="err">unavailable</div>'; });

  getJson('/api/monitor/outbreaks', 60000).then((d) => {
    const g = d.global || {};
    let html = '<h2>GLOBAL HEALTH</h2>';
    if (g.cases) {
      html += `<div class="obk"><span>Total cases (tracked)</span><b>${Number(g.cases).toLocaleString()}</b></div>`
        + `<div class="obk"><span>New today</span><b>${Number(g.todayCases || 0).toLocaleString()}</b></div>`
        + `<div class="obk"><span>Deaths today</span><b>${Number(g.todayDeaths || 0).toLocaleString()}</b></div>`;
    }
    if ((d.countries || []).length) {
      // Daily reporting largely stopped post-pandemic (todayCases is 0 almost
      // everywhere), so the meaningful, non-zero figure is cumulative total.
      html += '<div class="muted" style="margin:10px 0 4px">Most affected — cumulative tracked cases</div>';
      html += d.countries.slice(0, 12).map((c) =>
        `<div class="obk"><span>${esc(c.country)}</span><b>${Number(c.cases || 0).toLocaleString()}</b></div>`).join('');
    }
    if ((d.epidemics || []).length) {
      html += '<div class="muted" style="margin:10px 0 4px">GDACS epidemic alerts</div>';
      html += d.epidemics.map((e) => `<div class="obk"><span>${esc(e.name || e.country)}</span><b>${esc(e.alert || '')}</b></div>`).join('');
    }
    healthBox.innerHTML = html;
  }).catch(() => { healthBox.innerHTML = '<h2>GLOBAL HEALTH</h2><div class="err">unavailable</div>'; });
};

// ── CAMERAS (all feeds) ──────────────────────────────────────────────────────
//
// Merges TWO catalogs into one browsable directory:
//   OSIRIS  — ~15,700 cameras worldwide (6,000+ in Europe), same-origin via the
//             /osiris proxy. The bulk of the coverage.
//   GLOBE   — ~1,650 cameras whose frames this app proxies live.
// A grid of 15k live video players would crush any browser, so this is a
// filterable, searchable DIRECTORY: it shows a live thumbnail wherever one can
// be loaded from a plain <img>, and a click-to-open LIVE card otherwise —
// exactly how large camera walls on monitoring sites present their counts.
views.cameras = async () => {
  const root = $('#view-cameras');
  root.innerHTML = '<div class="controls">'
    + '<span class="muted" id="cam-status">Loading camera catalog…</span>'
    + '<input id="cam-search" placeholder="search name / city…" style="background:var(--panel);border:1px solid var(--line);color:#fff;font-family:inherit;font-size:11px;padding:6px 10px;min-width:180px" />'
    + '<select id="cam-country"><option value="">All countries</option></select>'
    + '<button id="cam-more">Load more</button> <span id="cam-count" class="muted"></span></div>';
  const grid = el('div', 'grid cols-cams'); root.append(grid);

  // Fetch both catalogs in parallel; either can fail without emptying the view.
  const [osiris, globe] = await Promise.all([
    getJson('/osiris/api/cctv', 120000).catch(() => null),
    getJson('/api/cctv/sources', 90000).catch(() => null),
  ]);

  const cams = [];
  // OSIRIS catalog.
  const oList = osiris && (osiris.cameras || (Array.isArray(osiris) ? osiris : []));
  for (const c of oList || []) {
    if (!c || !c.id) continue;
    const type = String(c.stream_type || '').toLowerCase();
    // Only jpg/mjpeg can be shown by a bare <img>; everything else opens on click.
    const thumb = (type === 'jpg' || type === 'mjpeg') ? c.stream_url : null;
    cams.push({
      id: `osiris:${c.id}`,
      name: c.name || c.id,
      place: [c.city, c.country].filter(Boolean).join(', '),
      cc: c.country || '',
      thumb,
      open: c.stream_url || `/osiris`,
    });
  }
  // Globe catalog (live proxied frames).
  const gList = globe && (Array.isArray(globe) ? globe : (globe.sources || []));
  for (const s of gList || []) {
    if (!s || !s.id) continue;
    const frame = `/api/cctv/frame/${encodeURIComponent(s.id)}`;
    cams.push({
      id: `globe:${s.id}`,
      name: s.name || s.id,
      place: [s.city, (s.cityId || '').toUpperCase()].filter(Boolean).join(', '),
      cc: (s.cityId || '').toUpperCase(),
      thumb: frame,
      open: frame,
    });
  }

  if (!cams.length) { grid.innerHTML = '<div class="err">No camera catalog available.</div>'; return; }

  // Cameras with a loadable live thumbnail lead the grid; click-to-open LIVE
  // cards follow. A stable secondary sort by id keeps the order deterministic.
  cams.sort((a, b) => (b.thumb ? 1 : 0) - (a.thumb ? 1 : 0) || a.id.localeCompare(b.id));

  // Country dropdown, most-populous first.
  const sel = $('#cam-country');
  const byCc = {};
  for (const c of cams) { const k = c.cc || '?'; byCc[k] = (byCc[k] || 0) + 1; }
  for (const [cc, n] of Object.entries(byCc).sort((a, b) => b[1] - a[1])) {
    if (!cc || cc === '?') continue;
    const o = el('option'); o.value = cc; o.textContent = `${cc} (${n})`; sel.append(o);
  }
  $('#cam-status').textContent = `${cams.length.toLocaleString()} cameras worldwide`;

  let filtered = cams;
  let shown = 0;
  const PAGE = 48;
  const renderNext = () => {
    const slice = filtered.slice(shown, shown + PAGE);
    for (const c of slice) {
      const card = el('a', 'cam');
      card.href = c.open; card.target = '_blank'; card.rel = 'noopener noreferrer';
      card.title = `${c.name}${c.place ? ' — ' + c.place : ''}`;
      // The LIVE marker sits behind everything, so a tile is complete before —
      // and whether or not — a thumbnail ever arrives.
      card.append(el('div', 'live', '◉ LIVE'));
      if (c.thumb) {
        const img = el('img'); img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
        // Drop a thumbnail that fails so the LIVE tile shows through cleanly,
        // instead of a broken-image glyph.
        img.onerror = () => img.remove();
        img.src = c.thumb;
        card.append(img);
      }
      if (c.cc) card.append(el('div', 'cc', esc(c.cc)));
      card.append(el('div', 'lab', esc(c.name)));
      grid.append(card);
    }
    shown += slice.length;
    $('#cam-count').textContent = `${shown.toLocaleString()} / ${filtered.length.toLocaleString()} shown`;
    $('#cam-more').style.display = shown >= filtered.length ? 'none' : '';
  };
  const applyFilter = () => {
    const q = ($('#cam-search').value || '').trim().toLowerCase();
    const cc = sel.value;
    filtered = cams.filter((c) =>
      (!cc || c.cc === cc)
      && (!q || `${c.name} ${c.place}`.toLowerCase().includes(q)));
    shown = 0; grid.innerHTML = ''; renderNext();
  };
  $('#cam-more').addEventListener('click', renderNext);
  sel.addEventListener('change', applyFilter);
  let searchTimer = null;
  $('#cam-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(applyFilter, 250); });
  renderNext();
};

// Highlight the header system-link that matches the active view, so the
// top-level nav shows which of the named systems you are in.
function highlightHeaderNav(view) {
  const map = { wire: 'view=wire', situation: 'view=situation', theater: 'view=theater', markets: 'view=markets' };
  for (const a of document.querySelectorAll('.topnav a, header a, nav a')) {
    const href = a.getAttribute('href') || '';
    if (href.includes('view=')) a.classList.toggle('on', map[view] && href.includes(map[view]));
  }
}

// ── Boot: honor ?view= ───────────────────────────────────────────────────────
const initial = new URLSearchParams(location.search).get('view');
if (initial && document.getElementById(`view-${initial}`)) selectView(initial);
else { rendered.add('wire'); views.wire(); }
