/* Optional email sender for verification codes.

   If SMTP_* env vars are set, sends real email via nodemailer.
   If not configured (the default), sendVerificationCode() returns false and the
   caller falls back to "dev mode": the code is returned in the API response and
   logged to the server console so registration can be demoed without a mail server.

   To enable real email, set in backend/.env:
     SMTP_HOST=smtp.gmail.com
     SMTP_PORT=587
     SMTP_USER=you@gmail.com
     SMTP_PASS=your_16_char_app_password   # Gmail → App Passwords
     SMTP_FROM="BioReport <you@gmail.com>"
*/

let transporter = null;
let triedInit = false;

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (triedInit) return transporter;
  triedInit = true;
  if (!isConfigured()) return null;
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: parseInt(process.env.SMTP_PORT) === 465, // true for 465, false for 587/STARTTLS
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } catch (e) {
    console.warn('[mailer] nodemailer not available:', e.message);
    transporter = null;
  }
  return transporter;
}

/* Returns true if a real email was sent, false if running in dev/no-SMTP mode. */
async function sendVerificationCode(to, code) {
  const tx = getTransporter();
  if (!tx) {
    console.log(`[mailer] (dev mode — no SMTP) verification code for ${to}: ${code}`);
    return false;
  }
  await tx.sendMail({
    from:    process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Your BioReport verification code',
    text:    `Your BioReport verification code is ${code}. It expires in 15 minutes.`,
    html:    `<p>Your BioReport verification code is:</p><h2 style="letter-spacing:3px">${code}</h2><p>It expires in 15 minutes.</p>`,
  });
  return true;
}

// Check SMTP at startup so the server log clearly states whether real email
// (OTP) is live, or whether it's still running in dev mode.
async function verifyTransport() {
  if (!isConfigured()) {
    console.log('[mailer] No SMTP configured — OTP runs in DEV mode (code returned in API + logged to console).');
    return false;
  }
  const tx = getTransporter();
  if (!tx) {
    console.warn('[mailer] SMTP set but transporter unavailable — OTP falling back to DEV mode.');
    return false;
  }
  try {
    await tx.verify();
    console.log(`[mailer] Email OTP is LIVE via ${process.env.SMTP_HOST} (from: ${process.env.SMTP_FROM || process.env.SMTP_USER}).`);
    return true;
  } catch (e) {
    console.warn(`[mailer] SMTP verify failed: ${e.message} — OTP will fall back to DEV mode until fixed.`);
    return false;
  }
}

module.exports = { sendVerificationCode, isConfigured, verifyTransport };
