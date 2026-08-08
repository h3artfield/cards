/**
 * QuoteSpanDetector — locate candidate quoted spans in Oracle clause text.
 * Detection is separate from granted-rules classification.
 */
export type QuoteDelimiter = '"' | '\u201c' | '\u201d';

export interface DetectedQuoteSpan {
  localStart: number;
  localEnd: number;
  text: string;
  innerText: string;
  openDelimiter: QuoteDelimiter;
  closeDelimiter: QuoteDelimiter;
}

const OPEN_DELIMITERS = new Set(['"', '\u201c', '\u201d']);
const CLOSE_FOR: Record<string, string> = {
  '"': '"',
  '\u201c': '\u201d',
  '\u201d': '\u201d',
};

function isQuoteChar(ch: string): ch is QuoteDelimiter {
  return OPEN_DELIMITERS.has(ch);
}

function findClosingQuote(text: string, openIdx: number): number {
  const open = text[openIdx]!;
  const expectedClose = CLOSE_FOR[open] ?? open;
  for (let i = openIdx + 1; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === expectedClose && text[i - 1] !== '\\') return i + 1;
    if (open === '"' && ch === '"' && text[i - 1] !== '\\') return i + 1;
  }
  return text.length;
}

function unquote(text: string): string {
  const t = text.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('\u201c') && t.endsWith('\u201d'))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Detect all balanced quote spans (straight and curly). */
export function detectQuoteSpans(paragraph: string): DetectedQuoteSpan[] {
  const spans: DetectedQuoteSpan[] = [];
  for (let i = 0; i < paragraph.length; i++) {
    const ch = paragraph[i]!;
    if (!isQuoteChar(ch)) continue;
    const close = findClosingQuote(paragraph, i);
    const text = paragraph.slice(i, close);
    spans.push({
      localStart: i,
      localEnd: close,
      text,
      innerText: unquote(text),
      openDelimiter: ch,
      closeDelimiter: (CLOSE_FOR[ch] ?? ch) as QuoteDelimiter,
    });
    i = close - 1;
  }
  return spans;
}

/** Map local span to absolute card offset. */
export function absoluteQuoteSpan(input: {
  paragraphStart: number;
  span: DetectedQuoteSpan;
}): { absStart: number; absEnd: number } {
  return {
    absStart: input.paragraphStart + input.span.localStart,
    absEnd: input.paragraphStart + input.span.localEnd,
  };
}
