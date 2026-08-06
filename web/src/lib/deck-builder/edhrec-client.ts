import type {
  EdhrecCardRecommendation,
  EdhrecCommanderMeta,
  EdhrecThemeLink,
} from "./types";

const EDHREC_JSON_BASE = "https://json.edhrec.com/pages";
const USER_AGENT = "CardScanner9000/1.0 (https://cardscanner9000.com)";
const SCRYFALL_USER_AGENT =
  process.env.SCRYFALL_USER_AGENT ??
  "CardScanner9000/1.0 (https://cardscanner9000.com)";

export function commanderNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

interface EdhrecCardView {
  id?: string;
  name?: string;
  sanitized?: string;
  slug?: string;
  synergy?: number;
  inclusion?: number;
  num_decks?: number;
  potential_decks?: number;
}

interface EdhrecCardList {
  header?: string;
  tag?: string;
  cardviews?: EdhrecCardView[];
}

interface EdhrecPageJson {
  header?: string;
  panels?: {
    taglinks?: Array<{ slug?: string; value?: string; count?: number }>;
    mana_curve?: Record<string, number>;
  };
  container?: {
    json_dict?: {
      cardlists?: EdhrecCardList[];
      card?: {
        id?: string;
        name?: string;
        rank?: number;
        num_decks?: number;
        color_identity?: string[];
        salt?: number;
        scryfall_uri?: string;
      };
    };
  };
  similar?: string[];
  bracket_counts?: Record<string, number>;
  budget_counts?: Record<string, number>;
  tag_counts?: Record<string, number>;
}

async function fetchEdhrecJson(path: string): Promise<EdhrecPageJson | null> {
  const url = `${EDHREC_JSON_BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as EdhrecPageJson;
  } catch {
    return null;
  }
}

function flattenRecommendations(
  cardlists: EdhrecCardList[] | undefined,
): EdhrecCardRecommendation[] {
  const out: EdhrecCardRecommendation[] = [];
  const seen = new Set<string>();

  for (const list of cardlists ?? []) {
    const category = list.header ?? list.tag ?? "other";
    const categoryTag = list.tag ?? category.toLowerCase().replace(/\s+/g, "");
    for (const view of list.cardviews ?? []) {
      if (!view.id || !view.name) continue;
      if (seen.has(view.id)) continue;
      seen.add(view.id);
      const potential = view.potential_decks ?? 0;
      const numDecks = view.num_decks ?? 0;
      const inclusion =
        view.inclusion ??
        (potential > 0 ? numDecks / potential : 0);
      out.push({
        scryfallId: view.id,
        name: view.name,
        slug: view.slug ?? view.sanitized ?? commanderNameToSlug(view.name),
        category,
        categoryTag,
        synergy: view.synergy ?? 0,
        inclusion,
        numDecks,
        potentialDecks: potential,
      });
    }
  }
  return out;
}

export function parseEdhrecCommanderPage(
  json: EdhrecPageJson,
  commanderSlug: string,
  themeSlug?: string,
): EdhrecCommanderMeta {
  const dict = json.container?.json_dict;
  const card = dict?.card;
  const themes: EdhrecThemeLink[] = (json.panels?.taglinks ?? []).map((t) => ({
    slug: t.slug ?? commanderNameToSlug(t.value ?? ""),
    label: t.value ?? t.slug ?? "",
    count: t.count ?? 0,
  }));

  const id = themeSlug
    ? `${commanderSlug}__${themeSlug}`
    : commanderSlug;

  return {
    id,
    commanderSlug,
    themeSlug,
    commanderName: card?.name ?? commanderSlug.replace(/-/g, " "),
    scryfallId: card?.id,
    rank: card?.rank,
    numDecks: card?.num_decks ?? json.tag_counts?.[themes[0]?.label ?? ""],
    colorIdentity: card?.color_identity ?? [],
    salt: card?.salt,
    bracketCounts: json.bracket_counts,
    budgetCounts: json.budget_counts,
    tagCounts: json.tag_counts,
    themes,
    recommendations: flattenRecommendations(dict?.cardlists),
    similarCommanders: json.similar ?? [],
    manaCurve: json.panels?.mana_curve,
    syncedAt: new Date().toISOString(),
  };
}

export async function fetchEdhrecCommanderMeta(
  commanderSlug: string,
  themeSlug?: string,
): Promise<EdhrecCommanderMeta | null> {
  const path = themeSlug
    ? `/commanders/${commanderSlug}/${themeSlug}.json`
    : `/commanders/${commanderSlug}.json`;
  const json = await fetchEdhrecJson(path);
  if (!json) return null;
  return parseEdhrecCommanderPage(json, commanderSlug, themeSlug);
}

interface TopCommanderRow {
  name?: string;
  slug?: string;
  num_decks?: number;
  rank?: number;
}

interface TopCommanderEntry {
  slug: string;
  name: string;
  rank: number;
  numDecks: number;
}

function parseEdhrecTopCommanderEntries(
  json: EdhrecPageJson,
): TopCommanderEntry[] {
  const entries =
    (json as { container?: { json_dict?: { cardviews?: TopCommanderRow[] } } })
      .container?.json_dict?.cardviews ??
    (json as { cardviews?: TopCommanderRow[] }).cardviews ??
    [];

  return entries
    .map((e, idx) => ({
      slug: e.slug ?? commanderNameToSlug(e.name ?? ""),
      name: e.name ?? e.slug ?? "",
      rank: e.rank ?? idx + 1,
      numDecks: e.num_decks ?? 0,
    }))
    .filter((e) => e.slug);
}

async function fetchTopCommandersFromScryfall(
  limit: number,
): Promise<TopCommanderEntry[]> {
  const out: TopCommanderEntry[] = [];
  let url =
    "https://api.scryfall.com/cards/search?q=is:commander&unique=cards&order=edhrec";

  while (url && out.length < limit) {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": SCRYFALL_USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) break;

    const body = (await res.json()) as {
      data?: Array<{ name?: string; edhrec_rank?: number }>;
      has_more?: boolean;
      next_page?: string;
    };

    for (const card of body.data ?? []) {
      if (!card.name) continue;
      out.push({
        slug: commanderNameToSlug(card.name),
        name: card.name,
        rank: card.edhrec_rank ?? out.length + 1,
        numDecks: 0,
      });
      if (out.length >= limit) break;
    }

    url = body.has_more && body.next_page ? body.next_page : "";
    if (url) await sleep(120);
  }

  return out.slice(0, limit);
}

export async function fetchEdhrecTopCommanders(
  limit = 500,
): Promise<Array<{ slug: string; name: string; rank: number; numDecks: number }>> {
  const json = await fetchEdhrecJson("/top/commanders.json");
  const fromEdhrec = json ? parseEdhrecTopCommanderEntries(json) : [];

  if (fromEdhrec.length > 0) {
    return fromEdhrec.slice(0, limit);
  }

  return fetchTopCommandersFromScryfall(limit);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
