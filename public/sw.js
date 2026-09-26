const STATIC_CACHE = 'fileworker-static-v1';
const STATIC_SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
const SHARE_DB = 'fileworker-share-target';
const SHARE_STORE = 'inbox';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('fileworker-static-') && name !== STATIC_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function isStaticAsset(pathname) {
  return pathname === '/manifest.webmanifest' ||
    pathname === '/icon-192.png' ||
    pathname === '/icon-512.png' ||
    /^\/assets\/[^/]+\.(?:js|css|svg|png|jpg|jpeg|webp|gif|woff2?)$/.test(pathname);
}

function isStaticResponse(response) {
  return response.ok && response.type === 'basic' &&
    !response.headers.has('set-cookie') &&
    !/\b(?:private|no-store)\b/i.test(response.headers.get('cache-control') || '');
}

async function serveStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isStaticResponse(response)) {
    try {
      await cache.put(request, response.clone());
    } catch (error) {
      console.warn('Static asset could not be cached', error);
    }
  }
  return response;
}

async function serveAppShell(request) {
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const cached = await caches.match('/', { cacheName: STATIC_CACHE });
    if (cached) return cached;
    throw error;
  }
  const contentType = response.headers.get('content-type') || '';
  if (isStaticResponse(response) && contentType.indexOf('text/html') !== -1) {
    try {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put('/', response.clone());
    } catch (error) {
      console.warn('App shell could not be cached', error);
    }
  }
  return response;
}

function openShareDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SHARE_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveShare(payload) {
  const db = await openShareDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(SHARE_STORE, 'readwrite');
      transaction.objectStore(SHARE_STORE).put(payload);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

function shareErrorResponse() {
  return new Response(
    '<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>FileWorker</title><body style="font:16px system-ui;padding:2rem;max-width:36rem;margin:auto"><h1>Share could not be opened</h1><p>The shared content could not be saved on this device. Please try again with a smaller file or free up storage.</p><a href="/">Open FileWorker</a></body></html>',
    { status: 507, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter((value) => value instanceof File);
    const id = createShareId();
    const value = (key) => {
      const item = form.get(key);
      return typeof item === 'string' ? item : '';
    };
    await saveShare({
      id,
      title: value('title'),
      text: value('text'),
      url: value('url'),
      files,
      createdAt: Date.now(),
    });
    const destination = files.length ? 'file' : 'clip';
    return Response.redirect(new URL(`/#/${destination}?share=${encodeURIComponent(id)}`, self.location.origin), 303);
  } catch (error) {
    console.error('Share target failed', error);
    return shareErrorResponse();
  }
}

function createShareId() {
  if (self.crypto && typeof self.crypto.randomUUID === 'function') {
    return self.crypto.randomUUID();
  }

  if (self.crypto && typeof self.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    self.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex = '';
    for (let index = 0; index < bytes.length; index += 1) {
      hex += (bytes[index] + 0x100).toString(16).slice(1);
    }
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(receiveShare(request));
    return;
  }

  // Only the known application shell and build assets enter Cache Storage.
  // All API calls and user file URLs continue directly to the network.
  if (request.method !== 'GET' || request.headers.has('authorization')) return;
  if (isStaticAsset(url.pathname)) {
    event.respondWith(serveStatic(request));
  } else if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith(serveAppShell(request));
  }
});
