/**
 * Compiled CommanderSpellbook index for goldfish policy v2.
 * Reuses the in-repo full mirror; does not scrape.
 */
import {
  isTerminalFeatureSet,
  tokensFromFeatures,
  type CompiledVariant,
  type SpellbookUse,
  type WinZone,
} from "./goldfish-resource-graph-v2";

export const DR_SPELLBOOK_INDEX_V2 = "deck-rating-goldfish-spellbook-index-v2";

export type FrozenTemplate = {
  id: number;
  name: string;
  scryfallQuery: string | null;
  oracleIds: string[];
  names: string[];
  n: number;
  resolver: "local-oracle-query" | "local-heuristic" | "empty";
};

export type SpellbookIndex = {
  version: string;
  variants: CompiledVariant[];
  templates: Map<number, FrozenTemplate>;
  byOracleId: Map<string, number[]>;
};

function zonesOf(locs: string[] | undefined): WinZone[] {
  const out: WinZone[] = [];
  for (const z of locs ?? []) {
    if (z === "H" || z === "B" || z === "G" || z === "L" || z === "E" || z === "C") out.push(z);
  }
  return out.length ? out : ["H", "B"];
}

export type RawSpellbookVariant = {
  id: string;
  status?: string;
  legalities?: { commander?: boolean };
  uses?: Array<{
    card?: { oracleId?: string; name?: string };
    zoneLocations?: string[];
    mustBeCommander?: boolean;
  }>;
  requires?: Array<{ template?: { id?: number; name?: string } }>;
  produces?: Array<{ feature?: { name?: string } }>;
  manaNeeded?: string;
  manaValueNeeded?: number;
  notablePrerequisites?: string;
};

export function compileVariant(raw: RawSpellbookVariant): CompiledVariant | null {
  if (raw.status && raw.status !== "OK") return null;
  if (raw.legalities && raw.legalities.commander === false) return null;
  const uses: SpellbookUse[] = [];
  for (const u of raw.uses ?? []) {
    const oracleId = u.card?.oracleId ?? "";
    const name = u.card?.name ?? "";
    if (!oracleId && !name) return null;
    uses.push({
      oracleId,
      name,
      zones: zonesOf(u.zoneLocations),
      mustBeCommander: Boolean(u.mustBeCommander),
    });
  }
  const tokens = tokensFromFeatures(
    (raw.produces ?? []).map((p) => ({ name: p.feature?.name ?? "" })),
    `variant:${raw.id}`,
  );
  if (!tokens.length) return null;
  const templateIds = (raw.requires ?? [])
    .map((r) => r.template?.id)
    .filter((id): id is number => typeof id === "number");
  return {
    id: raw.id,
    uses,
    templateIds,
    tokens,
    manaNeeded: raw.manaNeeded ?? "",
    manaValueNeeded: Number(raw.manaValueNeeded ?? 0),
    notablePrerequisites: raw.notablePrerequisites ?? "",
    terminal: isTerminalFeatureSet(tokens),
  };
}

export function buildSpellbookIndex(variants: CompiledVariant[], templates: FrozenTemplate[]): SpellbookIndex {
  const byOracleId = new Map<string, number[]>();
  variants.forEach((v, i) => {
    for (const u of v.uses) {
      if (!u.oracleId) continue;
      const list = byOracleId.get(u.oracleId) ?? [];
      list.push(i);
      byOracleId.set(u.oracleId, list);
    }
  });
  return {
    version: DR_SPELLBOOK_INDEX_V2,
    variants,
    templates: new Map(templates.map((t) => [t.id, t])),
    byOracleId,
  };
}

export function deckSatisfiesTemplate(deckIds: Set<string>, template: FrozenTemplate | undefined): boolean {
  if (!template) return false;
  for (const id of template.oracleIds) if (deckIds.has(id)) return true;
  return false;
}

export type DeckLineHit = {
  variant: CompiledVariant;
  strict: boolean;
  withTemplates: boolean;
};

export function completeVariantsForDeck(
  index: SpellbookIndex,
  deckOracleIds: Set<string>,
  opts?: { terminalOnly?: boolean },
): DeckLineHit[] {
  const seen = new Set<number>();
  const hits: DeckLineHit[] = [];
  for (const id of deckOracleIds) {
    for (const vi of index.byOracleId.get(id) ?? []) seen.add(vi);
  }
  for (const vi of seen) {
    const v = index.variants[vi]!;
    if (opts?.terminalOnly && !v.terminal) continue;
    const namedOk = v.uses.every((u) => !u.oracleId || deckOracleIds.has(u.oracleId));
    if (!namedOk) continue;
    const tplOk = v.templateIds.every((tid) => deckSatisfiesTemplate(deckOracleIds, index.templates.get(tid)));
    hits.push({ variant: v, strict: namedOk && v.templateIds.length === 0, withTemplates: namedOk && tplOk });
  }
  return hits;
}

export function buildableVariantsForDeck(index: SpellbookIndex, deckOracleIds: Set<string>): CompiledVariant[] {
  return completeVariantsForDeck(index, deckOracleIds).filter((h) => h.withTemplates).map((h) => h.variant);
}

export function templatePredicate(index: SpellbookIndex) {
  return (templateId: number, _names: Set<string>, oracleIds: Set<string>) =>
    deckSatisfiesTemplate(oracleIds, index.templates.get(templateId));
}

export type FrozenSpellbookFiles = {
  templates: FrozenTemplate[];
  variants: CompiledVariant[];
};

export function indexFromFrozen(files: FrozenSpellbookFiles): SpellbookIndex {
  return buildSpellbookIndex(files.variants, files.templates);
}
