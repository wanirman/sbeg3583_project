/* API client — handles auth tokens and network requests */
const API_BASE = '/api';

const BioAPI = (() => {
  function getToken() { return localStorage.getItem('token'); }
  function setToken(t) { localStorage.setItem('token', t); }
  function clearToken() { localStorage.removeItem('token'); localStorage.removeItem('user'); }
  function getUser() { return JSON.parse(localStorage.getItem('user') || 'null'); }
  function setUser(u) { localStorage.setItem('user', JSON.stringify(u)); }

  async function request(method, path, body, isForm = false) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isForm && body) headers['Content-Type'] = 'application/json';

    const opts = { method, headers };
    if (body) opts.body = isForm ? body : JSON.stringify(body);

    const res = await fetch(API_BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, message: data.error || 'Request failed' };
    return data;
  }

  async function login(email, password) {
    const data = await request('POST', '/auth/login', { email, password });
    setToken(data.token);
    setUser({ user_id: data.user_id, user_name: data.user_name, user_type: data.user_type, points: data.points });
    return data;
  }

  async function register(user_name, email, password, user_type) {
    const data = await request('POST', '/auth/register', { user_name, email, password, user_type });
    setToken(data.token);
    setUser({ user_id: data.user_id, user_name: data.user_name, user_type: data.user_type, points: 0 });
    return data;
  }

  async function getProfile() {
    const data = await request('GET', '/auth/profile');
    setUser({ ...getUser(), ...data });
    return data;
  }

  async function updateEmail(new_email, current_password) {
    const data = await request('PATCH', '/auth/email', { new_email, current_password });
    if (data.token) setToken(data.token);            // refresh token (email claim changed)
    setUser({ ...getUser(), email: data.email });
    return data;
  }

  async function updatePassword(current_password, new_password) {
    return request('PATCH', '/auth/password', { current_password, new_password });
  }

  async function submitSighting(formData) {
    return request('POST', '/sighting', formData, true);
  }

  async function syncBatch(sightings) {
    return request('POST', '/sighting/sync', { sightings });
  }

  async function getSightingsGeoJSON() {
    return request('GET', '/sighting/geojson');
  }

  async function getCategories() {
    return request('GET', '/dashboard/categories');
  }

  async function getSpecies(category_id) {
    const q = category_id ? `?category_id=${category_id}` : '';
    return request('GET', `/dashboard/species${q}`);
  }

  async function getDashboardStats() {
    return request('GET', '/dashboard/stats');
  }

  async function getLeaderboard() {
    return request('GET', '/dashboard/leaderboard');
  }

  async function getTripleHelix() {
    return request('GET', '/dashboard/triple-helix');
  }

  async function getMyReports(status) {
    const q = status ? `?status=${status}` : '';
    return request('GET', `/sighting/my-reports${q}`);
  }

  async function getChatMessages(before) {
    const q = before ? `?before=${before}` : '';
    return request('GET', `/chat${q}`);
  }

  async function postChatMessage(message_text, sighting_ref_id = null) {
    return request('POST', '/chat', { message_text, sighting_ref_id, timestamp: new Date().toISOString() });
  }

  // ── iNaturalist integration ──
  // Species autocomplete — calls iNaturalist directly (keyless, CORS-enabled)
  async function searchTaxa(query) {
    if (!query || query.trim().length < 2) return [];
    const url = `https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(query)}&per_page=8&locale=en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('iNaturalist search failed');
    const data = await res.json();
    return (data.results || []).map(t => ({
      inat_taxon_id:     t.id,
      scientific_name:   t.name,
      species_name:      t.preferred_common_name || t.name,
      iconic_taxon_name: t.iconic_taxon_name,
      default_photo_url: t.default_photo?.square_url || '',
      rank:              t.rank,
    }));
  }

  // Bridge an iNaturalist taxon to a local species_id (find-or-create on the server)
  async function resolveSpecies(taxon) {
    return request('POST', '/external/resolve-species', taxon);
  }

  // Identify species from a photo via the backend CV proxy
  async function identifyPhoto(blob, lat, lng) {
    const fd = new FormData();
    fd.append('photo', blob, `id_${Date.now()}.jpg`);
    if (lat) fd.append('lat', lat);
    if (lng) fd.append('lng', lng);
    return request('POST', '/external/identify', fd, true);
  }

  async function geocodePlacename(query) {
    const cached = await BioDB.getCachedGeocode(query);
    if (cached) return cached;

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=my`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display_name: data[0].display_name };
      await BioDB.setCachedGeocode(query, result);
      return result;
    }
    return null;
  }

  return { getToken, setToken, clearToken, getUser, setUser, login, register, getProfile, updateEmail, updatePassword, submitSighting, syncBatch, getSightingsGeoJSON, getCategories, getSpecies, getDashboardStats, getLeaderboard, getTripleHelix, getMyReports, getChatMessages, postChatMessage, geocodePlacename, searchTaxa, resolveSpecies, identifyPhoto };
})();

window.BioAPI = BioAPI;
