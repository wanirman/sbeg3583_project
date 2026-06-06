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

    addLocateControl();   // pin button under the +/- zoom buttons
    loadSightings();
    locateUser();         // ask for current location and centre there
    return map;
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
