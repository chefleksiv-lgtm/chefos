// ChefOS service worker (v2.7): офлайн-режим.
// Статика — network-first с кэш-фолбэком (свежий код при сети, работа без сети).
// /api/* — только сеть, не кэшируем.
const CACHE = 'chefos-shell-v1';
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()).catch(() => {})
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim()).catch(() => {})
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) return; // API — только сеть
    e.respondWith(
        fetch(e.request).then(resp => {
            if (resp && resp.ok) {
                const copy = resp.clone();
                caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
            }
            return resp;
        }).catch(() => caches.match(e.request).then(hit => hit || caches.match('/index.html')))
    );
});
