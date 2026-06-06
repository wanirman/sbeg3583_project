#!/usr/bin/env node
/* One-time iNaturalist authorization-code setup.

   Usage (run from the backend/ folder):
     1.  node scripts/inat-setup.js
         -> prints an authorize URL. Open it, log in, click "Authorize".
            iNaturalist shows you an authorization code.
     2.  node scripts/inat-setup.js <THE_CODE>
         -> exchanges the code for a long-lived access token and writes
            INAT_ACCESS_TOKEN into .env (the value is never printed).
     3.  pm2 restart bioreport   (or restart node)

   Requires INAT_APP_ID and INAT_APP_SECRET already set in .env. */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const ENV_PATH   = path.resolve(__dirname, '..', '.env');
const REDIRECT   = 'urn:ietf:wg:oauth:2.0:oob';
const APP_ID     = process.env.INAT_APP_ID;
const APP_SECRET = process.env.INAT_APP_SECRET;

function writeEnvVar(key, value) {
  let env = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=.*$`, 'm').test(env)) {
    env = env.replace(new RegExp(`^${key}=.*$`, 'm'), line);
  } else {
    env += (env.endsWith('\n') || env === '' ? '' : '\n') + line + '\n';
  }
  fs.writeFileSync(ENV_PATH, env);
}

async function main() {
  if (!APP_ID || !APP_SECRET) {
    console.error('\n✗ Set INAT_APP_ID and INAT_APP_SECRET in .env first, then re-run.\n');
    process.exit(1);
  }

  const code = process.argv[2];

  if (!code) {
    const url = `https://www.inaturalist.org/oauth/authorize?client_id=${encodeURIComponent(APP_ID)}` +
                `&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code`;
    console.log('\n── iNaturalist setup, step 1 ──\n');
    console.log('1. Open this URL in a browser (logged in to iNaturalist), then click "Authorize":\n');
    console.log('   ' + url + '\n');
    console.log('2. Copy the authorization code it shows you.');
    console.log('3. Run:  node scripts/inat-setup.js <THE_CODE>\n');
    return;
  }

  console.log('\nExchanging code for an access token…');
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    client_id:     APP_ID,
    client_secret: APP_SECRET,
    code,
    redirect_uri:  REDIRECT,
  });
  const res  = await fetch('https://www.inaturalist.org/oauth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.access_token) {
    console.error(`\n✗ Failed (${res.status}): ${data.error_description || data.error || 'no access_token returned'}`);
    console.error('  The code may have expired (they are single-use and short-lived) — redo step 1 for a fresh code.\n');
    process.exit(1);
  }

  writeEnvVar('INAT_ACCESS_TOKEN', data.access_token);
  console.log('\n✅ Success! INAT_ACCESS_TOKEN saved to .env (value not shown).');
  console.log('   Restart the backend to use it:  pm2 restart bioreport\n');
}

main().catch(e => { console.error('\n✗ ' + e.message + '\n'); process.exit(1); });
