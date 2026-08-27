/**
 * @file The single source of truth for which keys the setup wizard accepts.
 *
 * Shared by the browser form and the server writer. Keeping ONE list matters
 * for safety as much as for tidiness: the writer refuses any name that is not
 * in here, so a crafted request cannot inject arbitrary variables into `.env`.
 *
 * @module setupKeys
 */

/**
 * @typedef {object} SetupKeySpec
 * @property {string} name Environment variable name.
 * @property {string} label Human label.
 * @property {string} unlocks What the key actually changes.
 * @property {string} url Where to get it, free.
 * @property {string} [pattern] Optional anchored regex source for validation.
 * @property {string} [hint] Format hint shown under the field.
 * @property {'globe'|'osiris'} target Which half reads it.
 */

/**
 * Every key the wizard will write, and nothing else.
 *
 * Deliberately excludes GOOGLE_MAPS_API_KEY and OPENAI_API_KEY: both are
 * metered, this build does not need either, and a setup wizard that invites
 * people to paste a billable credential would work against the whole point of
 * the free-tier migration.
 * @type {ReadonlyArray<SetupKeySpec>}
 */
export const SETUP_KEYS = Object.freeze([
  {
    name: 'CESIUM_ION_TOKEN',
    label: 'Cesium ion',
    unlocks: 'Sub-metre Bing aerial imagery and 3D buildings — the sharpest globe.',
    url: 'https://ion.cesium.com/signup',
    hint: 'Long token starting with "eyJ". Scope: assets:read',
    pattern: '^[A-Za-z0-9._-]{40,600}$',
    target: 'globe',
  },
  {
    name: 'WINDY_WEBCAMS_KEY',
    label: 'Windy Webcams',
    unlocks: '~730 public cameras across Europe, on top of the keyless packs.',
    url: 'https://api.windy.com/keys',
    hint: 'Key type must be "Webcams API"',
    pattern: '^[A-Za-z0-9]{16,64}$',
    target: 'globe',
  },
  {
    name: 'TOMTOM_API_KEY',
    label: 'TomTom Traffic',
    unlocks: 'Real live congestion instead of the labelled simulation.',
    url: 'https://developer.tomtom.com/user/register',
    hint: '32-character key from the Dashboard',
    pattern: '^[A-Za-z0-9]{16,64}$',
    target: 'globe',
  },
  {
    name: 'AISSTREAM_API_KEY',
    label: 'AISStream',
    unlocks: 'Live vessel positions worldwide (~13,000 ships).',
    url: 'https://aisstream.io',
    pattern: '^[A-Za-z0-9]{16,80}$',
    target: 'globe',
  },
  {
    name: 'FIRMS_MAP_KEY',
    label: 'NASA FIRMS',
    unlocks: 'Live wildfire detections from three VIIRS satellites.',
    url: 'https://firms.modaps.eosdis.nasa.gov/api/map_key/',
    hint: 'Emailed instantly, no account needed',
    pattern: '^[A-Za-z0-9]{16,64}$',
    target: 'globe',
  },
  {
    name: 'CLOUDFLARE_API_TOKEN',
    label: 'Cloudflare Radar',
    unlocks: 'OSIRIS: Internet-outage and attack-origin layers.',
    url: 'https://dash.cloudflare.com/profile/api-tokens',
    hint: 'Custom token with permission "Account · Radar · Read"',
    pattern: '^[A-Za-z0-9_.-]{20,120}$',
    target: 'osiris',
  },
  {
    name: 'HELIUS_API_KEY',
    label: 'Helius',
    unlocks: 'OSIRIS: Solana history with real amounts and counterparties.',
    url: 'https://helius.dev',
    hint: 'UUID form',
    pattern: '^[A-Za-z0-9-]{20,80}$',
    target: 'osiris',
  },
  {
    name: 'ETHERSCAN_API_KEY',
    label: 'Etherscan',
    unlocks: 'OSIRIS: contract-internal ETH transfers Blockscout omits.',
    url: 'https://etherscan.io/apis',
    pattern: '^[A-Za-z0-9]{20,80}$',
    target: 'osiris',
  },
  {
    name: 'OPENSKY_CLIENT_ID',
    label: 'OpenSky client ID',
    unlocks: 'Higher flight-polling limits. Anonymous access works without it.',
    url: 'https://opensky-network.org',
    pattern: '^[A-Za-z0-9_-]{4,80}$',
    target: 'globe',
  },
  {
    name: 'OPENSKY_CLIENT_SECRET',
    label: 'OpenSky client secret',
    unlocks: 'Pairs with the client ID above.',
    url: 'https://opensky-network.org',
    pattern: '^[A-Za-z0-9_-]{8,120}$',
    target: 'globe',
  },
]);

/** @type {ReadonlySet<string>} Fast membership test for the writer. */
export const SETUP_KEY_NAMES = Object.freeze(new Set(SETUP_KEYS.map((k) => k.name)));

/**
 * Validate one submitted value against its spec.
 *
 * Rejects anything containing a newline unconditionally: `.env` is a
 * line-oriented format, so an embedded newline is how a single field would
 * become two variables.
 * @param {string} name - Variable name.
 * @param {string} value - Submitted value.
 * @returns {{ok: true}|{ok: false, error: string}}
 */
export function validateSetupValue(name, value) {
  if (!SETUP_KEY_NAMES.has(name)) return { ok: false, error: 'Unknown key' };
  if (typeof value !== 'string') return { ok: false, error: 'Value must be a string' };
  const trimmed = value.trim();
  // An empty value is how the form says "clear this key" — allowed.
  if (trimmed === '') return { ok: true };
  if (/[\r\n]/.test(value)) return { ok: false, error: 'Value must not contain line breaks' };
  if (trimmed.length > 700) return { ok: false, error: 'Value is implausibly long' };
  const spec = SETUP_KEYS.find((k) => k.name === name);
  if (spec?.pattern && !new RegExp(spec.pattern).test(trimmed)) {
    return { ok: false, error: `Value does not look like a ${spec.label} key` };
  }
  return { ok: true };
}

/**
 * Merge submitted values into existing `.env` text, preserving comments,
 * ordering and any variable the wizard does not manage.
 * @param {string} existing - Current `.env` contents ('' when absent).
 * @param {Record<string, string>} updates - Validated name → value pairs.
 * @returns {string} New `.env` contents.
 */
export function mergeEnv(existing, updates) {
  const lines = String(existing || '').split('\n');
  const applied = new Set();

  const next = lines.map((line) => {
    const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (!match) return line;
    const name = match[1];
    if (!Object.prototype.hasOwnProperty.call(updates, name)) return line;
    applied.add(name);
    const value = updates[name];
    // Clearing a key comments it out rather than deleting the line, so the
    // file keeps its shape and the user can see what is unset.
    return value === '' ? `# ${name}=` : `${name}=${value}`;
  });

  const added = Object.entries(updates)
    .filter(([name, value]) => !applied.has(name) && value !== '')
    .map(([name, value]) => `${name}=${value}`);

  if (added.length) {
    next.push('', '# Added by the JP GOD EYE setup wizard', ...added);
  }
  return `${next.join('\n').replace(/\n+$/, '')}\n`;
}
