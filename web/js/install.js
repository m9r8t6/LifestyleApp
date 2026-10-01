/* =========================================================
 *  LifeOS — Install prompt  (install.js)
 *  Offers to put the app on the home screen the first time the
 *  website is opened in a browser. Android and desktop browsers
 *  install with one tap; on an iPhone the steps are shown,
 *  because Safari has no install button for websites to press.
 * ========================================================= */

(function() {
    'use strict';

    const DISMISSED_KEY = 'lifeosync_install_dismissed';   // stays on this device
    const REMIND_AFTER_DAYS = 14;

    const installed = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    function recentlyDismissed() {
        try {
            const at = Number(localStorage.getItem(DISMISSED_KEY)) || 0;
            return Date.now() - at < REMIND_AFTER_DAYS * 86400000;
        } catch (e) {
            return false;
        }
    }

    let deferredPrompt = null;

    function show(hint, withButton) {
        const banner = document.getElementById('install-banner');
        if (!banner || installed() || recentlyDismissed()) return;
        if (hint) document.getElementById('install-hint').textContent = hint;
        document.getElementById('install-accept').style.display = withButton ? '' : 'none';
        banner.classList.remove('hidden');
    }

    function hide(remember) {
        document.getElementById('install-banner')?.classList.add('hidden');
        if (remember) {
            try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch (e) {}
        }
    }

    // Chrome, Edge, Samsung Internet (Android and desktop) announce that the app can be installed
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        show(null, true);
    });

    window.addEventListener('appinstalled', () => hide(false));

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('install-accept')?.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            deferredPrompt = null;
            hide(choice.outcome !== 'accepted');
        });
        document.getElementById('install-dismiss')?.addEventListener('click', () => hide(true));

        // Safari on iPhone and iPad: explain the two taps
        if (isIOS() && !installed()) {
            const inSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
            show(inSafari
                ? 'Tap the Share button, then "Add to Home Screen".'
                : 'Open this page in Safari, tap Share, then "Add to Home Screen".', false);
        }
    });

    window.InstallPrompt = {
        /** For a manual "Install app" button: true if the browser prompt could be shown. */
        async trigger() {
            if (!deferredPrompt) return false;
            deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            deferredPrompt = null;
            hide(false);
            return choice.outcome === 'accepted';
        },
        get available() { return Boolean(deferredPrompt); },
        get installed() { return installed(); },
    };
})();
