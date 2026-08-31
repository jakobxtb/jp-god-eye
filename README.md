# 👁 JP GOD EYE

**A real-time intelligence console for planet Earth, focused on Europe.** A 3D globe with live aircraft, ships, satellites, earthquakes, wildfires, traffic and **1,200 public cameras across Europe and the US** — running entirely on **free and open data sources**.

Opens over **Vienna**. Europe is the primary theatre; every US layer and preset stays fully intact.

> Fork of [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) by Bilawal Sidhu, migrated to a **€0 running-cost** data stack. No billing account required for any feature.

---

## 🧭 Two views, one application

JP GOD EYE ships as **two intelligence views served from a single origin**, with
a switcher in the header:

| View | URL | Engine | What it is |
|---|---|---|---|
| **GLOBE** | `/` | CesiumJS (3D) | Photoreal-class 3D globe, 1,649 cameras, HD Europe imagery |
| **OSIRIS** | `/osiris` | MapLibre GL (2D) | Flat intelligence board — 17,800+ cameras, conflicts, cyber, maritime, OSINT tooling |
| **SIM** | `/` → SIM | CesiumJS overlay | Hazard modelling: earthquake shaking contours, wind-driven fire spread, tsunami isochrones |
| **MONITOR** | `/monitor.html` | Vanilla dashboard | Five monitoring boards — WIRE, SITUATION, THEATER, MARKETS, CAMERAS |

They are separate applications (Vite + vanilla JS; Next.js + TypeScript) joined
by a dev-server proxy, so each keeps its own stack and its own bookmarkable URL
while the browser sees one site — no CORS, no second port to remember.

## 📡 MONITOR dashboard

`/monitor.html` — a tabbed situational-awareness dashboard, in the spirit of
sites like world-monitor.com, monitor-the-situation.com and war.direct, built
entirely on the same free public feeds those sites use:

| Board | Inspired by | Shows |
|---|---|---|
| **WIRE** | world-monitor | Live global news wire (GDELT → Google News fallback), live signal counters (quakes, disasters, flights, fires), prediction-market odds (Polymarket) |
| **SITUATION** | monitor-the-situation | Severity-ranked global events (GDACS disasters + EMSC seismic), each linking its source and locatable on the globe |
| **THEATER** | war.direct | Military ADS-B traffic (adsb.lol), a conflict news wire, and a live report card |
| **MARKETS** | *(new, the 6th board)* | Crypto (CoinGecko), precious metals (gold-api), indices & commodities (Yahoo Finance), FX (Frankfurter/ECB), market news |
| **CAMERAS** | — | Every public camera the app can reach — ~19,500 worldwide (6,000+ in Europe) merging the OSIRIS + globe catalogs, searchable and filterable by country |

Every panel reads the app's own keyless proxies and **fails soft**: a dead feed
shows an error line, never a blank board. All data sources are free and keyless
(GDELT, Google News, USGS, EMSC, GDACS, NASA FIRMS, adsb.lol, CoinGecko,
gold-api, Yahoo Finance, Frankfurter, Polymarket).

## 🧮 Hazard Simulation

The **SIM** button opens a modelling overlay on the globe. Place an origin, pick a
scenario, and it draws the footprint from published empirical relations:

| Scenario | Model | Draws |
|---|---|---|
| **Earthquake** | Bakun & Wentworth intensity attenuation, hypocentral distance | Modified Mercalli contour rings (MMI III–IX) |
| **Wildfire** | Alexander (1985) length-to-breadth, CFFBP | Wind-driven spread ellipse |
| **Tsunami** | Shallow-water celerity `c = √(g·d)` | Travel-time isochrones (15 min – 4 h) |

All three are **order-of-magnitude planning footprints**, labelled as model estimates
in the panel: they ignore soil response, topography, fuel moisture and bathymetry.
The maths lives in `src/data/hazardModel.js` and is unit-tested against the
properties each relation must have.

## 🔧 Setup wizard

`http://localhost:4173/setup.html` — a local form for pasting the optional free
keys. It writes `.env` (and mirrors the OSIRIS ones into `osiris/.env.local`),
accepts **only** the ten allowlisted names, rejects values containing line breaks,
and refuses any request that does not come from the loopback interface. Configured
keys are reported as set/not-set; values are never sent back to the browser.

## ⚡ Quick start

```bash
npm run install:all     # installs both halves
cp .env.example .env    # optional — everything runs with zero keys
npm run dev             # starts GLOBE + OSIRIS together
```

Open **http://localhost:4173** (OSIRIS at **/osiris**)

Run one half alone with `npm run dev:globe` or `npm run dev:osiris`.

### OSIRIS optional keys

OSIRIS is free by design — aviation, maritime, satellites, fires, quakes, news,
CVEs and its 17,800-camera index all run on keyless public feeds. Three keys
widen it, and this fork wires two of them that upstream only reported as flags:

