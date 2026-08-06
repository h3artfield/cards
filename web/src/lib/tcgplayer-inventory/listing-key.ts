/** Stable upsert key for TCGplayer inventory export rows. */
export function buildTcgplayerListingKey(
  productId: string,
  condition: string,
): string {
  const id = productId.trim();
  const cond = normalizeTcgplayerCondition(condition);
  return `${id}|${cond}`;
}

export function normalizeTcgplayerCondition(condition: string): string {
  return condition.trim().toLowerCase().replace(/\s+/g, " ");
}
