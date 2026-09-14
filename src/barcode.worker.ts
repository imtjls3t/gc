/// <reference lib="webworker" />
import {
  prepareZXingModule,
  readBarcodes,
  writeBarcode,
  type ReadResult,
  type WriterOptions,
} from 'zxing-wasm';
import type { BarcodeCandidate } from './model';

prepareZXingModule({
  overrides: {
    locateFile: (path: string) =>
      new URL(`${import.meta.env.BASE_URL}vendor/${path}`, self.location.origin).href,
    print: () => {},
    printErr: () => {},
  },
});
function matches(a: ReadResult, b: ReadResult) {
  return (
    a.isValid &&
    b.isValid &&
    a.format === b.format &&
    a.symbology === b.symbology &&
    a.symbologyIdentifier === b.symbologyIdentifier &&
    a.text === b.text &&
    a.bytes.length === b.bytes.length &&
    a.bytes.every((v, i) => v === b.bytes[i]) &&
    a.bytesECI.length === b.bytesECI.length &&
    a.bytesECI.every((v, i) => v === b.bytesECI[i])
  );
}
async function decode(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.round(bitmap.width * scale),
      Math.round(bitmap.height * scale),
    );
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    const options = {
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      maxNumberOfSymbols: 20,
      textMode: 'Plain' as const,
    };
    let results = await readBarcodes(data, options);
    if (!results.length) {
      for (let i = 0; i < data.data.length; i += 4) {
        const value = Math.max(
          0,
          Math.min(
            255,
            (data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114 - 128) *
              1.4 +
              128,
          ),
        );
        data.data[i] = data.data[i + 1] = data.data[i + 2] = value;
      }
      results = await readBarcodes(data, options);
    }
    const candidates: BarcodeCandidate[] = [];
    for (const result of results.filter((r) => r.isValid)) {
      if (
        candidates.some(
          (c) =>
            c.format === result.format && c.bytes.join(',') === Array.from(result.bytes).join(','),
        )
      )
        continue;
      const points = Object.values(result.position);
      const minX = Math.min(...points.map((p) => p.x)) / scale,
        maxX = Math.max(...points.map((p) => p.x)) / scale;
      const minY = Math.min(...points.map((p) => p.y)) / scale,
        maxY = Math.max(...points.map((p) => p.y)) / scale;
      const marginX = Math.max(24, (maxX - minX) * 0.12),
        marginY = Math.max(24, (maxY - minY) * 0.2);
      const x = Math.max(0, Math.floor(minX - marginX)),
        y = Math.max(0, Math.floor(minY - marginY));
      const width = Math.min(bitmap.width - x, Math.ceil(maxX + marginX - x));
      const height = Math.min(bitmap.height - y, Math.ceil(maxY + marginY - y));
      const cropCanvas = new OffscreenCanvas(width, height);
      cropCanvas.getContext('2d')!.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
      const candidate: BarcodeCandidate = {
        text: result.text,
        bytes: Array.from(result.bytes),
        format: result.format,
        symbology: result.symbology,
        symbologyIdentifier: result.symbologyIdentifier,
        decoded: true,
        verified: false,
        crop: await cropCanvas.convertToBlob({ type: 'image/png' }),
      };
      // GS1/ECI/structured append can have semantics beyond their printable text.
      // Keep those originals. Every other generated image must pass an exact round trip.
      if (result.contentType !== 'GS1' && !result.hasECI && result.sequenceSize === -1) {
        try {
          const output = await writeBarcode(result.bytes, {
            format: result.format as WriterOptions['format'],
            scale: 3,
            addQuietZones: true,
            addHRT: false,
          });
          if (output.image && !output.error) {
            const check = await readBarcodes(output.image, options);
            if (check.length === 1 && matches(result, check[0])) {
              candidate.rendered = output.image;
              candidate.verified = true;
            }
          }
        } catch {
          /* Unsupported formats retain the original crop. */
        }
      }
      candidates.push(candidate);
    }
    return candidates;
  } finally {
    bitmap.close();
  }
}
self.onmessage = async (event: MessageEvent<{ image: Blob }>) => {
  try {
    self.postMessage({ candidates: await decode(event.data.image) });
  } catch {
    self.postMessage({
      error: 'Barcode recognition could not finish. Crop the barcode or use the screenshot.',
    });
  }
};
