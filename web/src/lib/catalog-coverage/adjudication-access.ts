export function getAdjudicationAccessToken(): string | null {
  const token = process.env.CATALOG_COVERAGE_ADJUDICATION_ACCESS_TOKEN?.trim();
  return token || null;
}

export function isAdjudicationAccessConfigured(): boolean {
  return Boolean(getAdjudicationAccessToken());
}

export function verifyAdjudicationAccessToken(provided: string | null | undefined): boolean {
  const expected = getAdjudicationAccessToken();
  if (!expected) return false;
  if (!provided?.trim()) return false;
  return provided.trim() === expected;
}
