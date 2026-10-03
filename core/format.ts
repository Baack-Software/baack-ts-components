// Value formatting shared by every renderer. Pure functions, no DOM.

import type { MoneyItem } from '@baack-software/baack-ts-client';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, entity: string) => ENTITIES[entity] ?? '');
}

/**
 * Text items are plain text, but some legacy values carry HTML (`<p>`
 * wrappers, `<br/>`). Keep only that structure: `<p>` becomes a paragraph and
 * `<br>` a line break; other tags are dropped. Returns paragraphs, each a list
 * of lines. The result is text, never markup.
 */
export function textParagraphs(value: string): string[][] {
  const normalised = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '');
  return decode(normalised)
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0);
}

/** Lines of a text value for inline use: paragraphs flattened into consecutive lines. */
export function textLines(value: string): string[] {
  return textParagraphs(value).flat();
}

// http(s) URLs and email addresses, without trailing sentence punctuation.
const LINKABLE = /(https?:\/\/[^\s)]+[^\s).,;:!?]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

export type TextSegment = { text: string } | { text: string; href: string };

/** Splits text into plain runs and links (URLs and email addresses). */
export function linkSegments(text: string): TextSegment[] {
  return text
    .split(LINKABLE)
    .map((part, index): TextSegment | undefined => {
      if (part === '') return undefined;
      if (index % 2 === 0) return { text: part };
      return { text: part, href: part.includes('@') && !part.startsWith('http') ? `mailto:${part}` : part };
    })
    .filter((segment): segment is TextSegment => segment !== undefined);
}

/** Digits after the decimal point for a currency: 2 for GBP, 0 for JPY. */
export function currencyDigits(currencyCode: string): number {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currencyCode }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * The decimal amount of a money item, preferring the API's formatting. Built
 * from integer minor units with string arithmetic, never floating point.
 */
export function moneyAmount(item: Pick<MoneyItem, 'formattedValue' | 'unitValue' | 'currencyCode'>): string {
  if (item.formattedValue) return item.formattedValue;
  return minorToMajor(item.unitValue, currencyDigits(item.currencyCode));
}

export function moneySymbol(item: Pick<MoneyItem, 'currencySymbol' | 'currencyCode'>): string {
  if (item.currencySymbol) return item.currencySymbol;
  try {
    const parts = new Intl.NumberFormat('en-GB', { style: 'currency', currency: item.currencyCode }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? item.currencyCode;
  } catch {
    return item.currencyCode;
  }
}

/** 1250, 2 → "12.50"; -5, 2 → "-0.05"; 1250, 0 → "1250". */
export function minorToMajor(units: number, digits: number): string {
  const negative = units < 0;
  const whole = String(Math.abs(Math.trunc(units)));
  if (digits === 0) return (negative ? '-' : '') + whole;
  const padded = whole.padStart(digits + 1, '0');
  return `${negative ? '-' : ''}${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
}

/** "12.5", 2 → 1250. Undefined when the text is not an amount with at most `digits` decimals. */
export function majorToMinor(text: string, digits: number): number | undefined {
  const match = /^\s*(-)?(\d+)(?:\.(\d*))?\s*$/.exec(text);
  if (!match) return undefined;
  const [, sign, whole = '0', fraction = ''] = match;
  if (fraction.length > digits) return undefined;
  const units = Number(whole + fraction.padEnd(digits, '0'));
  if (!Number.isSafeInteger(units)) return undefined;
  return sign ? -units : units;
}

/** Parses an API timestamp as UTC. The API omits the zone, and Date.parse would read that as local time. */
export function parseTimestamp(value: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
}

export interface DateFormat {
  locale?: string | undefined;
  dateStyle?: 'full' | 'long' | 'medium' | 'short' | undefined;
  timeStyle?: 'full' | 'long' | 'medium' | 'short' | undefined;
  /** Defaults to UTC, so a build server and a browser render the same text. */
  timeZone?: string | undefined;
}

export function formatDate(value: string, format: DateFormat): string {
  const time = parseTimestamp(value);
  if (Number.isNaN(time)) return value;
  const options: Intl.DateTimeFormatOptions = { timeZone: format.timeZone ?? 'UTC' };
  if (format.dateStyle) options.dateStyle = format.dateStyle;
  if (format.timeStyle) options.timeStyle = format.timeStyle;
  if (!format.dateStyle && !format.timeStyle) options.dateStyle = 'medium';
  return new Intl.DateTimeFormat(format.locale ?? 'en-GB', options).format(time);
}

export function formatNumber(value: number, locale: string | undefined): string {
  return new Intl.NumberFormat(locale ?? 'en-GB', { maximumFractionDigits: 20 }).format(value);
}
