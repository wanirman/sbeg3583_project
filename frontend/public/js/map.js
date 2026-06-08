/* Leaflet map initialisation and sighting overlay */
const BioMap = (() => {
  let map = null;
  let userMarker = null;
  let accuracyCircle = null;
  const DEFAULT_CENTER = [2.2, 102.2];   // Kg Sungai Timun area — fallback if location denied
  const DEFAULT_ZOOM   = 13;
  const categoryColors = { Birds: '#f9a825', Reptiles: '#e91e63', Plants: '#43a047', Aquatic: '#1e88e5' };

  function createMarkerIcon(categoryName) {
    const color = categoryColors[categoryName] || '#777';
    return L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  function init() {
    // Start at the fallback area, then recentre on the user's real location once allowed
    map = L.map('map', { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    addLocateControl();      // pin button under the +/- zoom buttons
    addDownloadControl();     // "save this area for offline" button
    loadSightings();
    locateUser();             // ask for current location and centre there
    return map;
  }

  /* ── Offline basemap: pre-cache the tiles for the current view ──
     Fetching each tile URL makes the service worker store it in TILE_CACHE,
     so the basemap still renders with no connection. */
  function lon2tile(lon, z) { return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
  function lat2tile(lat, z) {
    const r = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
  }

  function addDownloadControl() {
    const Ctrl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const c = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const a = L.DomUtil.create('a', '', c);
        a.href = '#';
        a.title = 'Save this map area for offline use';
        a.setAttribute('role', 'button');
        a.setAttribute('aria-label', 'Save map for offline');
        a.innerHTML = '<svg class="icon"><use href="#i-download"></use></svg>';
        L.DomEvent.on(a, 'click', L.DomEvent.stop);
        L.DomEvent.on(a, 'click', downloadOfflineArea);
        return c;
      },
    });
    map.addControl(new Ctrl());
  }

  function dlStatus() {
    let el = document.getElementById('offline-dl-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'offline-dl-status';
      el.className = 'offline-dl-status';
      el.hidden = true;
      document.getElementById('map').appendChild(el);
    }
    return el;
  }

  async function downloadOfflineArea() {
    if (!navigator.onLine) { alert('Connect to the internet first, then save the map for offline use.'); return; }
    if (!map) return;

    const b = map.getBounds();
    const z0   = Math.max(13, Math.round(map.getZoom()));
    const zMax = Math.min(17, z0 + 2);   // current view + 2 zoom levels deeper

    const tiles = [];
    for (let z = z0; z <= zMax; z++) {
      const xMin = lon2tile(b.getWest(),  z), xMax = lon2tile(b.getEast(),  z);
      const yMin = lat2tile(b.getNorth(), z), yMax = lat2tile(b.getSouth(), z);
      for (let x = xMin; x <= xMax; x++)
        for (let y = yMin; y <= yMax; y++)
          tiles.push({ z, x, y });
    }
    if (tiles.length > 3000 &&
        !confirm(`This will download ${tiles.length} map tiles. Zoom in to a smaller area for less. Continue?`)) return;

    const status = dlStatus();
    status.hidden = false;
    status.textContent = `Saving map… 0/${tiles.length}`;

    const queue = tiles.slice();
    let done = 0, failed = 0;
    const worker = async () => {
      while (queue.length) {
        const t = queue.shift();
        const s = 'abc'[Math.abs(t.x + t.y) % 3];           // match Leaflet's subdomain choice
        try { await fetch(`https://${s}.tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`, { mode: 'cors' }); }
        catch { failed++; }
        done++;
        if (done % 5 === 0 || done === tiles.length) status.textContent = `Saving map… ${done}/${tiles.length}`;
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));   // 6 parallel downloads

    status.textContent = `Map saved for offline (${tiles.length - failed}/${tiles.length} tiles).`;
    setTimeout(() => { status.hidden = true; }, 4000);
  }

  // A Leaflet control button (top-left, below the zoom control) that zooms to the user
  function addLocateControl() {
    const LocateCtrl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control locate-control');
        const link = L.DomUtil.create('a', '', container);
        link.href = '#';
        link.id = 'btn-locate';
        link.title = 'Zoom to my location';
        link.setAttribute('role', 'button');
        link.setAttribute('aria-label', 'Zoom to my location');
        link.innerHTML = '<svg class="icon"><use href="#i-map-pin"></use></svg>';
        L.DomEvent.on(link, 'click', L.DomEvent.stop);
        L.DomEvent.on(link, 'click', () => locateUser(17, true));
        return container;
      },
    });
    map.addControl(new LocateCtrl());
  }

  // Centre the map on the user's current GPS position and show a "you are here" marker.
  // `zoom` controls how close to zoom; when `animate` is true we fly there smoothly.
  function locateUser(zoom = 16, animate = false) {
    if (!navigator.geolocation || !map) return;
    const btn = document.getElementById('btn-locate');
    if (btn) btn.classList.add('locating');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        showUserLocation(lat, lng, accuracy);
        if (animate) map.flyTo([lat, lng], zoom, { duration: 1.1 });
        else map.setView([lat, lng], zoom);
        if (btn) btn.classList.remove('locating');
      },
      err => {
        console.warn('Geolocation unavailable, staying at default view:', err.message);
        if (btn) btn.classList.remove('locating');
        if (animate) alert('Could not get your location: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  // Draw/update the blue location dot and accuracy circle
  function showUserLocation(lat, lng, accuracy) {
    if (!map) return;
    const latlng = [lat, lng];

    if (userMarker) {
      userMarker.setLatLng(latlng);
    } else {
      userMarker = L.marker(latlng, {
        icon: L.divIcon({
          className: '',
          html: '<div class="user-loc-dot"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        zIndexOffset: 1000,
      }).addTo(map).bindPopup('You are here');
    }

    if (accuracy) {
      if (accuracyCircle) {
        accuracyCircle.setLatLng(latlng).setRadius(accuracy);
      } else {
        accuracyCircle = L.circle(latlng, {
          radius: accuracy, color: '#1e88e5', fillColor: '#1e88e5', fillOpacity: 0.12, weight: 1,
        }).addTo(map);
      }
    }
  }

  async function loadSightings() {
    try {
      const geojson = await BioAPI.getSightingsGeoJSON();
      if (!map) return;

      L.geoJSON(geojson, {
        pointToLayer: (feature, latlng) => {
          const icon = createMarkerIcon(feature.properties.category_name);
          return L.marker(latlng, { icon });
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          const photoHtml = p.photo_url ? `<img src="${p.photo_url}" style="width:100%;border-radius:6px;margin-top:.4rem" />` : '';
          layer.bindPopup(`
            <div style="min-width:160px">
              <strong>${p.species_name}</strong><br/>
              <small style="color:#777">${p.category_name}</small><br/>
              <small>By ${p.user_name}</small>
              ${photoHtml}
            </div>
          `);
        },
      }).addTo(map);
    } catch (e) {
      console.warn('Could not load sightings:', e.message);
    }
  }

  function panTo(lat, lng, zoom = 16) {
    if (map) map.setView([lat, lng], zoom);
  }

  function getMap() { return map; }

  return { init, loadSightings, panTo, getMap, locateUser };
})();

window.BioMap = BioMap;
