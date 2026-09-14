import { describe, expect, it } from 'vitest';
import { parseMoney, validDate, expiryLabel } from '../src/model';
import { recognizeText } from '../src/recognition';

describe('CAD values', () => {
  it.each([
    ['0', 0],
    ['0.01', 1],
    ['0.10', 10],
    ['50.5', 5050],
    ['100.99', 10099],
    ['001.02', 102],
  ])('parses %s into exact cents', (text, cents) => expect(parseMoney(text)).toBe(cents));
  it.each(['-1', '1.001', '1e2', 'Infinity', 'NaN', '1,000', '', '1000001', '0.1x'])(
    'rejects invalid money %s',
    (text) => expect(() => parseMoney(text)).toThrow(),
  );
  it('validates calendar dates without timezone changes', () => {
    expect(validDate('2030-02-30')).toBe(false);
    expect(validDate('2028-02-29')).toBe(true);
    expect(validDate('2027-02-29')).toBe(false);
    expect(expiryLabel({ kind: 'unknown' })).toBe('Expiry not recorded');
  });
});
describe('conservative screenshot recognition', () => {
  it('recognizes Costco with leading-zero PIN separate from card number', () => {
    const result = recognizeText(
      'COSTCO Shop Card\nOriginal amount CAD $100.00\nCard number: 0001234567890001\nPIN number: 0042\nExpires: 2030-12-31',
    );
    expect(result).toMatchObject({
      retailer: 'Costco',
      amount: '100.00',
      pin: '0042',
      expiry: { kind: 'date', date: '2030-12-31' },
    });
  });
  it('recognizes Starbucks and a labelled security code without fixed length', () => {
    expect(recognizeText('STARBUCKS\n$25\nSecurity code:\n000000782\nNever expires')).toMatchObject(
      { retailer: 'Starbucks', amount: '25.00', pin: '000000782', expiry: { kind: 'none' } },
    );
  });
  it('keeps missing PIN and expiry unknown, without treating card numbers as PINs', () => {
    expect(recognizeText('Starbucks\nCard number 00012345678')).toMatchObject({
      pin: '',
      expiry: { kind: 'unknown' },
      amount: '',
    });
  });
  it('requires review of different PINs and amounts', () => {
    const result = recognizeText(
      'Costco\nValue $100.00\nBalance $50.00\nPIN: 0042\nSecurity code: 0057',
    );
    expect(result.pin).toBe('');
    expect(result.amount).toBe('');
    expect(result.warnings.join(' ')).toContain('Several PINs');
  });
  it.each(['01/02/2030', '04/05/29', '2030-02-30', 'tomorrow'])(
    'leaves ambiguous or invalid expiry %s unknown',
    (date) => expect(recognizeText(`Costco\nExpires: ${date}`).expiry).toEqual({ kind: 'unknown' }),
  );
  it.each([
    ['31/12/2030', '2030-12-31'],
    ['12/31/2030', '2030-12-31'],
    ['December 31, 2030', '2030-12-31'],
    ['31 Dec 2030', '2030-12-31'],
  ])('handles unambiguous date %s', (date, expected) =>
    expect(recognizeText(`Expires: ${date}`).expiry).toEqual({ kind: 'date', date: expected }),
  );
  it('does not guess when expiry evidence conflicts', () => {
    expect(recognizeText('No expiry\nExpires: 2030-12-31').expiry).toEqual({ kind: 'unknown' });
    expect(recognizeText('Expires 2030-01-31\nExpires 2031-01-31').expiry).toEqual({
      kind: 'unknown',
    });
    expect(recognizeText('Expires 2030-01-31 or 2031-01-31').expiry).toEqual({ kind: 'unknown' });
    expect(recognizeText('Expires 2030-01-31; valid until 2031-01-31').expiry).toEqual({
      kind: 'unknown',
    });
  });
});
