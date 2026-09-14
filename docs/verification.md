# Verification record

Verified in this workspace on 2026-09-11 with Node.js 24 and Chromium 153 (Playwright), using synthetic screenshots and payment data.

- Production Vite build and TypeScript check: passed. The browser suite builds and serves the app at `/gc/` to exercise GitHub Pages subpaths.
- Unit tests: 37 passed. Covers cent arithmetic, partly used cards, conflicting / missing expiry, labelled and ambiguous PINs, leading zeros, transactional spending and card edits, preserved timestamps, concurrent overspending rejection, archive/restore, duplicate checks, and complete rollback on storage failure.
- Browser tests: 6 passed. Includes actual local English OCR and ZXing WASM while offline, regenerated barcode verification, original image hash preservation, checkout rotation and PIN handling, spending edits/deletion, manual crops, multiple codes, duplicate/cancel review, the fixed add button in both orientations, storage rollback, mocked wake-lock lifecycle / fullscreen denial, missing-cache detection, and service-worker update acceptance with data preservation.
- The complete browser flow checks outgoing requests: only same-origin static GETs, no upload bodies. Console output contains none of the synthetic PIN or barcode values.
- The 56 × 56 add button stayed at 16 pixels from the viewport’s right and bottom edges in portrait and landscape, while the final card’s actions remained above it at the end of the list. Safe-area insets are included in CSS; real cutouts still need device testing.
- Source formatting: Prettier check passed.

Fixed during verification: conflicting expiry lines; accessible form / install labels; and an update handover case where Workbox classified a rapid second installation as external and did not reload after acceptance. Reload now follows the service-worker controller change after the user accepts.

Not verified here: an installed Android app, actual hardware autorotation / brightness / wake-lock behavior, physical barcode scanning, or cashier acceptance. See [device checks](device-checks.md).

## HTTP LAN compatibility follow-up

After a phone import exposed the missing `crypto.subtle.digest` API on HTTP, added a bundled SHA-256 fallback and UUID v4 generation through `crypto.getRandomValues`. Fingerprints match the HTTPS/native implementation, and both card and spending saves work without `crypto.randomUUID`.

All 48 unit tests and 7 browser scenarios pass. The new browser test uses an actual insecure HTTP origin and confirms SubtleCrypto and randomUUID are absent before testing real OCR import, save, barcode display, PIN reveal, spending, reload, and duplicate detection. HTTP previews now show **Online only** and explain that installation/offline support still requires HTTPS.

## Barcode Back navigation follow-up

Production build and all 9 browser scenarios pass. Browser Back now returns from checkout to the wallet (or archived tab), including entry from card details, direct barcode URLs, reloads, and returning from the original screenshot. The in-app exit button traverses back to that wallet entry. Exiting fullscreen through the browser also closes checkout; the in-app fullscreen toggle keeps the barcode open.

Regression checks cover browser Back/Forward, PIN masking after return, wake-lock release on Back, fullscreen exit events, and screenshot navigation without an extra image entry on Back. The fullscreen exit event is exercised in Chromium; the physical Android Back button/gesture remains in the device acceptance checks.

## Security and GitHub Pages deployment follow-up

On 2026-09-13, the complete release suite passed with 48 unit tests and 13 browser scenarios. The current npm advisory scan reported zero known vulnerabilities. Release checks confirmed 24 exact direct dependency versions, immutable GitHub Action references, and an allowlisted 23-file Pages artifact.

The public repository is [imtjls3t/gc](https://github.com/imtjls3t/gc), and GitHub Actions deployed [Giftcards](https://imtjls3t.github.io/gc/) with HTTPS enforced. Both build and deploy checks completed successfully without annotations.

An isolated browser check against the live HTTPS site confirmed the `/gc/` manifest and service-worker scope, **Ready offline**, local OCR import, verified barcode display, Back navigation, and offline reload. All HTTP requests were same-origin static GETs with no request bodies. The synthetic card used for this check existed only in the temporary browser profile.
