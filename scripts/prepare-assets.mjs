import { copyFile, mkdir, readdir } from 'node:fs/promises';
import sharp from 'sharp';

await mkdir('public/vendor/tesseract', { recursive: true });
await mkdir('public/icons', { recursive: true });
await copyFile(
  'node_modules/tesseract.js/dist/worker.min.js',
  'public/vendor/tesseract/worker.min.js',
);
// OEM.LSTM_ONLY uses these three builds: scalar, SIMD, and relaxed SIMD.
for (const file of await readdir('node_modules/tesseract.js-core')) {
  if (/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm(?:\.js)?$/.test(file)) {
    await copyFile(`node_modules/tesseract.js-core/${file}`, `public/vendor/tesseract/${file}`);
  }
}
await copyFile(
  'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  'public/vendor/tesseract/eng.traineddata.gz',
);
await copyFile(
  'node_modules/zxing-wasm/dist/full/zxing_full.wasm',
  'public/vendor/zxing_full.wasm',
);
for (const size of [192, 512]) {
  await sharp('public/icons/pocket.svg')
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon-${size}.png`);
}
await sharp('public/icons/pocket.svg')
  .resize(360, 360)
  .extend({ top: 76, bottom: 76, left: 76, right: 76, background: '#194d3c' })
  .png()
  .toFile('public/icons/maskable-512.png');
