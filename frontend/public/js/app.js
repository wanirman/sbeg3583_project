/* Main app bootstrap — auth, navigation, SW registration, offline detection */

(async function () {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('New version available — refresh to update.');
          }
        });
      });
    });

    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data.type === 'SYNC_SIGHTINGS') BioGamification.syncPendingSightings();
      if (e.data.type === 'SYNC_CHAT')      BioChat.syncOfflineChat();
    });
  }

  // ===== Haptic feedback =====
  // A short buzz when tapping buttons/controls. Works on Android/Chrome (incl.
  // installed PWA); iOS Safari ignores the Vibration API (silently no-ops).
  if ('vibrate' in navigator) {
    document.addEventListener('click', e => {
      if (e.target.closest('button, .nav-btn, .filter-chip, .auth-tab, .taxa-item, .leaflet-bar a, summary')) {
        navigator.vibrate(10);
      }
    }, { passive: true });
  }

  // ===== PWA install prompt =====
  let deferredInstallPrompt = null;
  const installButtons = () => document.querySelectorAll('.install-btn');

  function showInstallButtons()  { installButtons().forEach(b => b.classList.remove('hidden')); }
  function hideInstallButtons()  { installButtons().forEach(b => b.classList.add('hidden')); }

  // Browser fires this when the app meets installability criteria and isn't already installed
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();            // stop the mini-infobar; we show our own button
    deferredInstallPrompt = e;
    showInstallButtons();
  });

  installButtons().forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') hideInstallButtons();
      deferredInstallPrompt = null;
    });
  });

  // Once installed, hide the buttons (and they won't reappear)
  window.addEventListener('appinstalled', hideInstallButtons);

  // Detect if running as an already-installed standalone app
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isStandalone) hideInstallButtons();

  // iOS Safari doesn't support beforeinstallprompt — show manual instructions instead
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && !isStandalone) {
    document.querySelectorAll('.ios-install-hint').forEach(el => el.classList.remove('hidden'));
  }

  // Offline badge
  function updateOnlineStatus() {
    const badge = document.getElementById('offline-badge');
    const chip  = document.getElementById('sync-status');
    if (navigator.onLine) {
      badge.classList.add('hidden');
      if (chip) { chip.textContent = 'Online'; chip.classList.remove('offline'); }
      BioGamification.syncPendingSightings();
      BioChat.syncOfflineChat();
    } else {
      badge.classList.remove('hidden');
      if (chip) { chip.textContent = 'Offline'; chip.classList.add('offline'); }
    }
  }
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Auth check
  function isLoggedIn() {
    return !!BioAPI.getToken();
  }

  function showApp() {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    const user = BioAPI.getUser();
    if (user) {
      document.getElementById('user-points').textContent = `${user.points || 0} pts`;
    }
    BioMap.init();
    BioReport.init();
    BioChat.init();
    BioGamification.refreshPoints();
    BioGamification.updatePendingCount();
    updateOnlineStatus();
  }

  function showAuth() {
    document.getElementById('app-screen').classList.remove('active');
    document.getElementById('auth-screen').classList.add('active');
  }

  if (isLoggedIn()) showApp();

  // My Records filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      BioGamification.loadMyReports(chip.dataset.status);
    });
  });

  // Identifier (username or email) of the account currently being verified
  let pendingVerifyId = null;

  // Show only one of the auth forms (login / register / verify)
  function showAuthForm(name) {
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`${name}-form`).classList.add('active');
    if (name === 'login' || name === 'register') {
      document.querySelector(`.auth-tab[data-tab="${name}"]`)?.classList.add('active');
    }
  }

  // Switch to the OTP screen for the given account.
  // `info` may carry { email, dev_code, email_sent } from the server.
  function showVerify(identifier, info = {}) {
    pendingVerifyId = identifier;
    document.getElementById('verify-email').textContent = info.email || identifier || 'your email';
    const dev = document.getElementById('verify-devcode');
    if (info.dev_code) {
      dev.innerHTML = `Dev mode (no email server): your code is <strong>${info.dev_code}</strong>`;
      dev.classList.remove('hidden');
    } else {
      dev.textContent = '';
      dev.classList.add('hidden');
    }
    document.getElementById('verify-code').value = '';
    document.getElementById('verify-error').textContent = '';
    showAuthForm('verify');
  }

  // Auth tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => showAuthForm(tab.dataset.tab));
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('login-error');
    err.textContent = '';
    const identifier = document.getElementById('login-identifier').value.trim();
    const pwd        = document.getElementById('login-password').value;
    try {
      await BioAPI.login(identifier, pwd);
      showApp();
    } catch (ex) {
      // Unverified accounts get bounced to the OTP screen (server re-sends a code)
      if (ex.data?.requires_verification) {
        showVerify(ex.data.email || identifier, ex.data);
        return;
      }
      err.textContent = ex.message || 'Login failed';
    }
  });

  // Register form — creates the account, then moves to OTP verification
  document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err  = document.getElementById('register-error');
    err.textContent = '';
    const user_name  = document.getElementById('reg-username').value.trim();
    const email      = document.getElementById('reg-email').value.trim();
    const password   = document.getElementById('reg-password').value;
    const user_type  = document.getElementById('reg-type').value;
    if (!/^[A-Za-z0-9_]{3,20}$/.test(user_name)) {
      err.textContent = 'Username must be 3–20 characters: letters, numbers, or underscore (no spaces).';
      return;
    }
    try {
      const info = await BioAPI.register(user_name, email, password, user_type);
      showVerify(email, info);
    } catch (ex) {
      err.textContent = ex.message || 'Registration failed';
    }
  });

  // Verify form — submit the OTP code
  document.getElementById('verify-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('verify-error');
    err.textContent = '';
    const code = document.getElementById('verify-code').value.trim();
    try {
      await BioAPI.verifyEmail(pendingVerifyId, code);
      pendingVerifyId = null;
      showApp();
    } catch (ex) {
      err.textContent = ex.message || 'Verification failed';
    }
  });

  // Resend OTP code
  document.getElementById('btn-resend-code').addEventListener('click', async () => {
    const err = document.getElementById('verify-error');
    err.textContent = '';
    try {
      const info = await BioAPI.resendCode(pendingVerifyId);
      showVerify(pendingVerifyId, info);
      if (!info.dev_code) err.textContent = 'A new code has been sent.';
    } catch (ex) {
      err.textContent = ex.message || 'Could not resend code';
    }
  });

  // Back to login from the verify screen
  document.getElementById('btn-verify-back').addEventListener('click', () => {
    pendingVerifyId = null;
    showAuthForm('login');
  });

  // Bottom navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`page-${page}`).classList.add('active');

      if (page === 'dashboard')   BioGamification.loadDashboard();
      if (page === 'leaderboard') BioGamification.loadLeaderboard();
      if (page === 'profile')     { BioGamification.refreshPoints(); BioGamification.updatePendingCount(); BioGamification.loadMyReports(); }
      if (page === 'map')         setTimeout(() => BioMap.getMap()?.invalidateSize(), 100);
    });
  });

  // Profile button in topbar
  document.getElementById('btn-profile').addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-profile').classList.add('active');
    BioGamification.refreshPoints();
    BioGamification.updatePendingCount();
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    BioAPI.clearToken();
    showAuth();
  });

  // Account settings — change email
  document.getElementById('email-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = document.getElementById('email-msg');
    msg.textContent = ''; msg.className = 'account-msg';
    const newEmail = document.getElementById('ae-new-email').value;
    const pwd      = document.getElementById('ae-password').value;
    try {
      await BioAPI.updateEmail(newEmail, pwd);
      msg.innerHTML = '<svg class="icon"><use href="#i-circle-check"></use></svg> Email updated.';
      msg.classList.add('ok');
      e.target.reset();
    } catch (ex) {
      msg.textContent = ex.message || 'Could not update email';
      msg.classList.add('err');
    }
  });

  // Account settings — change password
  document.getElementById('password-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = document.getElementById('password-msg');
    msg.textContent = ''; msg.className = 'account-msg';
    const current = document.getElementById('ap-current').value;
    const next    = document.getElementById('ap-new').value;
    try {
      await BioAPI.updatePassword(current, next);
      msg.innerHTML = '<svg class="icon"><use href="#i-circle-check"></use></svg> Password updated.';
      msg.classList.add('ok');
      e.target.reset();
    } catch (ex) {
      msg.textContent = ex.message || 'Could not update password';
      msg.classList.add('err');
    }
  });

  // Delete account (danger zone) — requires password confirmation
  document.getElementById('btn-delete-account').addEventListener('click', async () => {
    const msg = document.getElementById('delete-msg');
    msg.textContent = ''; msg.className = 'account-msg';
    const pwd = prompt('This permanently deletes your account and all your reports.\n\nEnter your password to confirm:');
    if (!pwd) return;
    try {
      await BioAPI.deleteAccount(pwd);
      BioAPI.clearToken();
      alert('Your account has been deleted.');
      showAuth();
    } catch (ex) {
      msg.textContent = ex.message || 'Could not delete account';
      msg.classList.add('err');
    }
  });

  // Force sync button
  document.getElementById('btn-force-sync').addEventListener('click', async () => {
    if (!navigator.onLine) { alert('No internet connection.'); return; }
    await BioGamification.syncPendingSightings();
    await BioChat.syncOfflineChat();
    alert('Sync complete!');
  });

})();
