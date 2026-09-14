import { createWorker, OEM } from 'tesseract.js';
import type { BarcodeCandidate } from './model';
import { recognizeText, type Recognition } from './recognition';

export function scanBarcodes(image: Blob, signal: AbortSignal): Promise<BarcodeCandidate[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    const worker = new Worker(new URL('./barcode.worker.ts', import.meta.url), { type: 'module' });
    const stop = () => {
      worker.terminate();
      signal.removeEventListener('abort', cancel);
      clearTimeout(timer);
    };
    const cancel = () => {
      stop();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      stop();
      reject(new Error('Barcode recognition timed out. Try cropping the screenshot.'));
    }, 60_000);
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = (event) => {
      stop();
      event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.candidates);
    };
    worker.onerror = () => {
      stop();
      reject(new Error('Barcode recognition is unavailable. Try again or use a screenshot crop.'));
    };
    worker.postMessage({ image });
  });
}
export async function scanText(
  image: Blob,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<Recognition> {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const base = new URL(import.meta.env.BASE_URL, location.origin).href;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let ended = false;
  let rejectWork: (error: Error) => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectWork = reject;
  });
  const cancel = () => {
    ended = true;
    void worker?.terminate();
    rejectWork(new DOMException('Cancelled', 'AbortError'));
  };
  const timer = setTimeout(() => {
    ended = true;
    void worker?.terminate();
    rejectWork(new Error('Text recognition timed out. Enter the details manually.'));
  }, 90_000);
  signal.addEventListener('abort', cancel, { once: true });
  // Tesseract runs in its own worker; local URLs also work from GitHub Pages subpaths.
  const pending = createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: `${base}vendor/tesseract/worker.min.js`,
    corePath: `${base}vendor/tesseract`,
    langPath: `${base}vendor/tesseract`,
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (status) => {
      if (!ended && !signal.aborted && status.status === 'recognizing text')
        progress(`Reading details · ${Math.round(status.progress * 100)}%`);
    },
    errorHandler: () => {
      rejectWork(new Error('Text recognition could not finish. Enter the details manually.'));
    },
  }).then(async (next) => {
    if (ended) {
      await next.terminate();
      throw new DOMException('Cancelled', 'AbortError');
    }
    worker = next;
    return next;
  });
  try {
    worker = await Promise.race([pending, interrupted]);
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(2, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.filter = 'grayscale(1) contrast(1.2)';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const result = await Promise.race([worker.recognize(canvas), interrupted]);
    return recognizeText(result.data.text);
  } finally {
    ended = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    await worker?.terminate();
  }
}
export async function validateImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Choose a PNG, JPEG, or WebP screenshot.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose an image smaller than 25 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This image could not be opened. Choose another screenshot.');
  }
  const tooLarge = bitmap.width * bitmap.height > 40_000_000;
  bitmap.close();
  if (tooLarge)
    throw new Error('This image is too large to process on a phone. Choose a smaller screenshot.');
}
