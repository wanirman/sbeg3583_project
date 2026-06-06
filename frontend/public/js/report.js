/* Report form logic — GPS, photo compression, submit, offline queue */
const BioReport = (() => {
  let compressedBlob = null;

  async function init() {
    await loadCategories();
    attachListeners();
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
    } catch { /* offline — categories won't load */ }
  }

  function attachListeners() {
    document.getElementById('report-category').addEventListener('change', onCategoryChange);
    document.getElementById('btn-get-gps').addEventListener('click', getGPS);
    document.getElementById('report-photo').addEventListener('change', onPhotoSelected);
    document.getElementById('report-form').addEventListener('submit', onSubmit);
    document.getElementById('report-placename').addEventListener('blur', onPlacenameBlur);
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
    btn.textContent = '⏳';
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        document.getElementById('report-lat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('report-lng').value = pos.coords.longitude.toFixed(6);
        btn.textContent = '✅';
        btn.disabled = false;
        BioMap.panTo(pos.coords.latitude, pos.coords.longitude);
      },
      err => {
        alert('Could not get GPS location: ' + err.message);
        btn.textContent = '📍 GPS';
        btn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
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
      await BioDB.queueSighting({ category_id, species_id, latitude: lat, longitude: lng, notes, timestamp: new Date().toISOString() });
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
        success.textContent = '✅ Sighting submitted! +10 points';
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
    document.getElementById('photo-preview').classList.add('hidden');
    document.getElementById('photo-placeholder').classList.remove('hidden');
    document.getElementById('report-species').innerHTML = '<option value="">Select species</option>';
  }

  return { init };
})();

window.BioReport = BioReport;