| Key | What it actually changes | Free at |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Enables the Internet-Outages and Attack-Origins layers | Cloudflare → API Tokens → `Account · Radar · Read` |
| `HELIUS_API_KEY` | Solana history gains real amounts, direction and counterparties instead of bare signatures | helius.dev |
| `ETHERSCAN_API_KEY` | Adds contract-internal ETH transfers Blockscout omits | etherscan.io/apis |

`N2YO_API_KEY` is listed in OSIRIS's template but **no shipped code path reads
it** — the satellite layer runs on CelesTrak. Setting it changes nothing today.

The RECON toolkit needs `SCANNER_URL`/`SCANNER_KEY` pointing at OSIRIS's
separate scanner backend, which is not part of this repository; without them
that tab returns 503 by design.

---

## 🟢 Runs with zero keys

These layers need **no signup, no account, no key** — they work the moment you start the app:

| Layer | Source | Verified live |
|---|---|---|
| ✈️ **Live Flights** | OpenSky Network | 12,346 aircraft |
| 🎖️ **Military Flights** | adsb.lol | 377 contacts |
| 🛰️ **Satellites** | CelesTrak (SGP4) | 16,055 TLE objects |
| 🌍 **Earthquakes** | USGS | 249 events / 24 h |
| 📹 **CCTV Mesh** | Windy · Digitraffic · TfL · Austin · Caltrans | **1,649 cameras** (EU 1,018 / US 612) |
| 📻 **Radio** | Radio Browser | 750 stations |
| 🚲 **Bikeshare** | GBFS (16 systems) | 86 stations in Austin |
| 🚀 **Space Missions** | Launch Library 2 | 27 launches / 30 d |
| 🌐 **Satellite globe** | EOX Sentinel-2 cloudless | 10 m global |
| 🖼 **HD Europe** | 7 national orthophoto services | down to **8 cm** |
| 🌋 **EU Seismic** | EMSC Seismic Portal | 400 events |
| ⚠️ **Disaster Alerts** | GDACS (EU JRC) | 100 active events |
| ⌁ **Autobahn DE** | Autobahn GmbH | 2,112 roadworks/closures |
| ✳ **Aurora** | NOAA SWPC OVATION | live forecast |
| ◉ **Air Quality** | Open-Meteo | European AQI grid |
| 🇫🇮 **Finland cameras** | Fintraffic Digitraffic | 122 road cameras |
| 🇩🇪 **Autobahn data** | Autobahn GmbH | 193 roadworks on A3 alone |
| 🌋 **Europe seismic** | EMSC Seismic Portal | finer than USGS for Europe |
| 💨 **Air quality** | Open-Meteo | EU-AQI, PM2.5, NO₂ |
| ⛰️ **Terrain** | Re:Earth / Mapterhorn | global mesh |
| 🔍 **Search / Geocoding** | Nominatim → Photon | — |
| 📍 **Nearby places** | OpenStreetMap Overpass | — |
| 🗺️ **Routing** | OSRM | walk · bike · car |
| ☁️ **Weather** | Open-Meteo | — |
| 🎖️ **Mapped installations** | OpenStreetMap | — |

---

## 🟡 Optional free keys — none require a credit card

Each unlocks one more layer. All are free tiers with no payment method on file.

### 1. Cesium ion — sharper globe + 3D buildings
The single biggest visual upgrade. Unlocks **Bing sub-metre aerial imagery** and **Cesium OSM Buildings** (350 M buildings worldwide).

```
1. https://ion.cesium.com/signup            → email only, no card
2. After login →  "Access Tokens"  →  "Create token"
3. Name: jp-god-eye     Scope: assets:read  only
4. Asset access: 1 (World Terrain), 2 + 3 (Bing Aerial), 96188 (OSM Buildings)
5. Copy →  CESIUM_ION_TOKEN=…
```
Free tier: 5 GB storage, **15 GB streaming/month**, individual non-commercial use.

### 2. TomTom — real live traffic
Without it the traffic layer runs a clearly-labelled `SIMULATED` mode. With it, real congestion.

```
1. https://developer.tomtom.com/user/register   → no card
2. Dashboard → Keys → copy the default key
3. TOMTOM_API_KEY=…
```
Free tier: **200,000 tile requests/month**. This app ships a monthly governor capped at 180,000 (10 % safety margin), so it cannot exceed the free tier.

### 3. NASA FIRMS — live wildfires
```
1. https://firms.modaps.eosdis.nasa.gov/api/map_key/
2. Enter email → key appears immediately. No account.
3. FIRMS_MAP_KEY=…
```
Verified live: **300,997 active fire detections** across 3 VIIRS satellites.

### 4. AISStream — live ships
```
1. https://aisstream.io  → Sign up (2 minutes, free)
2. Dashboard → create API key
3. AISSTREAM_API_KEY=…
```
Verified live: **13,000+ vessels** worldwide. Takes ~60 s after startup to fill.

