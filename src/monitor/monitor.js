/**
 * @file MONITOR dashboard controller.
 *
 * Five views mapped onto the reference sites the user named:
 *   WIRE      — world-monitor.com   (global news wire + live stats + predictions)
 *   SITUATION — monitor-the-situation.com (severity-ranked global events + sources)
 *   THEATER   — war.direct          (military flights, conflict news, report card)
 *   MARKETS   — the new 6th board   (crypto, metals, indices, FX, business news)
 *   CAMERAS   — every public camera in the catalog
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
  try { history.replaceState(null, '', `?view=${name}`); } catch { /* file:// */ }
}

// ── WIRE (world-monitor) ─────────────────────────────────────────────────────
views.wire = async () => {
  const root = $('#view-wire');
  root.innerHTML = '';
  const grid = el('div', 'grid cols-2');
  const feed = el('div', 'card'); feed.append(el('h3', null, 'Global News Wire'));
  const feedBody = el('div', null, '<div class="loading">Loading wire…</div>'); feed.append(feedBody);
  const side = el('div', 'grid');
  const stats = el('div', 'card'); stats.append(el('h3', null, 'Live Signals'));
  const statsBody = el('div', 'grid cols-4'); statsBody.style.gap = '4px';
  statsBody.innerHTML = '<div class="loading">…</div>'; stats.append(statsBody);
  const preds = el('div', 'card'); preds.append(el('h3', null, 'Prediction Markets'));
  const predsBody = el('div', null, '<div class="loading">Loading…</div>'); preds.append(predsBody);
  side.append(stats, preds);
  grid.append(feed, side); root.append(grid);

  // News wire
  try {
    const d = await getJson('/api/monitor/wire?q=breaking%20OR%20conflict%20OR%20crisis');
    feedBody.innerHTML = '';
    for (const a of (d.articles || []).slice(0, 30)) {
      const item = el('a', 'wire-item');
      item.href = a.url || '#'; item.target = '_blank'; item.rel = 'noopener noreferrer';
      item.innerHTML = `<div class="t">${esc(a.title)}</div><div class="m"><span>${esc(a.domain || '')}</span><span>${esc(relativeTime(a.seenAt))}</span></div>`;
      feedBody.append(item);
    }
    if (!feedBody.children.length) feedBody.innerHTML = '<div class="err">No wire items available.</div>';
    feed.querySelector('h3').innerHTML = `Global News Wire <span class="src">via ${esc(d.source || '')}</span>`;
  } catch { feedBody.innerHTML = '<div class="err">News wire unavailable.</div>'; }

  // Live signals (quakes, fires, flights, vessels)
  const signal = async (label, url, count) => {
    try { const d = await getJson(url, 40000); return { label, n: count(d) }; }
    catch { return { label, n: '—' }; }
  };
  Promise.all([
    signal('Quakes 24h', '/api/situation/emsc', (d) => (d.features || []).length),
    signal('Disasters', '/api/situation/gdacs', (d) => (d.features || []).length),
    signal('Flights', '/api/opensky?lat=48.2&lon=16.37', (d) => (d.states || d.aircraft || []).length),
    signal('Fires', '/api/firms', (d) => (d.sources || []).reduce((s, x) => s + (x.count || 0), 0)),
  ]).then((rows) => {
    statsBody.innerHTML = '';
    for (const r of rows) {
      const s = el('div', 'stat');
      s.innerHTML = `<div class="n">${typeof r.n === 'number' ? r.n.toLocaleString() : r.n}</div><div class="l">${esc(r.label)}</div>`;
      statsBody.append(s);
    }
  });

  // Predictions
  try {
    const d = await getJson('/api/monitor/predictions');
    predsBody.innerHTML = '';
    for (const m of (d.markets || []).slice(0, 8)) {
      const top = [...m.outcomes].sort((a, b) => b.probability - a.probability)[0];
      const pct = Math.round((top?.probability || 0) * 100);
      const p = el('div', 'pred');
      p.innerHTML = `<div class="q">${esc(m.question)}</div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px">
          <span class="muted">${esc(top?.name || '')}</span><span class="accent" style="color:var(--accent)">${pct}%</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>`;
      predsBody.append(p);
    }
    if (!predsBody.children.length) predsBody.innerHTML = '<div class="muted">No active markets.</div>';
  } catch { predsBody.innerHTML = '<div class="err">Predictions unavailable.</div>'; }
};

