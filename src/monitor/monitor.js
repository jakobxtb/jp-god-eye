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
  const PAGE = 60;
  const renderNext = () => {
    const slice = filtered.slice(shown, shown + PAGE);
    for (const c of slice) {
      const card = el('a', 'cam');
      card.href = c.open; card.target = '_blank'; card.rel = 'noopener noreferrer';
      if (c.thumb) {
        const img = el('img'); img.loading = 'lazy'; img.src = c.thumb;
        // A thumbnail that never loads becomes the LIVE placeholder rather than
        // a broken-image icon.
        img.onerror = () => { img.remove(); card.style.display = 'flex'; card.style.alignItems = 'center'; card.style.justifyContent = 'center'; card.insertAdjacentHTML('afterbegin', '<span style="color:var(--accent);font-size:11px;letter-spacing:.1em">▶ LIVE</span>'); };
        card.append(img);
      } else {
        card.style.display = 'flex'; card.style.alignItems = 'center'; card.style.justifyContent = 'center';
        card.innerHTML = '<span style="color:var(--accent);font-size:11px;letter-spacing:.1em">▶ LIVE</span>';
      }
      card.append(el('div', 'cc', esc(c.cc)));
      card.append(el('div', 'lab', esc(c.name)));
      grid.append(card);
    }
    shown += slice.length;
    $('#cam-count').textContent = `${shown.toLocaleString()} / ${filtered.length.toLocaleString()} shown`;
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

// ── Boot: honor ?view= ───────────────────────────────────────────────────────
const initial = new URLSearchParams(location.search).get('view');
if (initial && document.getElementById(`view-${initial}`)) selectView(initial);
else { rendered.add('wire'); views.wire(); }
