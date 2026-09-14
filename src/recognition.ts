import { type Expiry, parseMoney, validDate } from './model';

export interface Recognition {
  retailer: string;
  amount: string;
  pin: string;
  expiry: Expiry;
  warnings: string[];
}
function parseExpiry(raw: string): string | undefined {
  // A single labelled line can still contain conflicting dates or alternatives.
  if ((raw.match(/\b20\d{2}\b/g)?.length ?? 0) > 1 || /\bor\b/i.test(raw)) return undefined;
  const iso = raw.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    const date = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    return validDate(date) ? date : undefined;
  }
  const numeric = raw.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](20\d{2})\b/);
  if (numeric) {
    const a = Number(numeric[1]),
      b = Number(numeric[2]);
    if (a <= 12 && b <= 12 && a !== b) return undefined;
    const month = a > 12 ? b : a,
      day = a > 12 ? a : b;
    const date = `${numeric[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return validDate(date) ? date : undefined;
  }
  const monthNames = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ];
  const named =
    raw.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})\b/) ||
    raw.match(/\b(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(20\d{2})\b/);
  if (named) {
    const monthFirst = /^[A-Za-z]/.test(named[1]);
    const month = monthNames.indexOf(named[monthFirst ? 1 : 2].slice(0, 3).toLowerCase()) + 1;
    const date = `${named[3]}-${String(month).padStart(2, '0')}-${named[monthFirst ? 2 : 1].padStart(2, '0')}`;
    return validDate(date) ? date : undefined;
  }
}
export function recognizeText(text: string): Recognition {
  const warnings: string[] = [];
  const names = [
    /\bcostco\b/i.test(text) ? 'Costco' : '',
    /\bstarbucks\b/i.test(text) ? 'Starbucks' : '',
  ].filter(Boolean);
  const retailer = names.length === 1 ? names[0] : '';
  if (!retailer) warnings.push('Confirm the retailer name.');
  const values = [
    ...text.matchAll(
      /(?:CA\s*\$|CAD\s*\$?|\$)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?)(?![\d.])/gi,
    ),
  ].map((m) => m[1].replaceAll(',', ''));
  const unique = [
    ...new Set(
      values
        .filter((v) => {
          try {
            parseMoney(v);
            return true;
          } catch {
            return false;
          }
        })
        .map((v) => (parseMoney(v) / 100).toFixed(2)),
    ),
  ];
  const amount = unique.length === 1 ? unique[0] : '';
  if (!amount)
    warnings.push(
      unique.length
        ? 'Several amounts were found. Enter the original amount and starting balance.'
        : 'No amount was found. Enter the original amount and starting balance.',
    );
  const pins = [
    ...text.matchAll(
      /\b(?:PIN(?:\s+(?:number|code))?|security\s+code)\b[\s:#–-]*([A-Za-z0-9]+(?:[ -]\d+)*)/gi,
    ),
  ]
    .map((m) => m[1])
    .filter((v) => /\d/.test(v));
  const uniquePins = [...new Set(pins)];
  const pin = uniquePins.length === 1 ? uniquePins[0] : '';
  if (uniquePins.length > 1)
    warnings.push('Several PINs were found. Confirm the correct PIN or leave it blank.');
  else if (!pin) warnings.push('No PIN was detected. Add one if your card requires it.');
  let expiry: Expiry = { kind: 'unknown' };
  const lines = text.split(/\r?\n/);
  const expiryLines = lines.flatMap((line, index) => {
    const match = line.match(
      /\b(?:expir(?:y|es|ation)(?:\s+date)?|valid\s+(?:until|through)|exp\.)\s*:?\s*(.*)/i,
    );
    return match ? [match[1].trim() || lines[index + 1] || ''] : [];
  });
  const dates = [...new Set(expiryLines.map(parseExpiry).filter((d): d is string => !!d))];
  const explicitNone =
    /\b(?:no\s+expir(?:y|ation)(?:\s+date)?|never\s+expires|does\s+not\s+expire)\b/i.test(text);
  if (dates.length === 1 && !explicitNone && expiryLines.every((line) => !!parseExpiry(line)))
    expiry = { kind: 'date', date: dates[0] };
  else if (explicitNone && !dates.length && !expiryLines.some((line) => /\d/.test(line)))
    expiry = { kind: 'none' };
  else
    warnings.push(
      expiryLines.length || explicitNone
        ? 'Expiry is unclear. Check the screenshot and confirm it.'
        : 'Expiry was not detected. Check the expiry option.',
    );
  return { retailer, amount, pin, expiry, warnings };
}
