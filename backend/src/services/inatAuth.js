/* iNaturalist OAuth → auto-refreshing API token service.

   iNaturalist's v1 API (incl. computer vision) needs an "API token" — a JWT
   that expires after ~24h. This service mints one automatically from your
   registered OAuth application credentials and refreshes it on demand, so the
   token never has to be pasted by hand.

   Flow per refresh:
     1. POST /oauth/token (password grant)      -> OAuth access_token
     2. GET  /users/api_token (Bearer access)   -> api_token JWT (24h)

   Config (.env):
     INAT_APP_ID, INAT_APP_SECRET, INAT_USERNAME, INAT_PASSWORD   (OAuth mode)
     INAT_API_TOKEN                                               (manual fallback)
*/

const OAUTH_TOKEN_URL = 'https://www.inaturalist.org/oauth/token';
const API_TOKEN_URL   = 'https://www.inaturalist.org/users/api_token';
const REFRESH_BUFFER  = 300; // refresh when <5 min of validity remains

let cached = { jwt: null, exp: 0 }; // exp in epoch seconds
let refreshPromise = null;

function hasOAuthCreds() {
  return !!(process.env.INAT_APP_ID && process.env.INAT_APP_SECRET &&
            process.env.INAT_USERNAME && process.env.INAT_PASSWORD);
}

// Read the `exp` claim from a JWT without verifying the signature
function decodeJwtExp(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return payload.exp || 0;
  } catch { return 0; }
}

async function fetchAccessToken() {
  const body = new URLSearchParams({
    grant_type:    'password',
    client_id:     process.env.INAT_APP_ID,
    client_secret: process.env.INAT_APP_SECRET,
    username:      process.env.INAT_USERNAME,
    password:      process.env.INAT_PASSWORD,
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
  const accessToken = await fetchAccessToken();
  const jwt = await fetchApiToken(accessToken);
  cached = { jwt, exp: decodeJwtExp(jwt) };
  console.log(`[iNat] API token refreshed; valid until ${new Date(cached.exp * 1000).toISOString()}`);
  return jwt;
}

/* Return a valid api_token JWT.
   - OAuth mode: returns cached token, refreshing automatically when near expiry.
   - Manual mode: returns the static INAT_API_TOKEN.
   - Unconfigured: returns null. */
async function getApiToken() {
  if (!hasOAuthCreds()) {
    return process.env.INAT_API_TOKEN || null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (cached.jwt && cached.exp - REFRESH_BUFFER > now) return cached.jwt;

  if (!refreshPromise) {
    refreshPromise = refresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

// Drop the cached token (e.g. after a 401) so the next call re-mints one
function invalidate() {
  cached = { jwt: null, exp: 0 };
}

// Diagnostics for a status endpoint
function status() {
  const now = Math.floor(Date.now() / 1000);
  if (hasOAuthCreds()) {
    return {
      mode: 'oauth',
      configured: true,
      token_cached: !!cached.jwt,
      expires_in_seconds: cached.jwt ? Math.max(0, cached.exp - now) : null,
    };
  }
  if (process.env.INAT_API_TOKEN) {
    const exp = decodeJwtExp(process.env.INAT_API_TOKEN);
    return {
      mode: 'static',
      configured: true,
      expires_in_seconds: exp ? Math.max(0, exp - now) : null,
    };
  }
  return { mode: 'none', configured: false };
}

module.exports = { getApiToken, invalidate, status };
