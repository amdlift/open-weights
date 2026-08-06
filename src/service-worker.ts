/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

/**
 * A deliberately small service worker.
 *
 * It makes the app installable and keeps the shell loading instantly, and that
 * is all. It never caches a page or an API response: those are per-user, and on
 * a shared phone a stale cached page from the previous account is a real
 * problem. Offline *logging* would need a write queue and conflict handling —
 * out of scope for v1, and worse than useless if done halfway.
 */

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `openweights-${version}`;
/** Hashed build output plus everything in static/ — all immutable per version. */
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	// A new deployment gets a new cache name; drop every older one so an upgrade
	// never leaves the previous release's JavaScript behind.
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);
	if (url.origin !== location.origin) return;

	// Only the precached, content-addressed assets are served from the cache.
	// Everything else — pages, form posts, API reads — goes to the network.
	if (!ASSETS.includes(url.pathname)) return;

	event.respondWith(
		caches.match(event.request).then((cached) => cached ?? fetch(event.request))
	);
});
