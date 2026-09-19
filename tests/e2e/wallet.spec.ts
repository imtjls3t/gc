import { test, expect, type Page } from '@playwright/test';
import { screenshotFixture, blankFixture } from './fixtures';
import { readFile, writeFile } from 'node:fs/promises';

async function readStore(page: Page, store: string) {
  return page.evaluate(async (storeName) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('pocket-wallet');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const result = await new Promise<any[]>((resolve, reject) => {
      const r = database.transaction(storeName).objectStore(storeName).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    database.close();
    return result.map((value) => {
      if (value.blob) return { ...value, blob: { size: value.blob.size, type: value.blob.type } };
      return value;
    });
  }, store);
}
async function importFixture(page: Page, buffer: Buffer, name = 'gift.png') {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer });
  await expect(page.getByRole('heading', { name: 'A quick double-check.' })).toBeVisible({
    timeout: 90_000,
  });
}
test('complete offline import, checkout, PIN, spending, editing, archive and restore flow', async ({
  page,
  context,
}) => {
  const requests: { url: string; method: string; body: string | null }[] = [],
    consoleLines: string[] = [],
    errors: string[] = [];
  context.on('request', (request) =>
    requests.push({ url: request.url(), method: request.method(), body: request.postData() }),
  );
  page.on('console', (message) => consoleLines.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 60_000 });
  const manifest = await page.evaluate(async () =>
    (await fetch(document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href)).json(),
  );
  expect(manifest.start_url).toBe('/gc/#/wallet');
  expect(manifest.scope).toBe('/gc/');
  expect(manifest.orientation).toBeUndefined();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  const buffer = await screenshotFixture();
  await importFixture(page, buffer);
  await expect(page.getByLabel('Retailer', { exact: true })).toHaveValue('Costco');
  await expect(page.getByLabel('Original amount', { exact: false })).toHaveValue('100.00');
  await expect(page.getByLabel('PIN optional', { exact: true })).toHaveValue('0042');
  await page.getByLabel('Starting balance', { exact: false }).fill('75.55');
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Card details', exact: true })).toBeVisible();
  const [saved] = await readStore(page, 'cards');
  expect(saved.barcode.text).toBe('001234567890008888');
  expect(saved.barcode.format).toBe('Code128');
  expect(saved.pin).toBe('0042');
  expect(saved.barcode.verified).toBe(true);
  expect(saved.startingCents).toBe(7555);
  const originalHash = await page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('pocket-wallet');
      r.onsuccess = () => resolve(r.result);
    });
    const image = await new Promise<any>((resolve) => {
      const r = database.transaction('images').objectStore('images').get(id);
      r.onsuccess = () => resolve(r.result);
    });
    database.close();
    const digest = await crypto.subtle.digest('SHA-256', await image.blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }, saved.originalImageId);
  expect(originalHash).toBe(saved.imageHash);
  await expect(page.getByText('0042', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show PIN', exact: true }).click();
  await expect(page.getByText('0042', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show barcode', exact: true }).click();
  await expect(page.getByText('0042', { exact: true })).toBeHidden();
  await expect(page.getByRole('img', { name: 'Costco payment barcode' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add gift card', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show PIN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rotate', exact: true })).toHaveCount(0);
  const originalImageButton = page.getByRole('button', { name: 'Original image', exact: true });
  const addSpendButton = page.getByRole('button', { name: 'Add Spend', exact: true });
  const actionPositions = await Promise.all([
    originalImageButton.boundingBox(),
    addSpendButton.boundingBox(),
  ]);
  expect(Math.abs(actionPositions[0]!.y - actionPositions[1]!.y)).toBeLessThan(2);
  const bottomSpacer = await page.locator('.checkout-bottom-spacer').boundingBox();
  expect(bottomSpacer!.height).toBe(42);
  expect(bottomSpacer!.y).toBeGreaterThan(actionPositions[0]!.y + actionPositions[0]!.height);
  await addSpendButton.click();
  const checkoutSpend = page.getByLabel('Amount spent', { exact: false });
  await checkoutSpend.fill('11622');
  await expect(checkoutSpend).toHaveValue('116.22');
  await checkoutSpend.fill('10');
  await expect(checkoutSpend).toHaveValue('0.10');
  await page.getByRole('button', { name: 'Save spending', exact: true }).click();
  // Headless Chromium cannot resize its OS window while it is fullscreen.
  if (await page.evaluate(() => !!document.fullscreenElement))
    await page.getByRole('button', { name: 'Toggle fullscreen' }).click();
  await page.setViewportSize({ width: 900, height: 412 });
  const landscapeActions = await Promise.all([
    originalImageButton.boundingBox(),
    addSpendButton.boundingBox(),
  ]);
  expect(Math.abs(landscapeActions[0]!.y - landscapeActions[1]!.y)).toBeLessThan(2);
  expect(412 - (landscapeActions[0]!.y + landscapeActions[0]!.height)).toBeGreaterThanOrEqual(42);
  const fits = () =>
    page.locator('.barcode-fit').evaluate((element) => {
      const image = element.getBoundingClientRect(),
        parent = element.parentElement!.getBoundingClientRect();
      return (
        image.left >= parent.left - 1 &&
        image.right <= parent.right + 1 &&
        image.top >= parent.top - 1 &&
        image.bottom <= parent.bottom + 1
      );
    });
  await expect.poll(fits).toBe(true);
  await page.getByRole('button', { name: 'Original image', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Original Costco gift card screenshot' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset 150%' })).toBeVisible();
  await page.getByRole('button', { name: 'Close image' }).click();
  await expect(page.getByText('0042', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Exit checkout' }).click();
  await page.setViewportSize({ width: 412, height: 839 });
  await page.getByRole('button', { name: 'Details and history for Costco' }).click();
  await expect(page.locator('.detail-amount')).toHaveText('$75.45');
  const [initialSpend] = await readStore(page, 'spends');
  await page.getByRole('button', { name: 'Edit spending of $0.10' }).click();
  await page.getByLabel('Amount spent', { exact: false }).fill('10.55');
  await page.getByLabel('Spending date', { exact: true }).fill('2026-09-01T12:30');
  await page.getByRole('button', { name: 'Save spending changes' }).click();
  await expect(page.locator('.detail-amount')).toHaveText('$65.00');
  const [editedSpend] = await readStore(page, 'spends');
  expect(editedSpend.addedAt).toBe(initialSpend.addedAt);
  expect(editedSpend.spentAt).not.toBe(initialSpend.spentAt);
  await page.getByRole('button', { name: 'Record spending', exact: true }).click();
  await page.getByLabel('Amount spent', { exact: false }).fill('65.01');
  await page.getByRole('button', { name: 'Save spending', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('exceeds');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Delete spending of $10.55' }).click();
  await page.getByRole('button', { name: 'Keep entry' }).click();
  expect(await readStore(page, 'spends')).toHaveLength(1);
  await page.getByRole('button', { name: 'Delete spending of $10.55' }).click();
  await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
  await expect(page.locator('.detail-amount')).toHaveText('$75.55');
  await page.getByRole('button', { name: 'Edit card', exact: true }).click();
  await page.getByLabel('PIN optional', { exact: true }).fill('00099');
  await page.getByRole('button', { name: 'Save card changes' }).click();
  await page.getByRole('button', { name: 'Show PIN', exact: true }).click();
  await expect(page.getByText('00099', { exact: true })).toBeVisible();
  expect((await readStore(page, 'cards'))[0].addedAt).toBe(saved.addedAt);
  await page.getByRole('button', { name: 'Archive card', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Archived 1' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('button', { name: 'Add gift card', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore Costco' }).click();
  await page.getByRole('link', { name: 'Active 1' }).click();
  await expect(
    page.getByRole('button', { name: 'Open Costco barcode, $75.55 remaining' }),
  ).toBeVisible();
  expect(
    requests
      .filter((r) => /^https?:/.test(r.url))
      .every((r) => r.url.startsWith('http://127.0.0.1:4173/gc/')),
  ).toBe(true);
  expect(requests.every((r) => r.method === 'GET' && !r.body)).toBe(true);
  expect(consoleLines.join('\n')).not.toMatch(/0042|00099|001234567890008888/);
  expect(errors).toEqual([]);
});

test('multiple barcodes, duplicate review, manual crop and cancelled import', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 60_000 });
  await importFixture(page, await screenshotFixture('Starbucks', true));
  await expect(page.getByRole('heading', { name: 'Choose the code to scan.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to wallet' })).toBeDisabled();
  await page.getByRole('button', { name: /Select barcode \d, Code128/ }).click();
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Card details', exact: true })).toBeVisible();
  await importFixture(page, await screenshotFixture('Starbucks', true));
  await page.getByRole('button', { name: /Select barcode \d, Code128/ }).click();
  await expect(page.getByText('This card may already be in your wallet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await expect(page.getByRole('alert')).toContainText('already');
  expect(await readStore(page, 'cards')).toHaveLength(1);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  expect(await readStore(page, 'cards')).toHaveLength(1);
  await importFixture(page, await blankFixture(), 'blank.png');
  await expect(page.getByLabel('Original amount', { exact: false })).toHaveValue('');
  await expect(page.getByLabel('Expiry', { exact: true })).toHaveValue('none');
  await page.getByRole('button', { name: 'Crop screenshot' }).click();
  await page.getByRole('button', { name: 'Use crop as-is' }).click();
  await expect(page.getByRole('dialog', { name: 'Crop your barcode' })).toBeHidden();
  await page.getByLabel('Retailer', { exact: true }).fill('Local Books');
  await page.getByLabel('Original amount', { exact: false }).fill('25.00');
  await expect(page.getByLabel('Retailer', { exact: true })).toHaveValue('Local Books');
  await page.getByLabel('Readable card number', { exact: false }).fill('000777');
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Card details', exact: true })).toBeVisible();
  const cards = await readStore(page, 'cards'),
    manual = cards.find((c) => c.retailer === 'Local Books');
  expect(manual.barcode.decoded).toBe(false);
  expect(manual.barcode.verified).toBe(false);
  expect(manual.barcode.text).toBe('000777');
  expect(manual.expiry.kind).toBe('none');
});

test('floating add button stays fixed, accessible and clear of the last card in both orientations', async ({
  page,
}) => {
  await page.goto('./');
  await importFixture(page, await screenshotFixture());
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Card details', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('pocket-wallet');
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction('cards', 'readwrite'),
      store = transaction.objectStore('cards');
    const request = store.getAll();
    request.onsuccess = () => {
      const base = request.result[0];
      for (let i = 0; i < 7; i++)
        store.add({
          ...base,
          id: `fixture-${i}`,
          retailer: `Test retailer ${i}`,
          addedAt: base.addedAt + i + 1,
        });
    };
    await new Promise<void>((resolve) => {
      transaction.oncomplete = () => resolve();
    });
    database.close();
  });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  for (const viewport of [
    { width: 412, height: 839 },
    { width: 900, height: 412 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    const fab = page.getByRole('button', { name: 'Add gift card', exact: true });
    const before = await fab.boundingBox();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const after = await fab.boundingBox();
    expect(after!.width).toBe(56);
    expect(after!.height).toBe(56);
    expect(after!.y).toBe(before!.y);
    expect(after!.x).toBe(viewport.width - 72);
    expect(after!.y).toBe(viewport.height - 72);
    const last = await page.locator('.card-actions').last().boundingBox();
    expect(last!.y + last!.height).toBeLessThan(after!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await fab.focus();
    await expect(fab).toBeFocused();
  }
  await page.screenshot({ path: 'test-results/wallet-landscape.png', fullPage: true });
  await page.setViewportSize({ width: 412, height: 839 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/wallet-mobile.png', fullPage: true });
});

test('storage failures roll back the complete import and remain visible to the user', async ({
  page,
}) => {
  await page.goto('./');
  await importFixture(page, await screenshotFixture());
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof original>) {
      if (this.name === 'cards')
        throw new DOMException('Synthetic storage failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save to this device');
  expect(await readStore(page, 'cards')).toHaveLength(0);
  expect(await readStore(page, 'images')).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Add to wallet' })).toBeEnabled();
});

test('checkout handles fullscreen denial and releases/reacquires wake lock across visibility and exit', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { requested: 0, released: 0, hidden: false };
    Object.assign(window, { wakeTest: state });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => state.hidden });
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: async () => {
          state.requested++;
          const sentinel = Object.assign(new EventTarget(), {
            released: false,
            release: async () => {
              if (sentinel.released) return;
              sentinel.released = true;
              state.released++;
              sentinel.dispatchEvent(new Event('release'));
            },
          });
          return sentinel;
        },
      },
    });
    Element.prototype.requestFullscreen = async () => {
      throw new DOMException('Denied by test', 'NotAllowedError');
    };
  });
  await page.goto('./');
  await importFixture(page, await screenshotFixture());
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Card details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show barcode', exact: true }).click();
  await expect(page.getByText('Keeping your screen awake', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle fullscreen' }).click();
  await expect(
    page.getByText('Fullscreen isn’t available here. The barcode still works in this view.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show PIN', exact: true }).click();
  await page.evaluate(() => {
    (window as any).wakeTest.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('0042', { exact: true })).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as any).wakeTest.released)).toBe(1);
  await page.evaluate(() => {
    (window as any).wakeTest.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => (window as any).wakeTest.requested)).toBe(2);
  await page.goBack();
  await expect(page).toHaveURL(/#\/wallet$/);
  await expect.poll(() => page.evaluate(() => (window as any).wakeTest.released)).toBe(2);
});

