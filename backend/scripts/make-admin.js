#!/usr/bin/env node
/* Promote an existing user to admin (one-time bootstrap for the admin panel).

   Usage (run from the backend/ folder):
     1. Register a normal account in the app first (villager/tourist).
     2. node scripts/make-admin.js you@example.com
     3. Log in at /admin.html with that account.

   To list current admins:  node scripts/make-admin.js --list
*/

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error('\nUsage: node scripts/make-admin.js <email>\n       node scripts/make-admin.js --list\n');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  if (arg === '--list') {
    const admins = await User.find({ user_type: 'admin' }).select('user_name email').lean();
    console.log(admins.length
      ? '\nCurrent admins:\n' + admins.map(a => `  • ${a.user_name} <${a.email}>`).join('\n') + '\n'
      : '\n(no admin accounts yet)\n');
    await mongoose.disconnect();
    return;
  }

  const email = arg.toLowerCase().trim();
  const user = await User.findOne({ email });
  if (!user) {
    console.error(`\n✗ No user with email "${email}". Register that account in the app first, then re-run.\n`);
    process.exit(1);
  }

  if (user.user_type === 'admin') {
    console.log(`\n${user.user_name} <${email}> is already an admin.\n`);
  } else {
    user.user_type = 'admin';
    await user.save();
    console.log(`\n✅ ${user.user_name} <${email}> is now an admin. Log in at /admin.html\n`);
  }

  await mongoose.disconnect();
})().catch(e => { console.error('\n✗ ' + e.message + '\n'); process.exit(1); });
