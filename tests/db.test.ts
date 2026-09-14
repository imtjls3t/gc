import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  WalletDB,
  saveCard,
  saveSpend,
  editCard,
  deleteSpend,
  setArchived,
  hashImage,
  DuplicateError,
} from '../src/db';
import { type CardFields, type BarcodeCandidate, remaining } from '../src/model';

let db: WalletDB;
const fields: CardFields = {
  retailer: 'Costco',
  originalCents: 10000,
  startingCents: 7555,
  pin: '0042',
  expiry: { kind: 'unknown' },
};
const image = new Blob(['original unmodified bytes'], { type: 'image/png' });
const code: BarcodeCandidate = {
  text: '00123456789',
  bytes: [48, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57],
  format: 'Code128',
  symbology: 'Code128',
  symbologyIdentifier: ']C0',
  decoded: true,
  verified: false,
  crop: new Blob(['original crop']),
};
const create = () => saveCard(fields, image, 'hash', code, false, db);
beforeEach(() => {
  db = new WalletDB(`test-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await db.delete();
});
describe('transactional wallet storage', () => {
  it('preserves original image bytes, leading zeros, PIN text and partly used starting balance', async () => {
    const card = await create();
    expect(card.pin).toBe('0042');
    expect(card.barcode.text).toBe('00123456789');
    expect(remaining(card, [])).toBe(7555);
    expect(await (await db.images.get(card.originalImageId))!.blob.text()).toBe(await image.text());
    expect(await hashImage(image)).toHaveLength(64);
  });
  it('recalculates cents after additions, amount/date edits and deletion, preserving addition times', async () => {
    const card = await create();
    const spend = await saveSpend(card.id, 10, 1000, undefined, db);
    await saveSpend(card.id, 20, 2000, undefined, db);
    expect(remaining(card, await db.spends.toArray())).toBe(7525);
    const edited = await saveSpend(card.id, 100, 3000, spend.id, db);
    expect(edited.addedAt).toBe(spend.addedAt);
    expect(edited.spentAt).toBe(3000);
    expect(remaining(card, await db.spends.toArray())).toBe(7435);
    await editCard(card.id, { ...fields, pin: undefined, startingCents: 5000 }, db);
    const editedCard = (await db.cards.get(card.id))!;
    expect(editedCard.addedAt).toBe(card.addedAt);
    expect(editedCard.pin).toBeUndefined();
    expect(remaining(editedCard, await db.spends.toArray())).toBe(4880);
    await deleteSpend(card.id, spend.id, db);
    expect(remaining(editedCard, await db.spends.toArray())).toBe(4980);
  });
  it('rejects overspending, invalid entries, and invalid balance edits atomically', async () => {
    const card = await create();
    const spend = await saveSpend(card.id, 5000, Date.now(), undefined, db);
    await expect(saveSpend(card.id, 2556, Date.now(), undefined, db)).rejects.toThrow('exceeds');
    await expect(saveSpend(card.id, 7556, Date.now(), spend.id, db)).rejects.toThrow('exceeds');
    await expect(saveSpend(card.id, 0, Date.now(), undefined, db)).rejects.toThrow('positive');
    await expect(saveSpend(card.id, 1.2, Date.now(), undefined, db)).rejects.toThrow('positive');
    await expect(editCard(card.id, { ...fields, startingCents: 4999 }, db)).rejects.toThrow(
      'lower',
    );
    expect((await db.spends.get(spend.id))!.amountCents).toBe(5000);
    expect((await db.cards.get(card.id))!.startingCents).toBe(7555);
  });
  it('serializes concurrent spending to prevent negative balance', async () => {
    const card = await create();
    const result = await Promise.allSettled([
      saveSpend(card.id, 5000, Date.now(), undefined, db),
      saveSpend(card.id, 5000, Date.now(), undefined, db),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(remaining(card, await db.spends.toArray())).toBe(2555);
  });
  it('keeps zero-balance cards active, with reversible archive preserving all data', async () => {
    const card = await create();
    await saveSpend(card.id, 7555, Date.now(), undefined, db);
    expect((await db.cards.get(card.id))!.archived).toBe(false);
    await setArchived(card.id, true, db);
    expect((await db.cards.get(card.id))!.archived).toBe(true);
    await setArchived(card.id, false, db);
    expect(await db.images.count()).toBe(2);
    expect(await db.spends.count()).toBe(1);
    expect((await db.cards.get(card.id))!.addedAt).toBe(card.addedAt);
  });
  it('warns on duplicate original or exact barcode before writing, allowing explicit duplicate save', async () => {
    await create();
    await expect(create()).rejects.toBeInstanceOf(DuplicateError);
    await expect(saveCard(fields, image, 'different', code, false, db)).rejects.toBeInstanceOf(
      DuplicateError,
    );
    expect(await db.cards.count()).toBe(1);
    expect(await db.images.count()).toBe(2);
    await saveCard(fields, image, 'hash', code, true, db);
    expect(await db.cards.count()).toBe(2);
  });
  it('rolls back images and card together when storage fails', async () => {
    db.cards.hook('creating', () => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    await expect(create()).rejects.toThrow();
    expect(await db.images.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });
  it('never displays an unverified generated barcode', async () => {
    const card = await saveCard(
      fields,
      image,
      'hash',
      { ...code, rendered: new Blob(['unverified']) },
      false,
      db,
    );
    expect(card.barcode.displayImageId).toBe(card.barcode.cropImageId);
    expect(await db.images.count()).toBe(2);
  });
});
