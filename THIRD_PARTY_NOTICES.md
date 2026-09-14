# Third-party assets

- Costco logo: bundled from https://www.costco.ca/wcsstore/CostcoGLOBALSAS/images/Costco_Logo-1.png. Costco Wholesale Corporation owns the mark. Used to identify a user’s Costco gift card; no affiliation or endorsement is implied.
- Starbucks logo: Simple Icons v15, `starbucks.svg`, downloaded from https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/starbucks.svg. Simple Icons assets are distributed under CC0; trademark rights belong to Starbucks Corporation. Used to identify a user’s Starbucks gift card; no affiliation or endorsement is implied.
- Pocket’s icon and wallet artwork are original code-native artwork in this repository.
- English OCR data: `@tesseract.js-data/eng`, `4.0.0_best_int/eng.traineddata.gz`, provided for Tesseract under Apache-2.0. Tesseract.js / tesseract.js-core are Apache-2.0.
- ZXing WASM: MIT; underlying ZXing-C++ is Apache-2.0; barcode creation also uses Zint (see upstream notices).
- Lucide icons: ISC. React: MIT. Dexie: Apache-2.0. Vite, vite-plugin-pwa, and Workbox: MIT.
- `@noble/hashes`: MIT. Bundled SHA-256 fallback for image fingerprints on HTTP LAN previews.

Consult the corresponding installed package LICENSE files and upstream projects for full license text. All runtime recognition assets are copied locally by `scripts/prepare-assets.mjs` and are never fetched from a CDN by the app.