test('barcode Back returns to the wallet from details, original images, reloads and archived cards', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = async () => {
      throw new DOMException('Denied by test', 'NotAllowedError');
    };
  });
  await page.goto('./');
  await importFixture(page, await screenshotFixture());
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await page.getByRole('button', { name: 'Show barcode', exact: true }).click();
  const checkoutURL = page.url();
  await page.getByRole('button', { name: 'Show PIN', exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL(/#\/wallet$/);
  await expect(page.getByRole('button', { name: 'Add gift card', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByText('0042', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Original image', exact: true }).click();
  await page.getByRole('button', { name: 'Close image' }).click();
  await expect(page.getByRole('img', { name: 'Costco payment barcode' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/wallet$/);

  // A barcode URL opened directly also needs a local wallet entry behind it.
  await page.goto(checkoutURL);
  await expect(page.getByRole('img', { name: 'Costco payment barcode' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('img', { name: 'Costco payment barcode' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/wallet$/);
  await page.getByRole('button', { name: 'Archive Costco', exact: true }).click();
  await page.getByRole('link', { name: 'Archived 1' }).click();
  await page.getByRole('button', { name: 'Open Costco barcode, $100.00 remaining' }).click();
  await expect(page.getByRole('img', { name: 'Costco payment barcode' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/archived$/);
  await expect(page.getByRole('link', { name: 'Archived 1' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('system fullscreen exit returns to the wallet while manual toggle and image viewing keep their destinations', async ({
  page,
}) => {
  await page.goto('./');
  await importFixture(page, await screenshotFixture());
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await page.getByRole('button', { name: 'Show barcode', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'Toggle fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect(page.getByRole('img', { name: 'Costco payment barcode' })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'Show PIN', exact: true }).click();
  // Exercise the fullscreenchange exit delivered when Android consumes Back.
  await page.evaluate(() => document.exitFullscreen());
  await expect(page).toHaveURL(/#\/wallet$/);
  await expect(page.getByRole('button', { name: 'Add gift card', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Costco barcode, $100.00 remaining' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(page.getByText('0042', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Original image', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Original Costco gift card screenshot' }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.goBack();
  await expect(page.getByRole('img', { name: 'Costco payment barcode' })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'Exit checkout' }).click();
  await expect(page).toHaveURL(/#\/wallet$/);
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

test('offline readiness reflects missing cache assets and new service workers wait for acceptance', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 60_000 });
  await importFixture(page, await screenshotFixture());
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Card details', exact: true })).toBeVisible();
  const saved = await readStore(page, 'cards');
  // Remove one real precached OCR file and ask the worker for readiness.
  const readyAfterRemoval = await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const key of await cache.keys())
        if (key.url.includes('eng.traineddata.gz')) await cache.delete(key);
    }
    const channel = new MessageChannel();
    return new Promise<boolean>((resolve) => {
      channel.port1.onmessage = (event) => {
        channel.port1.close();
        resolve(event.data.ready);
      };
      navigator.serviceWorker.controller!.postMessage({ type: 'CHECK_OFFLINE' }, [channel.port2]);
    });
  });
  expect(readyAfterRemoval).toBe(false);
  // Change only the worker bytes. Its install restores the missing precached file.
  const originalWorker = await readFile('dist/sw.js', 'utf8');
  try {
    await writeFile('dist/sw.js', `${originalWorker}\n// Synthetic acceptance test update\n`);
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg!.update();
    });
    await expect(page.getByRole('button', { name: 'Update app', exact: true })).toBeVisible();
    expect(
      await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
    ).toBe(true);
    await page.getByRole('button', { name: 'Update app', exact: true }).click();
    await page.getByRole('button', { name: 'Later', exact: true }).click();
    expect(
      await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
    ).toBe(true);
    await page.getByRole('button', { name: 'Update app', exact: true }).click();
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'Update and reload', exact: true }).click(),
    ]);
    await expect(page.getByRole('heading', { name: 'Card details', exact: true })).toBeVisible();
    expect(await readStore(page, 'cards')).toEqual(saved);
    await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  } finally {
    await writeFile('dist/sw.js', originalWorker);
  }
});
