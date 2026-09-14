import { createHash, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId, hashImage } from '../src/crypto';

afterEach(() => vi.unstubAllGlobals());

describe('local HTTP browser support', () => {
  it.each([0, 3, 55, 56, 63, 64, 65, 1024, 1024 * 1024])(
    'keeps the same SHA-256 fingerprint for %i bytes with or without SubtleCrypto',
    async (length) => {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 31) % 256);
      const expected = createHash('sha256').update(bytes).digest('hex');
      vi.stubGlobal('crypto', webcrypto);
      const native = await hashImage(new Blob([bytes]));
      vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
      expect(await hashImage(new Blob([bytes]))).toBe(expected);
      expect(native).toBe(expected);
    },
  );

  it('creates distinct UUID v4 card and spending IDs without randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const ids = Array.from({ length: 100 }, createId);
    for (const id of ids)
      expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses the native randomUUID when available', () => {
    const native = vi.fn(() => '00000000-0000-4000-8000-000000000001');
    vi.stubGlobal('crypto', { randomUUID: native });
    expect(createId()).toBe('00000000-0000-4000-8000-000000000001');
    expect(native).toHaveBeenCalledOnce();
  });
});
