/**
 * Pinned commander facts resolved from frozen golden catalog — no hand-authored oracle text.
 */
import {
  combinedGoldenOracleText,
  goldenOracleTextHash,
  lookupGoldenByName,
  type GoldenCatalogIndex,
  type GoldenCatalogOracleCard,
} from "./load-golden-catalog-index";

export type CommanderCatalogPin = {
  commanderName: string;
  oracleId: string;
  scryfallId: string;
  oracleText: string;
  catalogVersion: string;
  oracleTextSha256: string;
};

export type CommanderCanonicalFacts = CommanderCatalogPin & {
  commanderPins?: CommanderCatalogPin[];
  commanderRelevantAbilities: string[];
  zoneRestrictions: string[];
  activationRequirements: string[];
  relevantRulesFacts: string[];
  status?: "AVAILABLE" | "UNAVAILABLE";
};

function canonicalPrintingRef(card: GoldenCatalogOracleCard): string {
  return card.printingIds?.[0] ?? card.id;
}

function deriveStructuredFacts(card: GoldenCatalogOracleCard, oracleText: string): Pick<
  CommanderCanonicalFacts,
  "commanderRelevantAbilities" | "zoneRestrictions" | "activationRequirements" | "relevantRulesFacts"
> {
  const lower = oracleText.toLowerCase();
  const abilities: string[] = [];
  const zones: string[] = [];
  const activations: string[] = [];
  const rules: string[] = [];

  for (const kw of card.keywords ?? []) {
    abilities.push(`keyword:${kw.toLowerCase().replace(/\s+/g, "_")}`);
  }
  if (/\bpartner\b/.test(lower)) abilities.push("mechanic:partner");
  if (/\beminence\b/.test(lower)) abilities.push("mechanic:eminence");
  if (/\btransform\b/.test(lower) || card.layout === "transform") abilities.push("mechanic:transform");
  if (/\bmill\b/.test(lower)) abilities.push("zone:mill");
  if (/\bgraveyard\b/.test(lower)) zones.push("graveyard");
  if (/\bexile\b/.test(lower)) zones.push("exile");
  if (/\blibrary\b/.test(lower)) zones.push("library");
  if (/\bcommand zone\b/.test(lower)) zones.push("command_zone");
  if (/\b\{t\}\b/i.test(oracleText) || /\btap\b/i.test(lower)) activations.push("activated:tap");
  if (/\bsacrifice\b/.test(lower)) activations.push("cost:sacrifice");
  if (/\battack\b/.test(lower)) activations.push("timing:attack");
  if (/\bend step\b/.test(lower) || /\bend of turn\b/.test(lower)) activations.push("timing:end_step");
  if (/\btoken/.test(lower)) abilities.push("output:token");
  if (/\bdraw\b/.test(lower)) abilities.push("output:draw");
  if (/\bdamage\b/.test(lower)) abilities.push("output:damage");
  if (/\bcounter/.test(lower)) abilities.push("output:counter");
  if (card.cardFaces?.length && card.cardFaces.length > 1) {
    rules.push(`Double-faced card with ${card.cardFaces.length} faces.`);
  }
  if (rules.length === 0) rules.push("Oracle-derived structured facts only; no hand-authored ability text.");

  return {
    commanderRelevantAbilities: [...new Set(abilities)],
    zoneRestrictions: [...new Set(zones)],
    activationRequirements: [...new Set(activations)],
    relevantRulesFacts: rules,
  };
}

export function resolveCommanderCatalogPin(
  catalog: GoldenCatalogIndex,
  commanderName: string,
): CommanderCatalogPin {
  const card = lookupGoldenByName(catalog, commanderName);
  if (!card) throw new Error(`Commander not found in golden catalog: ${commanderName}`);
  const oracleText = combinedGoldenOracleText(card);
  return {
    commanderName: card.canonicalName,
    oracleId: card.oracleId,
    scryfallId: canonicalPrintingRef(card),
    oracleText,
    catalogVersion: catalog.catalogVersion,
    oracleTextSha256: goldenOracleTextHash(oracleText),
  };
}

export function canonicalFactsForCommanders(
  catalog: GoldenCatalogIndex,
  commanders: string[],
): CommanderCanonicalFacts {
  if (commanders.length === 0) throw new Error("At least one commander required");
  const pins = commanders.map((name) => resolveCommanderCatalogPin(catalog, name));
  const primary = lookupGoldenByName(catalog, commanders[0])!;
  const oracleText = pins.map((p) => p.oracleText).join("\n//\n");
  const derived = deriveStructuredFacts(primary, oracleText);
  return {
    ...pins[0],
    commanderName: commanders.join(" // "),
    oracleText,
    oracleTextSha256: goldenOracleTextHash(oracleText),
    commanderPins: pins.length > 1 ? pins : undefined,
    ...derived,
    status: "AVAILABLE",
  };
}

export function verifySnapshotCommanderPins(
  catalog: GoldenCatalogIndex,
  snapshot: {
    commanders: string[];
    frozenFacts: Record<string, unknown>;
  },
): string[] {
  const errors: string[] = [];
  const facts = snapshot.frozenFacts as Partial<CommanderCanonicalFacts>;
  const pins = facts.commanderPins?.length
    ? facts.commanderPins
    : snapshot.commanders.map((name) => {
        const pin = resolveCommanderCatalogPin(catalog, name);
        return pin;
      });

  if (pins.length !== snapshot.commanders.length) {
    errors.push(`commander pin count ${pins.length} != commanders ${snapshot.commanders.length}`);
  }

  for (let i = 0; i < snapshot.commanders.length; i++) {
    const name = snapshot.commanders[i];
    const expected = resolveCommanderCatalogPin(catalog, name);
    const pinned = pins[i];
    if (!pinned) {
      errors.push(`${name}: missing commander pin`);
      continue;
    }
    if (pinned.oracleId !== expected.oracleId) {
      errors.push(`${name}: oracleId mismatch (snapshot ${pinned.oracleId} vs catalog ${expected.oracleId})`);
    }
    if (pinned.oracleTextSha256 !== expected.oracleTextSha256) {
      errors.push(`${name}: oracleTextSha256 mismatch`);
    }
    if (pinned.oracleText !== expected.oracleText) {
      errors.push(`${name}: oracleText byte mismatch vs frozen catalog`);
    }
    if (pinned.catalogVersion !== expected.catalogVersion) {
      errors.push(`${name}: catalogVersion mismatch`);
    }
  }

  if (!facts.oracleId) errors.push("frozenFacts missing oracleId pin");
  if (!facts.oracleTextSha256) errors.push("frozenFacts missing oracleTextSha256 pin");
  if (!facts.catalogVersion) errors.push("frozenFacts missing catalogVersion pin");
  if (!facts.scryfallId) errors.push("frozenFacts missing scryfallId pin");
  return errors;
}
