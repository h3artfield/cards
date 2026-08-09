/**
 * Returns true when [localStart, localEnd) lies inside a token-glossary parenthetical
 * e.g. (A Food token is an artifact with "..." A Treasure token is an artifact with "...")
 */
export function isInsideTokenGlossaryRegion(paragraph: string, localStart: number, localEnd: number): boolean {
  const parenStart = paragraph.lastIndexOf("(", localStart);
  if (parenStart < 0) return false;
  let depth = 0;
  let parenEnd = -1;
  for (let i = parenStart; i < paragraph.length; i++) {
    if (paragraph[i] === "(") depth++;
    else if (paragraph[i] === ")") {
      depth--;
      if (depth === 0) {
        parenEnd = i;
        break;
      }
    }
  }
  if (parenEnd < 0) return false;
  if (localStart < parenStart || localEnd > parenEnd + 1) return false;
  const inner = paragraph.slice(parenStart + 1, parenEnd);
  return /A \w+ token is an artifact with/i.test(inner);
}