### 5. Windy Webcams — European cameras (Vienna, Germany, everywhere)

**This is what unlocks continental Europe.** No national road operator publishes a
usable free camera API: Austria's ASFINAG has none, and Germany's official
Autobahn webcam endpoint returns an empty list for every single Autobahn
(verified across A1–A61). Windy aggregates ~71,000 public cameras instead.

```
1.  https://api.windy.com/keys   → sign in, free, no card
2.  "Add new key"
3.  Key type:  Webcams API       ← not "Map Forecast"
4.  Name: JP GOD EYE   URL: http://localhost:4173
5.  WINDY_WEBCAMS_KEY=…
```
Free tier: **1,000 requests/day**. This app caches the camera catalog for 6 h and
queries 15 regional boxes, costing ~60 requests/day — the live frames come from
Windy's image CDN, not the metered API.

### 6. OpenSky OAuth *(optional)* — more flight polling credits
Anonymous access already works. Credentials raise the rate limit.
```
opensky-network.org → Account → API Clients → Create
OPENSKY_CLIENT_ID=…   OPENSKY_CLIENT_SECRET=…
```

---

## 🔴 What you do NOT need

- **No Google Maps API key.** All Google dependencies (Photorealistic 3D Tiles, Geocoding, Places, Street View) were replaced with free sources.
- **No OpenAI key** — unless you deliberately want the optional voice control, which is metered and off by default.

---

## 🖥 Rendering quality

This fork fixes the "everything looks soft" problem:

- **Full device-pixel-ratio rendering.** Cesium defaults to rendering at 1× and upscaling — on a Retina display that halves the linear resolution of the entire globe. Now disabled (capped at 2× so phones stay fast).
- **Tighter LOD** (`maximumScreenSpaceError` 2.0 → 1.5): imagery and terrain swap to detail tiles sooner.
- **Crisper buildings** (OSM Buildings SSE 16 → 8).
- **Sharpest stack wins by default:** with a Cesium ion token the app boots into sub-metre Bing aerial; keyless it boots into 10 m Sentinel-2.

---

## 🗺 Map stacks

Six sources in the tray: **Google 3D** *(only if you supply a Google key)* · **Satellite** *(Sentinel-2, keyless)* · **Bing Aerial** · **Bing Labels** *(both need ion)* · **HD Europe** *(7 national orthophotos, keyless)* · **OSM**.

**HD Europe** is the sharpest stack. It composites seven official national
orthophoto services over a global base, each clipped to its country, so the
right imagery appears automatically as you fly across borders:

| Country | Service | Resolution |
|---|---|---|
| 🇳🇱 Netherlands | PDOK / Kadaster | **8 cm** |
| 🇫🇷 France | IGN Géoplateforme | 20 cm |
| 🇨🇭 Switzerland | swisstopo SWISSIMAGE | 25 cm |
| 🇦🇹 Austria | basemap.at | 30 cm |
| 🇩🇪 Germany — NRW | Geobasis NRW | 10 cm |
| 🇩🇪 Germany — Bavaria | Bayerische Vermessungsverwaltung | 40 cm |
| 🇩🇪 Germany — Baden-Württemberg | LGL BW | 20 cm |
| 🇩🇪 Germany — Lower Saxony | LGLN | 20 cm |
| 🇪🇸 Spain | IGN PNOA | ~25 cm |
| 🇵🇱 Poland | GUGiK Geoportal | ~25 cm |

Everywhere else the base layer shows through — Bing sub-metre with an ion
token, otherwise the 10 m Sentinel-2 mosaic.

Germany has **no keyless nationwide** aerial service (the federal BKG endpoint
answers 403 without registration), so it is assembled from the four state
services that are reachable without a key. The remaining states fall back to the
global base layer.

3D buildings render on every globe stack once an ion token is present.

---

## 📊 Data sources & licensing

Full attribution and per-source licence terms: [`DATA_SOURCES.md`](DATA_SOURCES.md).

**Two sources are NonCommercial** and must be removed or relicensed for commercial use:
- **EOX Sentinel-2 cloudless** (CC BY-NC-SA 4.0) — the keyless satellite globe
- **TeleGeography submarine cables** (CC BY-NC-SA 3.0) — bundled dataset

The **Cesium ion free tier is also individual non-commercial only.**

Additional European sources and their terms: **basemap.at** (CC BY 4.0),
**Fintraffic Digitraffic** (CC BY 4.0), **EMSC Seismic Portal**,
**Autobahn GmbH** (Datenlizenz Deutschland), **Windy Webcams API** (per Windy's
API terms — camera imagery remains its operators' property).

---

## 🧪 Testing

```bash
npm test                    # 2,589 unit tests
npm run build               # production build
npm run qa:map-source-tray  # browser QA for the map tray
```

---

## 📄 Licence

MIT — see [`LICENSE`](LICENSE). The MIT grant covers **source code only**, not third-party data or bundled assets, which keep their own terms.
