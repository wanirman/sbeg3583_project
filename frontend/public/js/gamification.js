/* Points, badges, leaderboard, profile, and offline sync */
const BioGamification = (() => {
  const ICON = (n, c = '') => `<svg class="icon ${c}"><use href="#i-${n}"></use></svg>`;

  async function refreshPoints() {
    try {
      const profile = await BioAPI.getProfile();
      document.getElementById('user-points').textContent = `${profile.points} pts`;
      renderProfile(profile);
    } catch { /* offline */ }
  }

  function renderProfile(profile) {
    document.getElementById('profile-name').textContent    = profile.user_name;
    document.getElementById('profile-type').textContent    = profile.user_type;
    document.getElementById('profile-points').textContent  = profile.points;
    document.getElementById('profile-reports').textContent = profile.total_reports || 0;

    const container = document.getElementById('badges-container');
    container.innerHTML = '';
    if (profile.badges && profile.badges.length > 0) {
      profile.badges.forEach(b => {
        const el = document.createElement('div');
        el.className = 'badge-item';
        el.innerHTML = `${ICON('award')} <span title="${b.description}">${b.badge_name}</span>`;
        container.appendChild(el);
      });
    } else {
      container.innerHTML = '<p style="color:#888;font-size:.85rem">No badges yet. Start reporting!</p>';
    }
  }

  async function loadLeaderboard() {
    try {
      const { leaderboard } = await BioAPI.getLeaderboard();
      const list = document.getElementById('leaderboard-list');
      list.innerHTML = '';
      const medalColor = ['gold', 'silver', 'bronze'];
      leaderboard.forEach((u, i) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="lb-rank">${i < 3 ? ICON('medal', medalColor[i]) : (i + 1)}</span>
          <div style="flex:1">
            <div class="lb-name">${escapeHTML(u.user_name)}</div>
            <div class="lb-type">${u.user_type} · ${u.verified_count} sightings</div>
          </div>
          <span class="lb-pts">${u.points} pts</span>
        `;
        list.appendChild(li);
      });
    } catch { /* offline */ }
  }

  async function loadDashboard() {
    try {
      const [stats, helix] = await Promise.all([BioAPI.getDashboardStats(), BioAPI.getTripleHelix()]);
      document.getElementById('stat-total').textContent    = stats.totals.total_reports;
      document.getElementById('stat-verified').textContent = stats.totals.verified_reports;
      document.getElementById('stat-observers').textContent= stats.totals.total_observers;
      document.getElementById('stat-sdg14').textContent    = stats.sdg14.sdg14_count;

      const chartEl = document.getElementById('category-chart');
      chartEl.innerHTML = '';
      const max = Math.max(...stats.byCategory.map(c => c.count), 1);
      stats.byCategory.forEach(c => {
        const row = document.createElement('div');
        row.className = 'bar-row';
        const pct = Math.round((c.count / max) * 100);
        row.innerHTML = `
          <span class="bar-label">${c.category_name}</span>
          <div class="bar-fill" style="width:${pct}%"></div>
          <span class="bar-count">${c.count}</span>
        `;
        chartEl.appendChild(row);
      });

      const helixEl = document.getElementById('triple-helix');
      helixEl.innerHTML = `
        <div class="helix-card">
          <h4>Academic</h4>
          <p>${helix.academic.total_verified} verified</p>
          <p>${helix.academic.species_diversity_index} species</p>
        </div>
        <div class="helix-card">
          <h4>Community</h4>
          ${helix.community.map(u => `<p>${escapeHTML(u.user_name)}: ${u.points}pts</p>`).join('')}
        </div>
        <div class="helix-card">
          <h4>Government</h4>
          <p>SDG14: ${helix.government.sdg14_count}</p>
        </div>
      `;
    } catch { /* offline */ }
  }

  async function updatePendingCount() {
    const count = await BioDB.getPendingSightingCount();
    document.getElementById('pending-count').textContent = count;
  }

  async function syncPendingSightings() {
    const pending = await BioDB.getPendingSightings();
    if (pending.length === 0) return;
    try {
      const { results } = await BioAPI.syncBatch(pending);
      for (const r of results) {
        if (r.status === 'synced') await BioDB.markSightingSynced(r.local_id);
      }
      await updatePendingCount();
      await refreshPoints();
    } catch { /* still offline */ }
  }

  async function loadMyReports(status) {
    const list = document.getElementById('my-reports-list');
    if (!list) return;
    list.innerHTML = '<p style="color:#888;font-size:.85rem">Loading…</p>';
    try {
      const { sightings } = await BioAPI.getMyReports(status || '');
      list.innerHTML = '';
      if (!sightings.length) {
        list.innerHTML = '<p style="color:#888;font-size:.85rem">No records yet. Go report a sighting!</p>';
        return;
      }
      sightings.forEach(r => {
        const el = document.createElement('div');
        el.className = 'report-item';
        const date = new Date(r.timestamp).toLocaleString('en-MY', { dateStyle: 'short', timeStyle: 'short' });
        const photo = r.photo_url ? `<img src="${r.photo_url}" class="report-thumb" alt="" />` : '';
        el.innerHTML = `
          <div class="report-item-inner">
            ${photo}
            <div class="report-item-info">
              <strong>${escapeHTML(r.species_name || '—')}</strong>
              <small>${escapeHTML(r.category_name || '')} · ${date}</small>
              ${r.admin_comment ? `<small style="color:#888">Note: ${escapeHTML(r.admin_comment)}</small>` : ''}
            </div>
            <span class="status-${r.report_status}">${r.report_status}</span>
          </div>
        `;
        list.appendChild(el);
      });
    } catch { list.innerHTML = '<p style="color:#888;font-size:.85rem">Could not load records.</p>'; }
  }

  function escapeHTML(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { refreshPoints, loadLeaderboard, loadDashboard, updatePendingCount, syncPendingSightings, loadMyReports };
})();

window.BioGamification = BioGamification;
