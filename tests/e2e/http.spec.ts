import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { screenshotFixture } from './fixtures';

// This hostname resolves locally without qualifying for localhost's secure-context
// exception. It exercises the same API restrictions as a phone using a LAN IP.
test.use({
  launchOptions: { args: ['--host-resolver-rules=MAP pocket.test 127.0.0.1'] },
});

test('a plain HTTP origin can import, save, scan, spend, reload and detect duplicates', async ({
  page,
}) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('http://pocket.test:4173/gc/');
  expect(
    await page.evaluate(() => ({
      secure: window.isSecureContext,
      digest: typeof crypto.subtle,
      uuid: typeof crypto.randomUUID,
      random: typeof crypto.getRandomValues,
    })),
  ).toEqual({ secure: false, digest: 'undefined', uuid: 'undefined', random: 'function' });
  await expect(page.getByText('Online only', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Install Giftcards' }).click();
  await expect(page.getByRole('dialog')).toContainText('require HTTPS');
  await page.getByRole('button', { name: 'Got it' }).click();

  const buffer = await screenshotFixture();
  const input = { name: 'gift.png', mimeType: 'image/png', buffer };
  await page.locator('input[type=file]').setInputFiles(input);
  await expect(page.getByRole('heading', { name: 'A quick double-check.' })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByLabel('Retailer', { exact: true })).toHaveValue('Costco');
  await expect(page.getByLabel('PIN optional', { exact: true })).toHaveValue('0042');
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Card details', exact: true })).toBeVisible();

  const saved = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('pocket-wallet');
      request.onsuccess = () => resolve(request.result);
    });
    const card = await new Promise<any>((resolve) => {
      const request = database.transaction('cards').objectStore('cards').getAll();
      request.onsuccess = () => resolve(request.result[0]);
    });
    database.close();
    return card;
  });
  expect(saved.imageHash).toBe(createHash('sha256').update(buffer).digest('hex'));
  expect(saved.barcode.verified).toBe(true);
  expect(saved.barcode.text).toBe('001234567890008888');

  await page.getByRole('button', { name: 'Show barcode', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Costco payment barcode' })).toBeVisible();
  await page.getByRole('button', { name: 'Show PIN', exact: true }).click();
  await expect(page.getByText('0042', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Exit checkout' }).click();
  await page.getByRole('button', { name: 'Record spending for Costco' }).click();
  await page.getByLabel('Amount spent', { exact: false }).fill('12.34');
  await page.getByRole('button', { name: 'Save spending', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Open Costco barcode, $87.66 remaining' }),
  ).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(input);
  await expect(page.getByText('This card may already be in your wallet.')).toBeVisible({
    timeout: 90_000,
  });
  expect(errors).toEqual([]);
  expect(
    requests
      .filter((url) => /^https?:/.test(url))
      .every((url) => url.startsWith('http://pocket.test:4173/gc/')),
  ).toBe(true);
});
