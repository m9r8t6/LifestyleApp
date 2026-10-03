/* =========================================================
 *  LifeOS — Barcode scanner  (scanner.js)
 *  Reads the barcode of a product with the phone camera.
 *  Browsers without built-in barcode reading (iPhone Safari)
 *  get a field to type the number under the barcode instead.
 * ========================================================= */

window.Scanner = (() => {
    'use strict';

    const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
    const canDetect = () => 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

    /** Opens the scanner. Resolves with the digits of the barcode, or null when cancelled. */
    function scan() {
        return new Promise(resolve => {
            const overlay = document.getElementById('scanner-overlay');
            const video = document.getElementById('scanner-video');
            const hint = document.getElementById('scanner-hint');
            const input = document.getElementById('scanner-code');
            const frame = document.getElementById('scanner-frame');
            let stream = null;
            let timer = null;
            let done = false;

            const finish = (code) => {
                if (done) return;
                done = true;
                clearInterval(timer);
                if (stream) stream.getTracks().forEach(track => track.stop());
                video.srcObject = null;
                overlay.classList.add('hidden');
                resolve(code);
            };

            const submitTyped = () => {
                const digits = input.value.replace(/\D/g, '');
                if (digits.length < 8 || digits.length > 14) {
                    hint.textContent = 'A barcode number has 8 to 14 digits.';
                    return;
                }
                finish(digits);
            };

            input.value = '';
            document.getElementById('scanner-cancel').onclick = () => finish(null);
            document.getElementById('scanner-use').onclick = submitTyped;
            input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); submitTyped(); } };
            overlay.classList.remove('hidden');

            if (!canDetect()) {
                frame.classList.add('hidden');
                hint.textContent = 'This browser cannot read barcodes with the camera. Type the number printed under the barcode.';
                input.focus();
                return;
            }

            frame.classList.remove('hidden');
            hint.textContent = 'Hold the barcode inside the frame.';
            navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
                .then(async (media) => {
                    if (done) { media.getTracks().forEach(track => track.stop()); return; }
                    stream = media;
                    video.srcObject = media;
                    await video.play().catch(() => {});
                    const detector = new BarcodeDetector({ formats: FORMATS });
                    timer = setInterval(async () => {
                        if (video.readyState < 2) return;
                        try {
                            const found = await detector.detect(video);
                            const code = found.map(f => f.rawValue).find(v => /^\d{8,14}$/.test(v));
                            if (code) {
                                if (navigator.vibrate) navigator.vibrate(60);
                                finish(code);
                            }
                        } catch (e) { /* a frame that could not be read; try the next one */ }
                    }, 250);
                })
                .catch(() => {
                    frame.classList.add('hidden');
                    hint.textContent = 'The camera is not available (permission denied?). Type the number printed under the barcode.';
                    input.focus();
                });
        });
    }

    return { scan };
})();
