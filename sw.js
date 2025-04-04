// Service Worker for Nut Launcher Game
// Version 1.1.0

const CACHE_NAME = 'nut-launcher-cache-v1.1.0';
const GAME_VERSION = '1.1.0';

// Files to cache - add other resources as needed
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './game.js'
];

// Install event - cache essential files
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install');
  
  // Force this service worker to become active
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate');
  
  // Take control of all clients
  event.waitUntil(self.clients.claim());
  
  // Remove old caches
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - handle network requests
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Parse the URL
  const requestURL = new URL(event.request.url);
  
  // Handle game.js specifically - always go to network first
  if (requestURL.pathname.endsWith('game.js')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If successful, clone and cache
          let responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          return response;
        })
        .catch(error => {
          // If fetch fails, try the cache
          console.log('[ServiceWorker] Fetch failed, falling back to cache', error);
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // For other resources, use "network first" strategy
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache the response for future
        let responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });
        return response;
      })
      .catch(error => {
        // When network fails, use the cache
        console.log('[ServiceWorker] Fetch failed, falling back to cache', error);
        return caches.match(event.request);
      })
  );
});

// Listen for version change messages from the main page
self.addEventListener('message', event => {
  if (event.data.action === 'clearCache') {
    console.log('[ServiceWorker] Clearing cache by request');
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
    });
  }
}); 