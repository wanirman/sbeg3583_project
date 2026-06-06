/* IndexedDB wrapper for offline storage */
const DB_NAME = 'biodiversity_pwa';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('sighting_queue')) {
        const store = db.createObjectStore('sighting_queue', { keyPath: 'local_id', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains('chat_queue')) {
        db.createObjectStore('chat_queue', { keyPath: 'local_id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('geocache')) {
        db.createObjectStore('geocache', { keyPath: 'query' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

async function queueSighting(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sighting_queue', 'readwrite');
    const req = tx.objectStore('sighting_queue').add({ ...data, status: 'pending', queued_at: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getPendingSightings() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sighting_queue', 'readonly');
    const req = tx.objectStore('sighting_queue').index('status').getAll('pending');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function markSightingSynced(local_id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sighting_queue', 'readwrite');
    const store = tx.objectStore('sighting_queue');
    const req = store.get(local_id);
    req.onsuccess = () => {
      const record = req.result;
      if (record) { record.status = 'synced'; store.put(record); }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

async function getPendingSightingCount() {
  const pending = await getPendingSightings();
  return pending.length;
}

async function queueChatMessage(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chat_queue', 'readwrite');
    const req = tx.objectStore('chat_queue').add({ ...data, queued_at: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllChatQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chat_queue', 'readonly');
    const req = tx.objectStore('chat_queue').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function clearChatQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chat_queue', 'readwrite');
    const req = tx.objectStore('chat_queue').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getCachedGeocode(query) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('geocache', 'readonly');
    const req = tx.objectStore('geocache').get(query);
    req.onsuccess = () => resolve(req.result?.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function setCachedGeocode(query, result) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('geocache', 'readwrite');
    const req = tx.objectStore('geocache').put({ query, result, cached_at: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

window.BioDB = { queueSighting, getPendingSightings, markSightingSynced, getPendingSightingCount, queueChatMessage, getAllChatQueue, clearChatQueue, getCachedGeocode, setCachedGeocode };
