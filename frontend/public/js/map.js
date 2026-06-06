/* Leaflet map initialisation and sighting overlay */
const BioMap = (() => {
  let map = null;
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
    map = L.map('map', { zoomControl: true }).setView([2.2, 102.2], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    loadSightings();
    return map;
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

  return { init, loadSightings, panTo, getMap };
})();

window.BioMap = BioMap;
