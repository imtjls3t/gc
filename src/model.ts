export type Expiry = { kind: 'unknown' } | { kind: 'none' } | { kind: 'date'; date: string };
export interface Barcode {
  text: string;
  bytes: number[];
  format: string;
  symbology: string;
  symbologyIdentifier: string;
  verified: boolean;
  decoded: boolean;
  cropImageId: string;
  displayImageId: string;
}
export interface Card {
  id: string;
  retailer: string;
  originalCents: number;
  startingCents: number;
  pin?: string;
  expiry: Expiry;
  barcode: Barcode;
  originalImageId: string;
  imageHash: string;
  archived: boolean;
  addedAt: number;
  updatedAt: number;
}
export interface Spend {
  id: string;
  cardId: string;
  amountCents: number;
  spentAt: number;
  addedAt: number;
  updatedAt: number;
}
export interface StoredImage {
  id: string;
  blob: Blob;
  kind: 'original' | 'crop' | 'rendered';
}
export type CardFields = Pick<
  Card,
  'retailer' | 'originalCents' | 'startingCents' | 'pin' | 'expiry'
>;
export interface BarcodeCandidate {
  text: string;
  bytes: number[];
  format: string;
  symbology: string;
  symbologyIdentifier: string;
  decoded: boolean;
  verified: boolean;
  crop: Blob;
  rendered?: Blob;
}

export function parseMoney(value: string): number {
  const text = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text))
    throw new Error('Enter a CAD amount with up to two decimal places.');
  const [dollars, cents = ''] = text.split('.');
  const result = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 100_000_000)
    throw new Error('Amount is too large.');
  return result;
}
export function centsInput(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  const padded = digits.padStart(3, '0');
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}
export const money = (cents: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
export const moneyInput = (cents: number) => (cents / 100).toFixed(2);
export const remaining = (card: Card, spends: Spend[]) =>
  card.startingCents -
  spends.filter((s) => s.cardId === card.id).reduce((n, s) => n + s.amountCents, 0);
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function expiryLabel(expiry: Expiry) {
  if (expiry.kind === 'unknown') return 'Expiry not recorded';
  if (expiry.kind === 'none') return 'No expiry';
  return `Expires ${new Date(`${expiry.date}T12:00:00`).toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
export function validateFields(fields: CardFields) {
  if (!fields.retailer.trim()) throw new Error('Enter a retailer.');
  for (const amount of [fields.originalCents, fields.startingCents]) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100_000_000)
      throw new Error('Enter a valid amount in cents.');
  }
  if (fields.startingCents > fields.originalCents)
    throw new Error('Starting balance cannot exceed the original amount.');
  if (fields.expiry.kind === 'date' && !validDate(fields.expiry.date))
    throw new Error('Choose a valid expiry date.');
  if (fields.pin !== undefined && typeof fields.pin !== 'string')
    throw new Error('PIN must be text.');
}
export function localDateTime(timestamp = Date.now()) {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const timestampLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
