import Dexie, { type Table } from 'dexie';
import { createId } from './crypto';
export { hashImage } from './crypto';
import {
  type Card,
  type CardFields,
  type Spend,
  type StoredImage,
  type BarcodeCandidate,
  validateFields,
  remaining,
} from './model';

export class WalletDB extends Dexie {
  cards!: Table<Card, string>;
  spends!: Table<Spend, string>;
  images!: Table<StoredImage, string>;
  constructor(name = 'pocket-wallet') {
    super(name);
    this.version(1).stores({
      cards: 'id, addedAt, imageHash',
      spends: 'id, cardId, spentAt',
      images: 'id',
    });
  }
}
export const db = new WalletDB();
export class DuplicateError extends Error {
  constructor() {
    super(
      'This screenshot or barcode is already in your wallet. Save another copy only if this is intentional.',
    );
  }
}
export function friendlyError(error: unknown) {
  if (error instanceof Error) {
    if (
      /quota|storage|database|indexeddb|unknownerror|aborterror/i.test(error.name + error.message)
    )
      return 'Could not save to this device. Check available storage and browser storage settings, then try again. Your changes have not been saved.';
    return error.message;
  }
  return 'Something went wrong. Your changes have not been saved. Please try again.';
}
export function duplicateOf(card: Card, hash: string, code: BarcodeCandidate) {
  return (
    card.imageHash === hash ||
    (code.decoded &&
      card.barcode.decoded &&
      card.barcode.format === code.format &&
      card.barcode.bytes.join(',') === code.bytes.join(','))
  );
}
export async function saveCard(
  fields: CardFields,
  original: Blob,
  imageHash: string,
  code: BarcodeCandidate,
  allowDuplicate = false,
  database = db,
) {
  validateFields(fields);
  const id = createId();
  const originalImageId = `${id}:original`,
    cropImageId = `${id}:crop`,
    displayImageId = code.verified && code.rendered ? `${id}:rendered` : cropImageId;
  const now = Date.now();
  const card: Card = {
    ...fields,
    retailer: fields.retailer.trim(),
    pin: fields.pin || undefined,
    id,
    originalImageId,
    imageHash,
    archived: false,
    addedAt: now,
    updatedAt: now,
    barcode: {
      text: code.text,
      bytes: code.bytes,
      format: code.format,
      symbology: code.symbology,
      symbologyIdentifier: code.symbologyIdentifier,
      decoded: code.decoded,
      verified: code.verified,
      cropImageId,
      displayImageId,
    },
  };
  await database.transaction('rw', database.cards, database.images, async () => {
    if (
      !allowDuplicate &&
      (await database.cards.toArray()).some((c) => duplicateOf(c, imageHash, code))
    )
      throw new DuplicateError();
    await database.images.bulkAdd([
      { id: originalImageId, blob: original, kind: 'original' },
      { id: cropImageId, blob: code.crop, kind: 'crop' },
      ...(displayImageId !== cropImageId
        ? [{ id: displayImageId, blob: code.rendered!, kind: 'rendered' as const }]
        : []),
    ]);
    await database.cards.add(card);
  });
  return card;
}
export async function editCard(id: string, fields: CardFields, database = db) {
  validateFields(fields);
  await database.transaction('rw', database.cards, database.spends, async () => {
    const card = await database.cards.get(id);
    if (!card) throw new Error('Card could not be found.');
    const updated = {
      ...card,
      ...fields,
      retailer: fields.retailer.trim(),
      pin: fields.pin || undefined,
      updatedAt: Date.now(),
    };
    if (remaining(updated, await database.spends.where('cardId').equals(id).toArray()) < 0)
      throw new Error('Starting balance cannot be lower than recorded spending.');
    await database.cards.put(updated);
  });
}
export async function setArchived(id: string, archived: boolean, database = db) {
  const count = await database.cards.update(id, { archived, updatedAt: Date.now() });
  if (!count) throw new Error('Card could not be found.');
}
export async function saveSpend(
  cardId: string,
  amountCents: number,
  spentAt: number,
  id?: string,
  database = db,
) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000)
    throw new Error('Spending must be a positive CAD amount.');
  if (!Number.isFinite(spentAt)) throw new Error('Choose a valid spending date.');
  return database.transaction('rw', database.cards, database.spends, async () => {
    const card = await database.cards.get(cardId);
    if (!card) throw new Error('Card could not be found.');
    const old = id ? await database.spends.get(id) : undefined;
    if (id && (!old || old.cardId !== cardId))
      throw new Error('Spending entry could not be found.');
    const entries = await database.spends.where('cardId').equals(cardId).toArray();
    if (
      amountCents >
      remaining(
        card,
        entries.filter((s) => s.id !== id),
      )
    )
      throw new Error('This amount exceeds the remaining balance.');
    const now = Date.now();
    const entry: Spend = {
      id: id || createId(),
      cardId,
      amountCents,
      spentAt,
      addedAt: old?.addedAt ?? now,
      updatedAt: now,
    };
    await database.spends.put(entry);
    await database.cards.update(cardId, { updatedAt: now });
    return entry;
  });
}
export async function deleteSpend(cardId: string, id: string, database = db) {
  await database.transaction('rw', database.cards, database.spends, async () => {
    const entry = await database.spends.get(id);
    if (!entry || entry.cardId !== cardId) throw new Error('Spending entry could not be found.');
    await database.spends.delete(id);
    await database.cards.update(cardId, { updatedAt: Date.now() });
  });
}
