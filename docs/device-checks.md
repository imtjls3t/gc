# Installed Android acceptance checks

These checks require a real Android phone. Browser emulation does not replace them.

- Open the deployed HTTPS site in Chrome. Wait for **Ready offline**, install it, and launch from the home screen. Confirm the icon, app name, standalone display, and that no orientation is locked by the manifest.
- Enable airplane mode, force-close and reopen the PWA, and import a new Costco / Starbucks screenshot. Verify editing, spending, archive/restore, original-image viewing, and reloading a card URL offline.
- Scan a representative real payment barcode with a second device. Compare the exact payload and symbology, including leading zeros, to the source screenshot. Verify both portrait and landscape, with clear margins. Verify cashier acceptance separately at a physical checkout.
- Turn autorotation on and rotate the phone in checkout. Then lock rotation and use **Rotate**. Neither should stretch or clip the barcode. Inspect screen cutouts and navigation safe areas.
- Open a barcode from the wallet and from card details, then use the phone's Back button/gesture: one press should return to the wallet, including from fullscreen. Repeat after a barcode-page reload and after viewing/closing the original screenshot. Archived cards should return to the archived tab. Confirm a revealed PIN hides and the wake lock releases on exit.
- Verify fullscreen when supported; denying fullscreen should leave checkout usable. The fullscreen toggle can leave fullscreen while keeping the barcode open; the phone's Back button should return to the wallet. Increase brightness manually and confirm the reminder remains visible. A PWA cannot reliably set maximum screen brightness.
- Enter checkout and wait longer than the normal display timeout. Confirm wake lock keeps the display on when allowed. Leave checkout; confirm the display can sleep again. Background and foreground the app while in checkout; confirm the lock reacquires if supported.
- Reveal a PIN in details and checkout, leave, and return; it must be hidden again. Background the app and return; PIN should be hidden. Original screenshots may contain a visible PIN by design.
- Use real screenshots with long barcodes, multiple codes, unusually long PINs, PINs starting with zero, absent amounts, and uncertain dates. Confirm that review is required and the stored data matches the screenshot.
- Scroll long active and archived lists in both orientations. Confirm the 56 × 56 add button remains 16 CSS pixels plus safe-area inset from the bottom/right and leaves the last card’s actions unobstructed. Test TalkBack and an external keyboard.
- Start importing and cancel / navigate back. No partial card or orphan image should appear. Deny storage access or fill a test browser’s quota; saving should show an error and no partial data.
- Deploy a new version while the wallet contains saved cards. Confirm the update banner appears, **Later** keeps the current app, and **Update and reload** preserves all cards and history. Test opening an update while an edit is unsaved.
- In Chrome remote debugging, inspect Network and console while importing and spending: only static same-origin files should be requested; no screenshot, barcode, PIN, or OCR content should appear in requests or logs.

The app excludes retailer balance lookup, reloads, accounts, cloud sync, and backup / restore. Phone loss or clearing browser data can lose the wallet.
