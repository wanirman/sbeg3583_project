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

  // Auth tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
    });
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('login-error');
    err.textContent = '';
    const email = document.getElementById('login-email').value;
    const pwd   = document.getElementById('login-password').value;
    try {
      await BioAPI.login(email, pwd);
      showApp();
    } catch (ex) {
      err.textContent = ex.message || 'Login failed';
    }
  });

  // Register form
  document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err  = document.getElementById('register-error');
    err.textContent = '';
    const user_name  = document.getElementById('reg-username').value;
    const email      = document.getElementById('reg-email').value;
    const password   = document.getElementById('reg-password').value;
    const user_type  = document.getElementById('reg-type').value;
    try {
      await BioAPI.register(user_name, email, password, user_type);
      showApp();
    } catch (ex) {
      err.textContent = ex.message || 'Registration failed';
    }
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

  // Locate button on map — recentre on current location and show the marker
  document.getElementById('btn-locate').addEventListener('click', () => {
    BioMap.locateUser();
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
      msg.textContent = '✅ Email updated.';
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
      msg.textContent = '✅ Password updated.';
      msg.classList.add('ok');
      e.target.reset();
    } catch (ex) {
      msg.textContent = ex.message || 'Could not update password';
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
