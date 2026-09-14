# Giftcards

A personal gift-card wallet for Android Chrome. Import screenshots, display payment barcodes, and track balances and spending in CAD. Card details, PINs, screenshots, and spending history are stored in the browser on your device.

The app uses React, TypeScript, Vite, Dexie, Tesseract.js, ZXing WASM, and `vite-plugin-pwa`. It runs as a static site and needs no backend or account.

Dependency versions are pinned in `package.json` and `package-lock.json`. See the [security audit](docs/security-audit.md) for findings, fixes, and deployment constraints.

## Use the wallet

### Add a card

Tap the floating **+** button to select a PNG, JPEG, or WebP screenshot, up to 25 MB. Recognition runs locally using English OCR and barcode decoding.

Review the retailer, original amount, starting balance, PIN, expiry, and payment barcode before saving:

- Costco and Starbucks are recognized and have bundled logos. Other retailers can be entered manually and use an initials badge.
- Starting balance defaults to the original amount. Change it for a partly used card.
- **No expiry** is selected when no clear expiry date is recognized. A detected date fills in automatically. You can choose a specific date or **Not recorded / unknown** instead.
- PINs are optional text values, preserving leading zeros. They can be corrected or removed.
- If several barcodes are found, select the payment barcode. If recognition fails, crop the screenshot or use the full image and enter the card details manually.
- A possible duplicate produces a warning before saving.

The original screenshot is preserved unchanged.

### Display a barcode

Tap a card to open checkout. The barcode appears on white with its readable number when available. Costco cards also show [assets/costco.png](assets/costco.png) above the barcode.

The layout follows phone orientation. Use **Rotate** when rotation is locked, and increase screen brightness manually. Fullscreen and screen wake lock are requested where supported.

The phone's Back button or gesture returns to the wallet, including when it exits fullscreen. Archived cards return to the archived tab. The in-app fullscreen toggle lets you leave fullscreen while keeping the barcode open.

Use **Show PIN** to reveal the PIN. It hides when you leave or background the view. Use **Original image** to open the unmodified screenshot with zoom controls; the original may itself contain a visible PIN.

### Track spending and archive cards

Use **Spend** to record a positive CAD amount. The spending date defaults to now. In **Details**, edit amounts and spending dates, delete mistaken entries with confirmation, or edit the card.

```text
Remaining balance = starting balance − total recorded spending
```

Balances use integer cents. Changes that would produce a negative balance are rejected, and editing preserves the original addition timestamps. Dates and times are displayed in the phone's timezone.

Cards are listed newest first. Archive and restore preserve all data and images. A zero balance does not automatically archive a card.

## Install and use offline

Open a production build over HTTPS in Android Chrome. Wait for **Ready offline**, then use **Install** or Chrome's menu to add the app to the home screen.

**Ready offline** appears only after all required static assets are cached, including OCR language data and WASM files. The initial cache is about 24 MB. Once ready, importing screenshots, viewing cards, and editing spending work offline.

When an update is available, the app asks before reloading. Finish any open edits before accepting. Updates preserve saved cards and spending.

## Storage and privacy

The app stores three IndexedDB tables: `cards`, `spends`, and `images`. The database remains named `pocket-wallet` to keep existing wallets accessible after the app's rename.

Screenshots, card details, PINs, and spending are processed and stored locally. The app sends no uploads, analytics, or retailer balance requests. Runtime scripts, logos, OCR data, and WASM are served from the app's own origin.

Barcode regeneration is allowed only after decoding the generated image confirms the original payload and symbology. If verification fails or the format cannot be safely regenerated, checkout uses the original barcode crop. OCR text and manually entered numbers are never used to generate a payment barcode.

The app requests persistent storage after saving. Storage failures are shown to the user, and related card/image or spending changes are written transactionally.

Clearing browser/site data, losing the phone, or storage eviction can erase the wallet. Keep your source screenshots. PIN masking is a display feature; storage is not an encrypted vault. Backup/restore, cloud sync, accounts, retailer balance lookup, and card reloads are not implemented.

## Verification

Run unit tests:

```sh
npm test
```

Install the browser test dependencies and run Playwright:

```sh
npx playwright install --with-deps chromium
npm run test:e2e
```

Run unit tests, production builds, and browser checks together:

```sh
npm run check
```

The browser suite uses synthetic screenshots and checks local OCR/barcode processing, offline imports, HTTP compatibility, spending, PINs, archive/restore, duplicate handling, storage failures, checkout navigation, fullscreen events, and mobile layout.

Physical Android behavior and cashier scanning need device testing. See [device checks](docs/device-checks.md) and the [verification record](docs/verification.md).

## Deploy to GitHub Pages

The included [GitHub Actions workflow](.github/workflows/pages.yml) tests pull requests and builds/deploys pushes to `main` or `master`. It can also be started manually.

1. Push the project to a GitHub repository.
2. In repository settings, choose **Pages → Source → GitHub Actions**.
3. Push to a deployment branch or run the workflow.

The workflow derives the base path from the repository name, uses `/` for a `*.github.io` repository, and applies the base to assets, the manifest, and service-worker scope. For a custom domain served at its root, set the repository variable `PAGES_BASE_PATH` to `/`.

Use HTTPS and a hostname that serves only trusted applications. Browser storage is shared across paths on the same hostname; a dedicated hostname isolates the wallet from unrelated apps. The workflow checks dependency advisories and approved release files before deployment, and its action references are pinned to commit hashes.

Base paths must begin and end with `/`. Hash-based routes allow refreshing checkout, card details, and image pages on GitHub Pages.

## Project layout

| Path                                         | Purpose                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| `src/App.tsx`, `src/ui.tsx`                  | App shell, hash navigation, shared forms and controls          |
| `src/Wallet.tsx`                             | Active/archived cards and the floating add button              |
| `src/Import.tsx`, `src/recognition.ts`       | Screenshot import, review, and OCR field parsing               |
| `src/scanner.ts`, `src/barcode.worker.ts`    | Local OCR/barcode processing and verification                  |
| `src/Checkout.tsx`                           | Barcode display, fullscreen, wake lock, and image viewer       |
| `src/details.tsx`                            | Card editing and spending history                              |
| `src/model.ts`, `src/db.ts`, `src/crypto.ts` | Data types, cent arithmetic, IndexedDB, and image fingerprints |
| `src/pwa.ts`, `src/sw.ts`                    | Offline readiness and app updates                              |
| `assets/`, `public/logos/`                   | Card artwork and retailer logos                                |
| `scripts/prepare-assets.mjs`                 | Copies local OCR/WASM assets and generates app icons           |
| `tests/`                                     | Unit tests and browser scenarios                               |

See [third-party notices](THIRD_PARTY_NOTICES.md) for bundled asset and dependency attribution.
