/** Sign-in URLs for auth-gated deck builder flows. */
export function deckBuildReturnPath(slug: string, subpath = "professor"): string {
  return `/s/${encodeURIComponent(slug)}/inventory/${subpath.replace(/^\//, "")}`;
}

export function deckBuildSignInHref(slug: string, returnPath: string): string {
  const params = new URLSearchParams({
    store: slug,
    return: "1",
    redirect: returnPath,
  });
  return `/sign-in?${params.toString()}`;
}

export function professorPathFromPile(slug: string): string {
  return `/s/${encodeURIComponent(slug)}/inventory/professor?fromPile=1`;
}

export function normalizeDeckBuildRedirectPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/s/")) return null;
  if (trimmed.includes("://")) return null;
  return trimmed;
}
