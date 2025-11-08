const CACHE_NAME = 'channel-player-cache-v1';
const MAX_CACHE_SIZE = 200; // Número máximo de segmentos de vídeo a serem mantidos em cache.

// Lista de recursos essenciais da aplicação para cachear na instalação.
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  'https://cdn.jsdelivr.net/npm/hls.js@latest',
  'https://cdn.jsdelivr.net/npm/mpegts.js/dist/mpegts.min.js'
];

// 1. Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Cacheando App Shell e recursos principais.');
      return cache.addAll(APP_SHELL_URLS);
    })
  );
});

// 2. Ativação do Service Worker e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Limpando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Função para gerenciar o tamanho do cache
async function manageCache(cache) {
  const keys = await cache.keys();
  // Filtra para manter apenas segmentos de vídeo na contagem de limpeza
  const videoSegmentKeys = keys.filter(req => req.url.endsWith('.ts') || req.url.endsWith('.m3u8'));
  
  while (videoSegmentKeys.length > MAX_CACHE_SIZE) {
    // Remove o item mais antigo (primeiro da lista)
    const keyToDelete = videoSegmentKeys.shift(); 
    console.log(`[Service Worker] Limite de cache atingido. Removendo item antigo: ${keyToDelete.url}`);
    await cache.delete(keyToDelete);
  }
}

// 3. Interceptação de requisições (Fetch)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Estratégia de cache para segmentos de vídeo (HLS/MPEG-TS)
  if (url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.ts')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          // Se estiver no cache, retorna imediatamente.
          return cachedResponse;
        }
        // Se não, busca na rede, adiciona ao cache e retorna.
        const networkResponse = await fetch(request);
        // Clona a resposta para poder ser usada pelo cache e pelo navegador.
        cache.put(request, networkResponse.clone());
        await manageCache(cache); // Verifica e limpa o cache se necessário.
        return networkResponse;
      })
    );
  } else {
    // Para outros recursos (como o App Shell), usa a estratégia "Cache First".
    event.respondWith(
      caches.match(request).then((response) => {
        return response || fetch(request);
      })
    );
  }
});