// ── SITUATION (monitor-the-situation) ────────────────────────────────────────
views.situation = async () => {
  const root = $('#view-situation');
  root.innerHTML = '<div class="controls"><span class="muted">Severity-ranked global events from GDACS + EMSC. Each links its source.</span></div>';
  const list = el('div'); list.innerHTML = '<div class="loading">Clustering events…</div>'; root.append(list);
  try {
    const [gd, eq] = await Promise.all([
      getJson('/api/situation/gdacs', 40000).catch(() => ({ features: [] })),
      getJson('/api/situation/emsc', 40000).catch(() => ({ features: [] })),
    ]);
    const events = [];
    for (const f of gd.features || []) {
      const p = f.properties || {};
      events.push({
        title: p.name || 'Event', kind: p.eventType, alertLevel: p.alertLevel,
        where: p.country || '', when: p.fromDate,
        coord: f.geometry?.coordinates,
      });
    }
    for (const f of eq.features || []) {
      const p = f.properties || {};
      events.push({
        title: p.name || 'Earthquake', kind: 'earthquake', magnitude: p.magnitude,
        where: '', when: p.time, coord: f.geometry?.coordinates,
      });
    }
    for (const e of events) { e.score = severityScore(e); }
    events.sort((a, b) => b.score - a.score);
    list.innerHTML = '';
    for (const e of events.slice(0, 40)) {
      const tier = severityTier(e.score);
      const card = el('div', `ev ${tier.tier}`);
      const coord = Array.isArray(e.coord) ? `${e.coord[1]?.toFixed(2)}, ${e.coord[0]?.toFixed(2)}` : '';
      const map = coord ? `<a href="/?lat=${e.coord[1]}&lon=${e.coord[0]}" style="color:var(--accent)">view on globe →</a>` : '';
      card.innerHTML = `<div class="head"><span class="badge">${tier.label}</span><span class="muted">${e.score}</span>
        <span class="t">${esc(e.title)}</span></div>
        <div class="m">${esc(e.kind || '')} ${e.where ? '· ' + esc(e.where) : ''} ${e.when ? '· ' + esc(relativeTime(e.when)) + ' ago' : ''} ${coord ? '· ' + coord : ''} ${map}</div>`;
      list.append(card);
    }
    if (!list.children.length) list.innerHTML = '<div class="muted">No active events.</div>';
  } catch { list.innerHTML = '<div class="err">Event feeds unavailable.</div>'; }
};

