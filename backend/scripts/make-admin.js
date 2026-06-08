#!/usr/bin/env node
/* Promote an existing user to admin (one-time bootstrap for the admin panel).

   Usage (run from the backend/ folder):
     1. Register a normal account in the app first (villager/tourist).
     2. node scripts/make-admin.js you@example.com
     3. Log in at /admin.html with that account.

   To list current admins:  node scripts/make-admin.js --list
*/

require('dotenv').config();
const mysql = require('mysql2/promise');

function connect() {
  return mysql.createConnection({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'biodiversity_pwa',
  });
}

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error('\nUsage: node scripts/make-admin.js <email>\n       node scripts/make-admin.js --list\n');
    process.exit(1);
  }

  const conn = await connect();

  if (arg === '--list') {
    const [admins] = await conn.query("SELECT user_name, email FROM users WHERE user_type = 'admin'");
    console.log(admins.length
      ? '\nCurrent admins:\n' + admins.map(a => `  • ${a.user_name} <${a.email}>`).join('\n') + '\n'
      : '\n(no admin accounts yet)\n');
    await conn.end();
    return;
  }

  const email = arg.toLowerCase().trim();
  const [rows] = await conn.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  const user = rows[0];
  if (!user) {
    console.error(`\n✗ No user with email "${email}". Register that account in the app first, then re-run.\n`);
    await conn.end();
    process.exit(1);
  }

  if (user.user_type === 'admin') {
    console.log(`\n${user.user_name} <${email}> is already an admin.\n`);
  } else {
    // Promote and mark verified so the admin can always log in regardless of OTP state.
    await conn.query("UPDATE users SET user_type = 'admin', is_verified = 1, verification_code = NULL, verification_expires = NULL WHERE user_id = ?", [user.user_id]);
    console.log(`\n✅ ${user.user_name} <${email}> is now an admin. Log in at /admin.html\n`);
  }

  await conn.end();
})().catch(e => { console.error('\n✗ ' + e.message + '\n'); process.exit(1); });
