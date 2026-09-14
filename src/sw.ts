/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  createHandlerBoundToURL,
  getCacheKeyForURL,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const manifest = self.__WB_MANIFEST;
precacheAndRoute(manifest);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
  if (event.data?.type === 'CHECK_OFFLINE') {
    event.waitUntil(
      (async () => {
        const present = await Promise.all(
          manifest.map(async (entry) => {
          const key = getCacheKeyForURL(typeof entry === 'string' ? entry : entry.url);
            return key ? !!(await caches.match(key)) : false;
          }),
        );
        event.ports[0]?.postMessage({ ready: present.length > 0 && present.every(Boolean) });
      })(),
    );
  }
});
