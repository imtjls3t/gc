import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
const offlineSupported = window.isSecureContext && 'serviceWorker' in navigator;
let registration: ServiceWorkerRegistration | undefined;
let ready = false,
  update = false,
  install: InstallEvent | undefined,
  failed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const showUpdate = () => {
  update = true;
  notify();
};
let checkingUpdate = false;
async function checkForUpdate() {
  if (!registration || document.hidden || !navigator.onLine || checkingUpdate) return;
  checkingUpdate = true;
  try {
    await registration.update();
    if (registration.waiting) showUpdate();
  } catch {
    // Keep the cached app usable if the network or update server is unavailable.
  } finally {
    checkingUpdate = false;
  }
}
async function checkOffline() {
  const active = registration?.active;
  if (!active) return;
  const channel = new MessageChannel();
  const timer = setTimeout(() => {
    channel.port1.close();
    ready = false;
    notify();
  }, 15_000);
  channel.port1.onmessage = (event) => {
    clearTimeout(timer);
    channel.port1.close();
    ready = event.data.ready === true;
    notify();
  };
  active.postMessage({ type: 'CHECK_OFFLINE' }, [channel.port2]);
}
if (offlineSupported)
  registerSW({
    // Reloads are controlled below, only after this tab's explicit acceptance.
    onNeedReload() {},
    onNeedRefresh: showUpdate,
    onOfflineReady() {
      void checkOffline();
    },
    onRegisteredSW(_url, reg) {
      registration = reg;
      if (reg?.waiting) showUpdate();
      void navigator.serviceWorker.ready.then(() => checkOffline());
      const trackInstall = () => {
        const installing = reg?.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && reg?.active) showUpdate();
          if (installing.state === 'redundant' && !reg?.active) {
            failed = true;
            notify();
          }
          if (reg?.active) void checkOffline();
        });
      };
      trackInstall();
      reg?.addEventListener('updatefound', trackInstall);
      void checkForUpdate();
      setInterval(() => void checkForUpdate(), 60_000);
    },
    onRegisterError() {
      failed = true;
      notify();
    },
  });
if (offlineSupported) {
  let controller = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const next = navigator.serviceWorker.controller;
    // Another tab may activate an update while this tab still runs older app code.
    if (controller && next !== controller) showUpdate();
    controller = next;
    void checkOffline();
  });
}
window.addEventListener('online', () => void checkForUpdate());
window.addEventListener('focus', () => void checkForUpdate());
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  install = event as InstallEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  install = undefined;
  notify();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void checkOffline();
    void checkForUpdate();
  }
});
export function usePWA() {
  const [, render] = useState(0);
  useEffect(() => {
    const listener = () => render((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {
    offlineSupported,
    ready,
    update,
    failed,
    canInstall: !!install,
    acceptUpdate: async () => {
      const waiting = registration?.waiting;
      if (!waiting) {
        location.reload();
        return;
      }
      // Workbox can classify a fast second install as external rather than an update.
      // Watch the browser's actual handover so accepting works in either case.
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
        once: true,
      });
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
    install: async () => {
      if (install) {
        await install.prompt();
        await install.userChoice;
        install = undefined;
        notify();
      }
    },
    retry: async () => {
      if (!offlineSupported) return;
      failed = false;
      notify();
      if (registration) {
        await registration.update();
        await checkOffline();
      } else location.reload();
    },
  };
}
