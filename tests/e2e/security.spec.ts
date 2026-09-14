import { test, expect, type Page } from '@playwright/test';
import { blankFixture, screenshotFixture } from './fixtures';

async function importImage(page: Page, buffer: Buffer) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'synthetic-card.png',
    mimeType: 'image/png',
    buffer,
  });
  await expect(page.getByRole('heading', { name: 'A quick double-check.' })).toBeVisible({
    timeout: 90_000,
  });
}

test('untrusted card fields render as text without executing code or sending data', async ({
  page,
}) => {
  const dialogs: string[] = [],
    requests: { url: string; method: string; body: string | null }[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  page.on('request', (request) =>
    requests.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
    }),
  );
  await page.goto('./');
  await importImage(page, await blankFixture());
  const retailer = '<img src=x onerror=alert(1)>',
    pin = '<svg/onload=alert(2)>0042';
  await page.getByRole('button', { name: 'Use full screenshot' }).click();
  await page.getByLabel('Retailer', { exact: true }).fill(retailer);
  await page.getByLabel('Original amount', { exact: false }).fill('25.00');
  await page.getByLabel('PIN optional', { exact: true }).fill(pin);
  await page.getByLabel('Readable card number', { exact: false }).fill('javascript:alert(3)');
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await expect(page.getByRole('heading', { name: retailer, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show PIN', exact: true }).click();
  await expect(page.getByText(pin, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show barcode', exact: true }).click();
  await expect(page.getByText('javascript:alert(3)', { exact: true })).toBeVisible();
  await expect(page.locator('img[src=x], [onerror], [onload], a[href^="javascript:"]')).toHaveCount(
    0,
  );
  expect(dialogs).toEqual([]);
  expect(
    requests
      .filter((r) => /^https?:/.test(r.url))
      .every((r) => r.url.startsWith('http://127.0.0.1:4173/gc/')),
  ).toBe(true);
  expect(requests.every((r) => r.method === 'GET' && !r.body)).toBe(true);
});

test('PIN reveals reset on background, focus loss and page exit in forms and saved views', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const visibility = { hidden: false };
    Object.assign(window, { securityVisibility: visibility });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibility.hidden });
    Element.prototype.requestFullscreen = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.goto('./');
  await importImage(page, await screenshotFixture());
  const input = page.getByLabel('PIN optional', { exact: true });
  await page.getByRole('button', { name: 'Show entered PIN' }).click();
  await expect(input).toHaveAttribute('type', 'text');
  await page.evaluate(() => {
    (window as any).securityVisibility.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(input).toHaveAttribute('type', 'password');
  await expect(input).toHaveValue('0042');
  await page.evaluate(() => {
    (window as any).securityVisibility.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: 'Add to wallet' }).click();
  await page.getByRole('button', { name: 'Show PIN', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByText('0042', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Edit card', exact: true }).click();
  await page.getByRole('button', { name: 'Show entered PIN' }).click();
  await expect(input).toHaveAttribute('type', 'text');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(input).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Show barcode', exact: true }).click();
  await page.getByRole('button', { name: 'Show PIN', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByText('0042', { exact: true })).toBeHidden();
});

test('the wallet refuses to display controls inside another website frame', async ({
  page,
  context,
}) => {
  // Permit this test wrapper to load the local server so the browser's network
  // protections do not prevent the app's own embedding guard from being tested.
  await context.grantPermissions(['local-network-access']);
  await page.route('http://localhost:4173/embedding-audit', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><iframe src="http://127.0.0.1:4173/gc/"></iframe>',
    }),
  );
  await page.goto('http://localhost:4173/embedding-audit');
  const wallet = page.frameLocator('iframe');
  await expect(
    wallet.getByText('Open Giftcards directly in your browser to use your wallet.'),
  ).toBeVisible();
  await expect(wallet.locator('input, button')).toHaveCount(0);
});

test('unsupported, corrupt and oversized imports are rejected', async ({ page }) => {
  await page.goto('./');
  const input = page.locator('input[type=file]');
  await input.setInputFiles({
    name: 'not-a-screenshot.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await expect(page.getByRole('alert')).toContainText('Choose a PNG, JPEG, or WebP screenshot.');
  await input.setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<script>alert(1)</script>'),
  });
  await expect(page.getByRole('alert')).toContainText('This image could not be opened.');
  await input.setInputFiles({
    name: 'too-large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(25 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole('alert')).toContainText('Choose an image smaller than 25 MB.');
  await expect(page.getByRole('button', { name: 'Add to wallet', exact: true })).toHaveCount(0);
});
