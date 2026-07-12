/**
 * monetization.js — Passive income layer for Chromatic Hub.
 *
 * Gestisce 3 metodi di monetizzazione in parallelo:
 *   1. POPUNDER ADS — si apre in background al primo click dell'utente
 *   2. PUSH NOTIFICATION ADS — chiede permesso notifiche, poi ricevi annunci
 *   3. OFFER WALL — ponte JavaScript per Godot (monete gratis → azioni pagate)
 *
 * COME ATTIVARE:
 *   1. Registrati su Adsterra (o network simile): https://publishers.adsterra.com
 *   2. Crea una campagna popunder → ottieni un link tipo "https://xyz.com/..."
 *   3. Crea una campagna push → ottieni un service worker ID
 *   4. Crea un offer wall → ottieni un link per offer wall
 *   5. Sostituisci i placeholder qui sotto con i tuoi link/ID
 *
 * Tutto funziona su GitHub Pages — nessun backend necessario.
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  CONFIGURAZIONE — sostituisci con i tuoi link da Adsterra
  // ═══════════════════════════════════════════════════════════════

  var CONFIG = {
    // 1) POPUNDER — link diretto della campagna popunder
    //    Su Adsterra: Campaigns → Crea Popunder → Copia "Click URL"
    popunderUrl: 'https://YOUR_POPUNDER_LINK.adsterra.com/...',

    // 2) PUSH NOTIFICATION — ID campagna push
    //    Su Adsterra: Push Notification → Crea campagna → Copia ID
    pushCampaignId: 'YOUR_PUSH_CAMPAIGN_ID',

    // 3) OFFER WALL — link diretto dell'offer wall
    //    Su Adsterra: Offerwall → Crea → Copia URL
    offerwallUrl: 'https://YOUR_OFFERWALL_LINK.adsterra.com/...',

    // Intervallo tra un popunder e l'altro (minimo secondi)
    popunderCooldown: 120,  // 2 minuti

    // Quante volte mostrare popunder per sessione (max)
    popunderMaxPerSession: 3,
  };

  // ═══════════════════════════════════════════════════════════════
  //  STATO
  // ═══════════════════════════════════════════════════════════════

  var _popunderLastShown = 0;
  var _popunderCount = 0;
  var _popunderReady = false;   // prima interazione utente
  var _popunderClicked = false; // già usato per questa sessione
  var _offerWallReady = false;

  // ═══════════════════════════════════════════════════════════════
  //  1) POPUNDER ADS
  // ═══════════════════════════════════════════════════════════════
  //  Si apre in background al primo click (dopo che il game engine
  //  è caricato). I browser moderni bloccano window.open se non
  //  è in risposta a un gesto dell'utente, per questo lo leghiamo
  //  a un click reale.

  function initPopunder() {
    console.log('[Monetization] Popunder ready');

    // Ascolta il primo click dell'utente dopo che il gioco è pronto
    var clickHandler = function (e) {
      if (_popunderClicked) return;
      _popunderClicked = true;

      // Aspetta 1.5 secondi prima del popunder (lascia caricare il gioco)
      setTimeout(function () {
        _tryPopunder();
      }, 1500);

      document.removeEventListener('click', clickHandler);
      document.removeEventListener('touchstart', clickHandler);
    };

    document.addEventListener('click', clickHandler);
    document.addEventListener('touchstart', clickHandler);

    // Esponi globalmente per Godot (richiamabile dal gioco)
    window.triggerPopunder = _tryPopunder;
  }

  function _tryPopunder() {
    var now = Date.now();

    // Limiti
    if (_popunderCount >= CONFIG.popunderMaxPerSession) return;
    if (now - _popunderLastShown < CONFIG.popunderCooldown * 1000) return;

    _popunderLastShown = now;
    _popunderCount++;

    // Apri in background (popunder)
    var win = window.open(CONFIG.popunderUrl, '_blank');
    if (win) {
      try {
        // Porta il focus indietro al gioco (l'utente non vede la nuova scheda)
        win.blur();
        window.focus();
      } catch (e) {
        // Fallback silenzioso
      }
      console.log('[Monetization] Popunder #' + _popunderCount);
    } else {
      // Bloccato da adblocker — silenzioso
      console.log('[Monetization] Popunder blocked');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  2) PUSH NOTIFICATION ADS
  // ═══════════════════════════════════════════════════════════════
  //  Registra un service worker e chiede il permesso per notifiche.
  //  Dopo l'ok, il network pubblicitario ti paga per ogni notifica
  //  recapitata (anche quando l'utente non è sul sito).

  function initPushNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.log('[Monetization] Push not supported');
      return;
    }

    // Non chiedere subito — aspetta che l'utente abbia interagito
    var pushPrompt = function () {
      if (Notification.permission !== 'default') return;

      Notification.requestPermission(function (permission) {
        if (permission === 'granted') {
          console.log('[Monetization] Push permission granted');
          _registerServiceWorker();
        }
      });

      document.removeEventListener('click', pushPrompt);
      document.removeEventListener('touchstart', pushPrompt);
    };

    // Chiedi dopo la prima interazione
    document.addEventListener('click', pushPrompt);
    document.addEventListener('touchstart', pushPrompt);
  }

  function _registerServiceWorker() {
    if (!navigator.serviceWorker) return;

    navigator.serviceWorker.register('sw.js')
      .then(function (reg) {
        console.log('[Monetization] SW registered');
        // Qui il network push di solito si integra con un worker
        // specifico — sostituisci sw.js con quello fornito da Adsterra
      })
      .catch(function (err) {
        console.log('[Monetization] SW registration failed:', err);
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  3) OFFER WALL (bridge per Godot)
  // ═══════════════════════════════════════════════════════════════
  //  Espone una funzione window.showOfferWall che Godot chiama
  //  tramite JavaScriptBridge. Quando l'utente clicca "Get Free
  //  Coins" nello shop, si apre l'offer wall.

  window.showOfferWall = function (callbackId) {
    console.log('[Monetization] Opening offer wall');

    // Crea un overlay con iframe per l'offer wall
    var overlay = document.createElement('div');
    overlay.id = 'offerwall-overlay';
    overlay.style.cssText = [
      'position: fixed; top: 0; left: 0; width: 100%; height: 100%;',
      'z-index: 999999;',
      'background: rgba(0,0,0,0.85);',
      'display: flex; justify-content: center; align-items: center;',
    ].join('');

    var iframe = document.createElement('iframe');
    iframe.src = CONFIG.offerwallUrl;
    iframe.style.cssText = [
      'width: 95%; height: 90%; max-width: 800px;',
      'border: none; border-radius: 12px;',
      'background: #fff;',
    ].join('');
    overlay.appendChild(iframe);

    // Bottone chiudi
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Close';
    closeBtn.style.cssText = [
      'position: absolute; top: 16px; right: 16px;',
      'padding: 10px 20px; background: #ff5e5b; color: #fff;',
      'border: none; border-radius: 8px; font-size: 16px;',
      'cursor: pointer; z-index: 1000000;',
    ].join('');
    closeBtn.onclick = function () {
      document.body.removeChild(overlay);
      // Notifica Godot che l'offer wall è stato chiuso
      if (window._godotOfferWallCallback) {
        window._godotOfferWallCallback(callbackId, 'closed');
      }
    };
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);
  };

  // ═══════════════════════════════════════════════════════════════
  //  INIZIALIZZAZIONE
  // ═══════════════════════════════════════════════════════════════

  // L'init avviene dopo che il DOM è pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  function _init() {
    console.log('[Monetization] Initializing...');
    initPopunder();
    initPushNotifications();
    // Offer wall è già esposto globalmente (window.showOfferWall)
    _offerWallReady = true;
    console.log('[Monetization] All layers ready');
  }

})();
