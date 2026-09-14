# Security audit

Reviewed September 12, 2026, before the first GitHub push and Pages deployment.

## Result

No critical or high-severity vulnerability was found in the application code reviewed. The dependency advisory check reported zero known vulnerabilities. The privacy and release-hardening changes below are implemented and tested.

Deployment still requires a trusted HTTPS origin. A project path on a hostname shared with other applications does **not** isolate this wallet's storage from those applications. This deployment constraint must be considered before choosing the published address.

## Scope and evidence

- Reviewed screenshot import, OCR/barcode workers, React rendering, PIN visibility, navigation, IndexedDB transactions, the service worker, CSP, dependency manifests, and the Pages workflow.
- Scanned 45 candidate source files for common credential patterns, including private keys and provider tokens. No matches were found. The four source image assets are retailer/app artwork; the PNGs contain no EXIF or XMP metadata. No private gift-card screenshots were found in the reviewed source assets.
- Confirmed `agents.md` is excluded by the root ignore rules. Environment files, private-key containers, logs, and browser authentication state are also ignored. No Git history was available to scan in this workspace.
- `npm audit --json` reported zero vulnerabilities across the locked dependency tree, including development dependencies. All 499 non-root lockfile entries have integrity metadata and use the public npm registry without embedded credentials. An advisory scan does not establish that dependencies are free of undisclosed vulnerabilities or malicious behavior.
- All 48 unit tests passed. All 13 browser scenarios were verified: 12 passed in the full run, and the iframe case passed on its targeted rerun after granting the test wrapper permission to reach the local server.
- Browser checks cover stored HTML/script-like input, no uploads or external requests during card flows, PIN hiding, iframe refusal, invalid/oversized images, storage rollback, exact barcode verification, offline operation, and update acceptance.

## Changes made

| Finding                                                                                                                                      | Change                                                                                                                                                         | Validation                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Revealed PINs in import/edit forms stayed visible when backgrounded; saved-view blur handling only hid them if the document was also hidden. | Shared PIN visibility logic now hides on backgrounding, focus loss, and page exit in both forms and saved views.                                               | Browser checks preserve the entered value while verifying it becomes masked.                                             |
| Dependency declarations used version ranges, although `npm ci` already respected the lockfile.                                               | Pinned all 8 runtime and 16 development dependencies to their exact installed versions. Added `save-exact=true` for future additions.                          | All 499 existing lockfile dependency entries remain unchanged; release checks require exact manifest/lockfile agreement. |
| Workflow actions used mutable major-version tags. The Pages upload composite also used an indirect mutable tag.                              | Pinned action invocations to full commit SHAs. Replaced the composite uploader with the same Pages tar packaging and a directly pinned artifact upload action. | References were resolved from official action repositories; release checks reject unpinned action references.            |
| The wallet could be displayed inside another site's frame.                                                                                   | Refuse to mount wallet controls when embedded. CSP also forbids child frames and base URL changes.                                                             | A browser check loads the app in a different-origin iframe and verifies that no wallet inputs or buttons appear.         |
| Build output could inadvertently include local files copied through `public/`.                                                               | Added a release check allowing only expected static artifact paths and rejecting symlinks or unexpected files.                                                 | A synthetic `dist/agents.md` was rejected, then removed. Normal production output passes.                                |
| Checkout credentials remained persisted by the checkout action; manual workflow dispatch could deploy other branches.                        | Disabled persisted checkout credentials and restricted deployment to `main`/`master`. Added a high/critical advisory gate and limited artifact retention.      | Workflow review; live GitHub execution remains unverified.                                                               |

See [PIN controls](../src/ui.tsx), [frame guard](../src/App.tsx), [release checks](../scripts/check-release.mjs), and [deployment workflow](../.github/workflows/pages.yml).

GitHub recommends full commit SHA pinning for immutable action references. The original Pages composite's nested `upload-artifact@v4` reference was confirmed in its source. [GitHub Actions security guidance](https://docs.github.com/en/actions/reference/security/secure-use), [reviewed composite action](https://github.com/actions/upload-pages-artifact/blob/56afc609e74202658d3ffba0e8f6dda462b719fa/action.yml).

## Deployment constraints and remaining risks

### Shared hostname: storage access across applications

IndexedDB is scoped to the origin: protocol, hostname, and port. Different URL paths on the same origin share that boundary. For example, JavaScript on `https://owner.github.io/another-app/` can access the wallet stored by `https://owner.github.io/giftcards/` in the same browser. A compromise in a sibling application could therefore expose gift-card numbers, PINs, and screenshots. The service-worker scope and database name do not provide isolation. [Browser same-origin rules](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy).

Use a dedicated hostname that serves only this app, or explicitly trust every application sharing the chosen hostname. A dedicated custom subdomain on Pages can provide this separation; its base path should be `/`. The hostname and repository settings have not yet been selected or verified in this workspace.

### Browser storage is not an encrypted vault

There is no app login, passphrase encryption, or backup/restore. Someone with access to the browser profile, a sufficiently privileged extension, or code executing on the wallet's origin can access its data. The original screenshots can contain visible PINs. Masking limits accidental display; it does not encrypt stored data or prevent operating-system screenshots. Clearing site data or losing the device can lose the wallet.

### Hosting and update trust

Use HTTPS for the deployed wallet and enable **Enforce HTTPS** in Pages settings. Plain HTTP testing remains supported, but it does not protect delivered JavaScript against network tampering. GitHub Pages serves a public website; the deployed artifact contains app code and assets, while each visitor's wallet remains in their own browser. [GitHub Pages HTTPS guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

Anyone able to replace the deployed application can publish code that reads existing wallet data when it runs. Protect repository write access and the deployment branch/environment. Exact dependency versions and action SHAs improve reviewability; they still need deliberate security updates. The hosted runner image and Node 24 patch releases remain managed tooling rather than npm lockfile entries.

The iframe guard is an application-level fallback. A `frame-ancestors` directive is not supported in a CSP meta tag; a host that supports custom response headers should additionally set `Content-Security-Policy: frame-ancestors 'none'`. [CSP frame-ancestors reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

## Repeat before deployment

```sh
npm ci
npm audit --audit-level=high
npm test
npx playwright install --with-deps chromium
npm run test:e2e
npm run build
npm run audit:release
```

The workflow runs these checks and builds with the configured Pages base. When intentionally adding a public asset, review it and update the approved artifact paths in `scripts/check-release.mjs`.

This review did not deploy or push anything. Repository history, account settings, branch protection, the final hostname, live response headers, installed Android behavior, and physical checkout acceptance were not verified. Image byte/pixel limits and worker timeouts reduce resource exhaustion, but browser image decoding and native/WASM internals were not independently audited.