// ── THEATER (war.direct) ─────────────────────────────────────────────────────
views.theater = async () => {
  const root = $('#view-theater');
  root.innerHTML = '';
  const grid = el('div', 'grid cols-2');
  const left = el('div', 'card'); left.append(el('h3', null, 'Military Flights (ADS-B)'));
  const milBody = el('div', null, '<div class="loading">Loading military traffic…</div>'); left.append(milBody);
  const right = el('div', 'grid');
  const card = el('div', 'card'); card.append(el('h3', null, 'Report Card'));
  const cardBody = el('div', 'grid cols-4'); cardBody.style.gap = '4px';
  cardBody.innerHTML = '<div class="loading">…</div>'; card.append(cardBody);
  const news = el('div', 'card'); news.append(el('h3', null, 'Conflict Wire'));
  const newsBody = el('div', null, '<div class="loading">Loading…</div>'); news.append(newsBody);
  right.append(card, news);
  grid.append(left, right); root.append(grid);

  let milCount = 0;
  try {
    const d = await getJson('/api/adsblol/mil', 40000);
    const ac = d.ac || d.aircraft || [];
    milCount = ac.length;
    milBody.innerHTML = '';
    for (const a of ac.slice(0, 30)) {
      const r = el('div', 'row');
      const call = a.flight || a.r || a.hex || '—';
      const alt = Number.isFinite(Number(a.alt_baro)) ? `${a.alt_baro} ft` : (a.alt_baro || '');
      r.innerHTML = `<div class="sym"><span>${esc(String(call).trim())}</span><span class="name">${esc(a.t || a.type || '')}</span></div>
        <div class="price">${esc(alt)} <span class="chg muted">${esc(a.squawk || '')}</span></div>`;
      milBody.append(r);
    }
    if (!milBody.children.length) milBody.innerHTML = '<div class="muted">No military contacts right now.</div>';
  } catch { milBody.innerHTML = '<div class="err">Military feed unavailable.</div>'; }

  // Report card
  const rc = async (label, url, count) => { try { return { label, n: count(await getJson(url, 40000)) }; } catch { return { label, n: '—' }; } };
  Promise.all([
    Promise.resolve({ label: 'Mil Aircraft', n: milCount }),
    rc('Quakes', '/api/situation/emsc', (d) => (d.features || []).length),
    rc('Disasters', '/api/situation/gdacs', (d) => (d.features || []).length),
    rc('Fires', '/api/firms', (d) => (d.sources || []).reduce((s, x) => s + (x.count || 0), 0)),
  ]).then((rows) => {
    cardBody.innerHTML = '';
    for (const r of rows) { const s = el('div', 'stat'); s.innerHTML = `<div class="n">${typeof r.n === 'number' ? r.n.toLocaleString() : r.n}</div><div class="l">${esc(r.label)}</div>`; cardBody.append(s); }
  });

  try {
    const d = await getJson('/api/monitor/wire?q=war%20OR%20strike%20OR%20military');
    newsBody.innerHTML = '';
    for (const a of (d.articles || []).slice(0, 12)) {
      const item = el('a', 'wire-item'); item.href = a.url || '#'; item.target = '_blank'; item.rel = 'noopener noreferrer';
      item.innerHTML = `<div class="t">${esc(a.title)}</div><div class="m"><span>${esc(a.domain || '')}</span><span>${esc(relativeTime(a.seenAt))}</span></div>`;
      newsBody.append(item);
    }
  } catch { newsBody.innerHTML = '<div class="err">Conflict wire unavailable.</div>'; }
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

// ── CAMERAS (all feeds) ──────────────────────────────────────────────────────
views.cameras = async () => {
  const root = $('#view-cameras');
  root.innerHTML = '<div class="controls"><span class="muted">Every public camera in the catalog. Frames refresh on load; click one to open it.</span> <select id="cam-country"><option value="">All countries</option></select> <button id="cam-more">Load more</button> <span id="cam-count" class="muted"></span></div>';
  const grid = el('div', 'grid cols-cams'); root.append(grid);
  let sources = [];
  let shown = 0;
  const PAGE = 60;
  try {
    const d = await getJson('/api/cctv/sources', 60000);
    sources = Array.isArray(d) ? d : (d.sources || []);
  } catch { grid.innerHTML = '<div class="err">Camera catalog unavailable.</div>'; return; }
  // Country filter
  const sel = $('#cam-country');
  const countries = [...new Set(sources.map((s) => (s.cityId || '').toUpperCase()).filter(Boolean))].sort();
  for (const c of countries) { const o = el('option'); o.value = c; o.textContent = c; sel.append(o); }
  let filtered = sources;
  const frameUrl = (s) => `/api/cctv/frame/${encodeURIComponent(s.id)}`;
  const renderNext = () => {
    const slice = filtered.slice(shown, shown + PAGE);
    for (const s of slice) {
      const cam = el('a', 'cam'); cam.href = frameUrl(s); cam.target = '_blank'; cam.rel = 'noopener noreferrer';
      const img = el('img'); img.loading = 'lazy'; img.src = frameUrl(s);
      img.onerror = () => { cam.style.display = 'none'; };
      cam.append(img);
      cam.append(el('div', 'cc', esc((s.cityId || '').toUpperCase())));
      cam.append(el('div', 'lab', esc(s.name || s.id)));
      grid.append(cam);
    }
    shown += slice.length;
    $('#cam-count').textContent = `${shown} / ${filtered.length} shown`;
  };
  $('#cam-more').addEventListener('click', renderNext);
  sel.addEventListener('change', () => {
    filtered = sel.value ? sources.filter((s) => (s.cityId || '').toUpperCase() === sel.value) : sources;
    shown = 0; grid.innerHTML = ''; renderNext();
  });
  renderNext();
};

// ── Boot: honor ?view= ───────────────────────────────────────────────────────
const initial = new URLSearchParams(location.search).get('view');
if (initial && document.getElementById(`view-${initial}`)) selectView(initial);
else { rendered.add('wire'); views.wire(); }
