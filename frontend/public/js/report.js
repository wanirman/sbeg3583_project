/* Report form logic — GPS, photo compression, submit, offline queue */
const BioReport = (() => {
  let compressedBlob = null;
  let searchTimer = null;
  let currentSuggestions = [];
  const ICON = (n, c = '') => `<svg class="icon ${c}"><use href="#i-${n}"></use></svg>`;

  async function init() {
    await loadCategories();
    attachListeners();
    warmReferenceCache();
  }

  async function loadCategories() {
    try {
      const { categories } = await BioAPI.getCategories();
      const sel = document.getElementById('report-category');
      categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.category_id;
        opt.textContent = c.category_name;
        sel.appendChild(opt);
      });
    } catch { /* offline — categories come from cache via the API layer */ }
  }

  // Pre-fetch the species list for every category while online so the whole
  // report form (category → species) keeps working offline-first.
  async function warmReferenceCache() {
    if (!navigator.onLine) return;
    const sel = document.getElementById('report-category');
    const ids = [...sel.options].map(o => o.value).filter(Boolean);
    for (const id of ids) {
      try { await BioAPI.getSpecies(id); } catch { /* ignore — best effort */ }
    }
  }

  function attachListeners() {
    document.getElementById('report-category').addEventListener('change', onCategoryChange);
    document.getElementById('btn-get-gps').addEventListener('click', getGPS);
    document.getElementById('report-photo').addEventListener('change', onPhotoSelected);
    document.getElementById('report-form').addEventListener('submit', onSubmit);
    document.getElementById('report-placename').addEventListener('blur', onPlacenameBlur);
    document.getElementById('taxa-search-input').addEventListener('input', onTaxaInput);
    document.getElementById('btn-identify').addEventListener('click', onIdentify);
    // Close the suggestions dropdown when clicking outside it
    document.addEventListener('click', e => {
      if (!e.target.closest('.taxa-search')) hideSuggestions();
    });
  }

  /* ── iNaturalist species autocomplete ── */
  function onTaxaInput(e) {
    const q = e.target.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) { hideSuggestions(); return; }
    searchTimer = setTimeout(() => doTaxaSearch(q), 350);
  }

  async function doTaxaSearch(q) {
    if (!navigator.onLine) return;
    try {
      currentSuggestions = await BioAPI.searchTaxa(q);
      renderSuggestions();
    } catch { hideSuggestions(); }
  }

  function renderSuggestions() {
    const box = document.getElementById('taxa-suggestions');
    if (!currentSuggestions.length) { hideSuggestions(); return; }
    box.innerHTML = '';
    currentSuggestions.forEach((t, i) => {
      const item = document.createElement('div');
      item.className = 'taxa-item';
      const thumb = t.default_photo_url
        ? `<img src="${t.default_photo_url}" class="taxa-thumb" alt="" />`
        : `<div class="taxa-thumb taxa-thumb-empty">${ICON('search')}</div>`;
      item.innerHTML = `
        ${thumb}
        <div class="taxa-item-text">
          <strong>${escapeHTML(t.species_name)}</strong>
          <small><em>${escapeHTML(t.scientific_name)}</em>${t.iconic_taxon_name ? ` · ${escapeHTML(t.iconic_taxon_name)}` : ''}</small>
        </div>
      `;
      item.addEventListener('click', () => pickTaxon(i));
      box.appendChild(item);
    });
    box.classList.remove('hidden');
  }

  function hideSuggestions() {
    const box = document.getElementById('taxa-suggestions');
    if (box) box.classList.add('hidden');
  }

  async function pickTaxon(index) {
    const taxon = currentSuggestions[index];
    if (!taxon) return;
    hideSuggestions();
    document.getElementById('taxa-search-input').value = taxon.species_name;
    try {
      const resolved = await BioAPI.resolveSpecies(taxon);
      applyResolvedSpecies(resolved);
    } catch (e) {
      alert('Could not set species: ' + (e.message || 'error'));
    }
  }

  // Add an <option> to a <select> if it isn't already present
  function ensureOption(select, value, label) {
    if (![...select.options].some(o => o.value === String(value))) {
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = label;
      select.appendChild(opt);
    }
  }

  // Fill the category + species selects from a resolved (local) species record
  function applyResolvedSpecies(r) {
    const catSel = document.getElementById('report-category');
    const spSel  = document.getElementById('report-species');
    ensureOption(catSel, r.category_id, r.category_name || 'Category');
    catSel.value = r.category_id;
    const label = r.species_name + (r.scientific_name ? ` (${r.scientific_name})` : '');
    ensureOption(spSel, r.species_id, label);
    spSel.value = r.species_id;

    const success = document.getElementById('report-success');
    success.innerHTML = `${ICON('circle-check')} Selected: ${escapeHTML(r.species_name)}`;
    success.classList.remove('hidden');
    setTimeout(() => success.classList.add('hidden'), 2500);
  }

  /* ── iNaturalist photo identification ── */
  async function onIdentify() {
    if (!compressedBlob) { alert('Please choose a photo first.'); return; }
    if (!navigator.onLine) { alert('Photo ID needs an internet connection.'); return; }
    const btn = document.getElementById('btn-identify');
    const box = document.getElementById('identify-results');
    btn.disabled = true; btn.innerHTML = `${ICON('refresh-cw', 'spin')} Identifying…`;
    box.classList.add('hidden');

    const lat = document.getElementById('report-lat').value;
    const lng = document.getElementById('report-lng').value;
    try {
      const { suggestions } = await BioAPI.identifyPhoto(compressedBlob, lat, lng);
      renderIdentifyResults(suggestions || []);
    } catch (e) {
      box.classList.remove('hidden');
      box.innerHTML = `<p class="field-hint" style="color:#c0392b">${escapeHTML(e.message || 'Identification failed.')}</p>`;
    }
    btn.disabled = false; btn.innerHTML = `${ICON('search')} Identify species from this photo`;
  }

  function renderIdentifyResults(suggestions) {
    const box = document.getElementById('identify-results');
    box.classList.remove('hidden');
    if (!suggestions.length) {
      box.innerHTML = '<p class="field-hint">No confident matches. Try a clearer photo or search by name.</p>';
      return;
    }
    box.innerHTML = '<p class="field-hint">Top matches — tap to use:</p>';
    suggestions.forEach((s, i) => {
      const item = document.createElement('div');
      item.className = 'taxa-item';
      const thumb = s.default_photo_url
        ? `<img src="${s.default_photo_url}" class="taxa-thumb" alt="" />`
        : `<div class="taxa-thumb taxa-thumb-empty">${ICON('camera')}</div>`;
      item.innerHTML = `
        ${thumb}
        <div class="taxa-item-text">
          <strong>${escapeHTML(s.species_name)}</strong>
          <small><em>${escapeHTML(s.scientific_name)}</em></small>
        </div>
        <span class="taxa-score">${s.score || ''}</span>
      `;
      // Reuse the resolve flow by stashing into currentSuggestions
      item.addEventListener('click', async () => {
        try {
          const resolved = await BioAPI.resolveSpecies(s);
          applyResolvedSpecies(resolved);
          box.classList.add('hidden');
        } catch (e) { alert('Could not set species: ' + (e.message || 'error')); }
      });
      box.appendChild(item);
    });
  }

  function escapeHTML(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  async function onCategoryChange(e) {
    const category_id = e.target.value;
    const speciesSel = document.getElementById('report-species');
    speciesSel.innerHTML = '<option value="">Select species</option>';
    if (!category_id) return;
    try {
      const { species } = await BioAPI.getSpecies(category_id);
      species.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.species_id;
        opt.textContent = s.species_name + (s.scientific_name ? ` (${s.scientific_name})` : '');
        speciesSel.appendChild(opt);
      });
    } catch { /* offline */ }
  }

  function getGPS() {
    if (!navigator.geolocation) {
      alert('Geolocation not supported by your browser.');
      return;
    }
    const btn = document.getElementById('btn-get-gps');
    btn.innerHTML = ICON('refresh-cw', 'spin');
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        document.getElementById('report-lat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('report-lng').value = pos.coords.longitude.toFixed(6);
        btn.innerHTML = ICON('check');
        btn.disabled = false;
        BioMap.panTo(pos.coords.latitude, pos.coords.longitude);
      },
      err => {
        alert('Could not get GPS location: ' + err.message + '\nTip: outdoors with a clear sky view, GPS works even without internet — it may just take a few seconds.');
        btn.innerHTML = `${ICON('map-pin')} GPS`;
        btn.disabled = false;
      },
      // Longer timeout + accept a recent fix: offline (no A-GPS) the first lock can be slow.
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    );
  }

  function onPhotoSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file).then(blob => {
      compressedBlob = blob;
      const url = URL.createObjectURL(blob);
      const preview = document.getElementById('photo-preview');
      const placeholder = document.getElementById('photo-placeholder');
      preview.src = url;
      preview.classList.remove('hidden');
      placeholder.classList.add('hidden');
      document.getElementById('btn-identify').classList.remove('hidden');
    });
  }

  function compressImage(file) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(resolve, 'image/jpeg', 0.75);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  }

  async function onPlacenameBlur(e) {
    const query = e.target.value.trim();
    if (!query) return;
    try {
      const result = await BioAPI.geocodePlacename(query);
      if (result) {
        document.getElementById('report-lat').value = result.lat.toFixed(6);
        document.getElementById('report-lng').value = result.lng.toFixed(6);
        BioMap.panTo(result.lat, result.lng);
      }
    } catch { /* offline, skip */ }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const err = document.getElementById('report-error');
    const success = document.getElementById('report-success');
    const btn = document.getElementById('btn-submit-report');
    err.textContent = '';
    success.classList.add('hidden');

    const category_id = document.getElementById('report-category').value;
    const species_id  = document.getElementById('report-species').value;
    const lat         = document.getElementById('report-lat').value;
    const lng         = document.getElementById('report-lng').value;
    const notes       = document.getElementById('report-notes').value;

    if (!category_id || !species_id || !lat || !lng) {
      err.textContent = 'Please fill in category, species, and location.';
      return;
    }

    btn.textContent = 'Submitting…';
    btn.disabled = true;

    if (!navigator.onLine) {
      // Store the compressed photo blob too, so the sighting syncs complete (with image) later.
      await BioDB.queueSighting({ category_id, species_id, latitude: lat, longitude: lng, notes, photo: compressedBlob || null, timestamp: new Date().toISOString() });
      // Ask the SW for a background sync as soon as connectivity returns
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try { const reg = await navigator.serviceWorker.ready; await reg.sync.register('sync-sightings'); } catch { /* not supported */ }
      }
      success.textContent = 'Saved offline. Will sync when connected.';
      success.classList.remove('hidden');
      resetForm();
      BioGamification.updatePendingCount();
    } else {
      try {
        const fd = new FormData();
        fd.append('category_id', category_id);
        fd.append('species_id',  species_id);
        fd.append('latitude',    lat);
        fd.append('longitude',   lng);
        fd.append('notes',       notes);
        fd.append('timestamp',   new Date().toISOString());
        if (compressedBlob) fd.append('photo', compressedBlob, `photo_${Date.now()}.jpg`);

        const res = await BioAPI.submitSighting(fd);
        success.innerHTML = `${ICON('circle-check')} Sighting submitted! +10 points`;
        success.classList.remove('hidden');
        resetForm();
        BioMap.loadSightings();
        BioGamification.refreshPoints();
      } catch (ex) {
        if (ex.status === 401) {
          err.textContent = 'Session expired. Please login again.';
        } else {
          err.textContent = ex.message || 'Submission failed.';
        }
      }
    }

    btn.textContent = 'Submit Sighting';
    btn.disabled = false;
  }

  function resetForm() {
    document.getElementById('report-form').reset();
    compressedBlob = null;
    currentSuggestions = [];
    document.getElementById('photo-preview').classList.add('hidden');
    document.getElementById('photo-placeholder').classList.remove('hidden');
    document.getElementById('report-species').innerHTML = '<option value="">Select species</option>';
    document.getElementById('taxa-search-input').value = '';
    hideSuggestions();
    document.getElementById('btn-identify').classList.add('hidden');
    document.getElementById('identify-results').classList.add('hidden');
  }

  return { init };
})();

window.BioReport = BioReport;
