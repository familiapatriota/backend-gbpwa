const CACHE_NAME = 'guriri-beach-v1';
// Lista de todos os arquivos essenciais para o app funcionar offline.
// Usamos './' para garantir que os caminhos sejam relativos à raiz do site.
const urlsToCache = [
  './login.html',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  // Espera a instalação terminar antes de prosseguir.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto, adicionando arquivos essenciais.');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // Intercepta todas as requisições de rede.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se o arquivo estiver no cache, retorna ele.
        // Se não, busca na rede.
        return response || fetch(event.request);
      })
  );
});