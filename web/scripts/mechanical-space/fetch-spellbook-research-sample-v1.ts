/**
 * Fetch a local research sample from the public Commander Spellbook API.
 * Does not write Firestore. Does not republish the curated database.
 *
 * Run: cd web && npx tsx scripts/mechanical-space/fetch-spellbook-research-sample-v1.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256Json } from "../../src/lib/mechanical-space/checksum";
import { mechanicalSpacePath } from "../../src/lib/mechanical-space/artifact-paths";
import { assertMechanicalSpaceReadOnly } from "../../src/lib/mechanical-space/safety";

assertMechanicalSpaceReadOnly("fetch-spellbook-research-sample-v1");

const API = "https://backend.commanderspellbook.com";
const OUT = mechanicalSpacePath("spellbook-reference-normalization-v1");
const PAGE = 100;
const MAX_CARDS = 8000;
const MAX_VARIANTS = 400;
const USER_AGENT = "cards-mechanical-space-local-research/1.0";

type Page<T> = { next: string | null; results: T[] };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

async function paginate<T>(path: string, max: number): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${API}${path}${path.includes("?") ? "&" : "?"}limit=${PAGE}`;
  while (url && out.length < max) {
    const page = await getJson<Page<T>>(url);
    out.push(...page.results);
    url = page.next;
    await new Promise((r) => setTimeout(r, 80));
  }
  return out.slice(0, max);
}

type SpellbookFeature = {
  id: number;
  name: string;
  uncountable: boolean;
  status: string;
};

type SpellbookCard = {
  id: number;
  name: string;
  oracleId?: string;
  typeLine?: string;
  oracleText?: string;
  features?: Array<{ id: number; feature: { id: number; name: string; uncountable: boolean; status: string }; quantity: number }>;
};

type SpellbookVariant = {
  id: string;
  of?: Array<{ id: number }>;
  includes?: Array<{ id: number }>;
  uses?: Array<{ card: { id: number; name: string; oracleId?: string; typeLine?: string }; quantity: number }>;
  requires?: Array<{ template: { id: number; name: string; scryfallQuery?: string }; quantity: number }>;
  produces?: Array<{ feature: { id: number; name: string; uncountable: boolean; status: string }; quantity: number }>;
  description?: string;
  easyPrerequisites?: string;
  notablePrerequisites?: string;
  status?: string;
};

type SpellbookTemplate = {
  id: number;
  name: string;
  scryfallQuery?: string;
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.error("Fetching Spellbook features…");
  const features = await paginate<SpellbookFeature>("/features/", 5000);
  console.error(`features=${features.length}`);

  console.error("Fetching Spellbook templates…");
  let templates: SpellbookTemplate[] = [];
  try {
    templates = await paginate<SpellbookTemplate>("/templates/", 2000);
  } catch (err) {
    console.error(`templates fetch failed: ${err instanceof Error ? err.message : err}`);
  }
  console.error(`templates=${templates.length}`);

  console.error("Fetching Spellbook cards (research cap)…");
  const cards = await paginate<SpellbookCard>("/cards/", MAX_CARDS);
  console.error(`cards=${cards.length}`);

  console.error("Fetching Spellbook variants (research cap)…");
  const variants = await paginate<SpellbookVariant>("/variants/", MAX_VARIANTS);
  console.error(`variants=${variants.length}`);

  const slimCards = cards.map((c) => ({
    id: c.id,
    name: c.name,
    oracleId: c.oracleId,
    typeLine: c.typeLine,
    oracleText: c.oracleText,
    features: (c.features ?? []).map((f) => ({
      edgeId: f.id,
      featureId: f.feature.id,
      featureName: f.feature.name,
      quantity: f.quantity,
      status: f.feature.status,
      uncountable: f.feature.uncountable,
    })),
  }));

  const slimVariants = variants.map((v) => ({
    id: v.id,
    of: (v.of ?? []).map((x) => x.id),
    includes: (v.includes ?? []).map((x) => x.id),
    uses: (v.uses ?? []).map((u) => ({
      externalCardId: u.card.id,
      name: u.card.name,
      oracleId: u.card.oracleId,
      typeLine: u.card.typeLine,
      quantity: u.quantity,
    })),
    requires: (v.requires ?? []).map((r) => ({
      templateId: r.template.id,
      name: r.template.name,
      scryfallQuery: r.template.scryfallQuery,
      quantity: r.quantity,
    })),
    produces: (v.produces ?? []).map((p) => ({
      featureId: p.feature.id,
      name: p.feature.name,
      quantity: p.quantity,
      status: p.feature.status,
      uncountable: p.feature.uncountable,
    })),
    description: v.description,
    easyPrerequisites: v.easyPrerequisites,
    notablePrerequisites: v.notablePrerequisites,
    status: v.status,
  }));

  const cardsWithFeatures = slimCards.filter((c) => c.features.length > 0);
  const positiveEdges = cardsWithFeatures.reduce((n, c) => n + c.features.length, 0);

  const provenance = {
    sourceName: "Commander Spellbook",
    sourceUrl: API,
    sourceVersionObserved: "6.2.4",
    fetchedAt: new Date().toISOString(),
    licenseNote:
      "Backend/website source is MIT. This fetch is a local research sample of curated combo data, not a production redistributable dump, and is not presented as our dataset.",
    distinction: {
      codeAndAlgorithmReference: "Inspected public docs/source; independently implemented equivalent algorithms.",
      curatedData: "Local research/testing sample only. Not mirrored to production Firestore.",
    },
  };

  const featuresPath = resolve(OUT, "features.json");
  const cardsPath = resolve(OUT, "cards-slim.json");
  const variantsPath = resolve(OUT, "variants-sample.json");
  const templatesPath = resolve(OUT, "templates.json");
  const manifestPath = resolve(OUT, "manifest.json");

  writeFileSync(featuresPath, `${JSON.stringify(features, null, 2)}\n`);
  writeFileSync(cardsPath, `${JSON.stringify(slimCards)}\n`);
  writeFileSync(variantsPath, `${JSON.stringify(slimVariants, null, 2)}\n`);
  writeFileSync(templatesPath, `${JSON.stringify(templates, null, 2)}\n`);

  const manifest = {
    version: "spellbook-reference-normalization-v1",
    provenance,
    counts: {
      features: features.length,
      cards: slimCards.length,
      cardsWithFeatures: cardsWithFeatures.length,
      positiveCardFeatureEdges: positiveEdges,
      templates: templates.length,
      variants: slimVariants.length,
    },
    checksums: {
      features: sha256Json(features),
      cards: sha256Json(slimCards.map((c) => c.id)),
      variants: sha256Json(slimVariants.map((v) => v.id)),
      templates: sha256Json(templates),
    },
    paths: { featuresPath, cardsPath, variantsPath, templatesPath },
    notes: [
      "GET /combos/ is not publicly listed (404). Recipes for parity are reconstructed from variant families and synthetic fixtures.",
      "Card.features are grounded Card→Feature positives. Missing features are UNKNOWN, not negative.",
    ],
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
