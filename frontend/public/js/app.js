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

  // Locate button on map
  document.getElementById('btn-locate').addEventListener('click', () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      BioMap.panTo(pos.coords.latitude, pos.coords.longitude);
    });
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    BioAPI.clearToken();
    showAuth();
  });

  // Force sync button
  document.getElementById('btn-force-sync').addEventListener('click', async () => {
    if (!navigator.onLine) { alert('No internet connection.'); return; }
    await BioGamification.syncPendingSightings();
    await BioChat.syncOfflineChat();
    alert('Sync complete!');
  });

})();
