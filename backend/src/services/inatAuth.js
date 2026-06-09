/* iNaturalist token service.

   iNaturalist's v1 API (incl. computer vision) needs an "API token" — a JWT
   that expires after ~24h.

   Token sources, in priority order (DB overrides .env so an admin can paste a
   token in the panel without editing .env or restarting):
     1. inat_access_token (DB settings) / INAT_ACCESS_TOKEN (.env)
        — long-lived OAuth access token; the server mints fresh 24h api_tokens
          from it automatically. PREFERRED ("set once").
     2. INAT_APP_ID/SECRET + INAT_USERNAME/PASSWORD (.env) — password grant.
     3. inat_api_token (DB settings) / INAT_API_TOKEN (.env)
        — a manual 24h api_token pasted by hand (expires daily).

   The RENEWAL BOT (startRenewBot) proactively refreshes the token on a timer
   whenever a renewable credential (access token / password) is configured, so
   the 24h token is always warm and never lapses mid-request.
*/

const { pool } = require('../config/database');

const OAUTH_TOKEN_URL = 'https://www.inaturalist.org/oauth/token';
const API_TOKEN_URL   = 'https://www.inaturalist.org/users/api_token';
const REFRESH_BUFFER  = 300; // refresh when <5 min of validity remains

let cached = { jwt: null, exp: 0 }; // exp in epoch seconds
let refreshPromise = null;
let renewTimer = null;

// ── Config (DB settings override .env), cached briefly ──
let cfg = null, cfgExp = 0;
const CFG_TTL = 30_000;

async function getConfig() {
  const now = Date.now();
  if (cfg && cfgExp > now) return cfg;

  const db = {};
  try {
    const [rows] = await pool.query(
      "SELECT setting_key, setting_value, updated_at FROM settings WHERE setting_key IN ('inat_access_token','inat_api_token')"
    );
    for (const r of rows) if (r.setting_value) db[r.setting_key] = { value: r.setting_value, updated_at: r.updated_at };
  } catch { /* settings table not created yet → fall back to env only */ }

  cfg = {
    accessToken:  db.inat_access_token?.value || process.env.INAT_ACCESS_TOKEN || '',
    apiToken:     db.inat_api_token?.value    || process.env.INAT_API_TOKEN    || '',
    accessSource: db.inat_access_token?.value ? 'db' : (process.env.INAT_ACCESS_TOKEN ? 'env' : null),
    apiSource:    db.inat_api_token?.value    ? 'db' : (process.env.INAT_API_TOKEN ? 'env' : null),
    updatedAt:    db.inat_access_token?.updated_at || db.inat_api_token?.updated_at || null,
    appId:    process.env.INAT_APP_ID,    appSecret: process.env.INAT_APP_SECRET,
    username: process.env.INAT_USERNAME,  password:  process.env.INAT_PASSWORD,
  };
  cfgExp = now + CFG_TTL;
  return cfg;
}

// Force a re-read of the config + drop any cached jwt (call after an admin saves a token)
function reload() { cfg = null; cfgExp = 0; cached = { jwt: null, exp: 0 }; }

function hasPasswordCreds(c) {
  return !!(c.appId && c.appSecret && c.username && c.password);
}
function canMint(c) { return !!c.accessToken || hasPasswordCreds(c); }

// Read the `exp` claim from a JWT without verifying the signature
function decodeJwtExp(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return payload.exp || 0;
  } catch { return 0; }
}

// Obtain an OAuth access token — the stored one (preferred) or via password grant
async function fetchAccessToken(c) {
  if (c.accessToken) return c.accessToken;

  const body = new URLSearchParams({
    grant_type:    'password',
    client_id:     c.appId,
    client_secret: c.appSecret,
    username:      c.username,
    password:      c.password,
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OAuth token request failed (${res.status})${detail ? ': ' + detail.slice(0, 120) : ''}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('OAuth response had no access_token');
  return data.access_token;
}

async function fetchApiToken(accessToken) {
  const res = await fetch(API_TOKEN_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`api_token request failed (${res.status})`);
  const data = await res.json();
  if (!data.api_token) throw new Error('Response had no api_token');
  return data.api_token;
}

async function refresh() {
  const c = await getConfig();
  const accessToken = await fetchAccessToken(c);
  const jwt = await fetchApiToken(accessToken);
  cached = { jwt, exp: decodeJwtExp(jwt) };
  console.log(`[iNat] API token renewed; valid until ${new Date(cached.exp * 1000).toISOString()}`);
  return jwt;
}

/* Return a valid api_token JWT.
   - OAuth/password mode: returns the cached token, refreshing when near expiry.
   - Manual mode: returns the static pasted api_token.
   - Unconfigured: returns null. */
async function getApiToken() {
  const c = await getConfig();
  if (!canMint(c)) {
    return c.apiToken || null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (cached.jwt && cached.exp - REFRESH_BUFFER > now) return cached.jwt;

  if (!refreshPromise) {
    refreshPromise = refresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

// Drop the cached token (e.g. after a 401) so the next call re-mints one
function invalidate() { cached = { jwt: null, exp: 0 }; }

// Diagnostics for the status endpoint / admin card
async function status() {
  const c = await getConfig();
  const now = Math.floor(Date.now() / 1000);
  if (canMint(c)) {
    return {
      mode: 'oauth',
      submode: c.accessToken ? 'access-token' : 'password',
      configured: true,
      auto_renew: true,
      token_cached: !!cached.jwt,
      expires_in_seconds: cached.jwt ? Math.max(0, cached.exp - now) : null,
      source: c.accessSource || 'env',
      updated_at: c.updatedAt,
    };
  }
  if (c.apiToken) {
    const exp = decodeJwtExp(c.apiToken);
    return {
      mode: 'static',
      configured: true,
      auto_renew: false,
      expires_in_seconds: exp ? Math.max(0, exp - now) : null,
      source: c.apiSource || 'env',
      updated_at: c.updatedAt,
    };
  }
  return { mode: 'none', configured: false, auto_renew: false };
}

/* ── Renewal bot ──
   Proactively keep the 24h token warm. No-op in manual/none mode (nothing to
   renew) — so it stays quiet until a long-lived access token is configured,
   then keeps it renewed automatically. */
async function renewTick() {
  try {
    const c = await getConfig();
    if (!canMint(c)) return; // manual paste / unconfigured → nothing to auto-renew
    const now = Math.floor(Date.now() / 1000);
    if (!cached.jwt || cached.exp - REFRESH_BUFFER <= now) {
      await getApiToken(); // triggers a refresh
      console.log('[iNat] renewal bot refreshed the token.');
    }
  } catch (e) {
    console.warn('[iNat] renewal bot tick failed:', e.message);
  }
}

function startRenewBot(intervalMs = 60 * 60 * 1000) { // hourly
  if (renewTimer) return;
  renewTick(); // prime once at startup
  renewTimer = setInterval(renewTick, intervalMs);
  if (renewTimer.unref) renewTimer.unref(); // don't keep the process alive just for this
  console.log('[iNat] token renewal bot started (checks hourly; active once a renewable token is set).');
}

module.exports = { getApiToken, invalidate, reload, status, startRenewBot };
