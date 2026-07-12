/**
 * sw.js — Service Worker per Push Notification Ads.
 *
 * QUANDO TI REGISTRI SU ADSTERRA (o network simile):
 *   1. Ti daranno un file sw.js specifico per la tua campagna
 *   2. Sostituisci QUESTO file con quello che ti danno loro
 *   3. Il loro sw.js conterrà il codice per ricevere e mostrare
 *      le notifiche pubblicitarie
 *
 * Questo è un placeholder minimale per permettere la registrazione
 * del service worker. Le notifiche funzioneranno SOLO dopo aver
 * sostituito questo file con quello della tua campagna push.
 */

self.addEventListener('install', function (event) {
  console.log('[SW] Install');
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  console.log('[SW] Activate');
});

self.addEventListener('push', function (event) {
  // Placeholder — il network push sostituirà questo handler
  // con il loro codice personalizzato per mostrare le notifiche
  console.log('[SW] Push event received');
});
