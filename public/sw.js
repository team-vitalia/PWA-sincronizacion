const CACHE_NAME = 'cosmobitacora-v1';
// Recursos esenciales para que la app abra sin internet
const ASSETS_TO_CACHE = [
  '/',
  'index.html',
  'styles.css',
  'app.js',
  'idb-helper.js',
  'manifest.json',
  'dispositivo.html', // <--- NUEVO
  'dispositivo.js',
    'icons/icon.svg' // Asegúrate de que esta ruta sea correcta
];

// Instalación: guarda los archivos en caché
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Archivos guardados en caché');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activación: limpia cachés antiguos si actualizas la versión
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Borrando caché antiguo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Fetch: Intercepta las peticiones. Si no hay red, busca en caché.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Devuelve el caché si existe, si no, hace la petición a la red
      return response || fetch(event.request);
    })
  );
});