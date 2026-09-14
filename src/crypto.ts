import { sha256 } from '@noble/hashes/sha2.js';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export async function hashImage(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Web Crypto's digest requires HTTPS, but duplicate detection must also work
  // on a local HTTP preview. Both paths produce the same SHA-256 fingerprint.
  const digest = globalThis.crypto?.subtle
    ? new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
    : sha256(bytes);
  return hex(digest);
}

export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues)
    throw new Error('This browser cannot create card IDs. Please use a current version of Chrome.');

  // getRandomValues is available on HTTP too. Preserve UUID v4's version and
  // variant bits and use the browser's random source, never Math.random.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = hex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
