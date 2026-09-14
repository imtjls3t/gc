import sharp, { type OverlayOptions } from 'sharp';
import { readFileSync } from 'node:fs';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm';

prepareZXingModule({
  overrides: {
    wasmBinary: new Uint8Array(readFileSync('node_modules/zxing-wasm/dist/full/zxing_full.wasm'))
      .buffer,
    print: () => {},
    printErr: () => {},
  },
});
export async function screenshotFixture(retailer = 'Costco', multiple = false) {
  const payment = await writeBarcode('001234567890008888', {
    format: 'Code128',
    scale: 3,
    addQuietZones: true,
  });
  const barcode = await sharp(Buffer.from(await payment.image!.arrayBuffer()))
    .resize({ width: 700, kernel: 'nearest' })
    .toBuffer();
  const overlays: OverlayOptions[] = [{ input: barcode, left: 100, top: 590 }];
  if (multiple) {
    const other = await writeBarcode('https://example.com/not-payment', {
      format: 'QRCode',
      scale: 5,
      addQuietZones: true,
    });
    overlays.push({ input: Buffer.from(await other.image!.arrayBuffer()), left: 110, top: 910 });
  }
  const svg = `<svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg"><rect width="900" height="1200" fill="white"/><g fill="#111" font-family="DejaVu Sans, sans-serif"><text x="90" y="130" font-size="76" font-weight="bold">${retailer}</text><text x="90" y="215" font-size="37">Gift card</text><text x="90" y="315" font-size="46">Original amount: $100.00</text><text x="90" y="395" font-size="38">PIN number: 0042</text><text x="90" y="475" font-size="35">Expires: 2030-12-31</text><text x="160" y="890" font-size="31">001234567890008888</text></g></svg>`;
  return sharp(Buffer.from(svg)).composite(overlays).png().toBuffer();
}
export const blankFixture = () =>
  sharp({ create: { width: 600, height: 600, channels: 3, background: '#fafafa' } })
    .png()
    .toBuffer();
