import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  CARD_INTERACTION_PROFILE_V2_1_VERSION,
  INTERACTION_PROFILE_V2_1_SPEC_VERSION,
} from "../../../src/lib/commander-strategy/interaction-profile-v2.1/types";
import { INTERACTION_PROFILE_V2_1_SPEC } from "../../../src/lib/commander-strategy/interaction-profile-v2.1/interaction-profile-v2.1-spec";
import { familiesFromText } from "../../../src/lib/commander-optimization-score/v1/access-features";
import { COS_V1_FEATURE_EXTRACTION_VERSION } from "../../../src/lib/commander-optimization-score/v1/constants";
import { DR_TAG_TABLE_V1_1, familiesFromCardV1_1 } from "../../../src/lib/deck-rating/v1/tag-families-v1.1";
import { ensureDir, newestMatching, sha256File, snapshotRoot, writeJson } from "./lib";

const TAG_TABLE_VERSION = DR_TAG_TABLE_V1_1;

const COS_TAGS = ["tutor", "draw", "ramp", "interact", "protect", "recur"] as const;
type CosTag = (typeof COS_TAGS)[number];

const OTAG_ALIASES: Record<CosTag, string[]> = {
  tutor: ["tutor", "tutors"],
  draw: ["draw", "card-draw", "draws-cards"],
  ramp: ["ramp", "mana-ramp"],
  interact: ["removal", "targeted-removal", "creature-removal", "destroy", "board-wipe", "counterspell"],
  protect: ["protection", "hexproof", "indestructible", "ward"],
  recur: ["reanimate", "recursion", "graveyard-recursion", "from-graveyard"],
};

const SKIP_OTAG_WEIGHTS = new Set(["weak"]);

type OracleCard = {
  oracle_id?: string;
  name?: string;
  type_line?: string;
  oracle_text?: string;
  legalities?: { commander?: string };
};

export async function freezeTagTable(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const scryDir = join(snap, "scryfall");
  const tagDir = ensureDir(join(snap, "tags"));
  const oraclePath = newestMatching(scryDir, /^oracle-cards-.*\.jsonl\.gz$/);
  const otagPath = newestMatching(scryDir, /^oracle-tags-.*\.jsonl\.gz$/);
  if (!oraclePath) throw new Error("oracle-cards dump missing; run dumps first");
  if (!otagPath) throw new Error("oracle-tags dump missing; run dumps first");

  const ours = new Map<CosTag, Set<string>>();
  const names = new Map<string, string>();
  for (const tag of COS_TAGS) ours.set(tag, new Set());

  const tablePath = join(tagDir, `${TAG_TABLE_VERSION}.jsonl.gz`);
  const gzip = createGzip();
  const out = createWriteStream(tablePath);
  const done = pipeline(gzip, out);

  let cards = 0;
  for await (const rec of readJsonlGz<OracleCard>(oraclePath)) {
    const oracleId = rec.oracle_id;
    if (!oracleId) continue;
    const text = rec.oracle_text ?? "";
    const v11 = familiesFromCardV1_1({ typeLine: rec.type_line, oracleText: text });
    const cos = COS_TAGS.filter((t) => familiesFromText(text).has(t));
    const tags = COS_TAGS.filter((t) => v11.has(t));
    for (const tag of tags) ours.get(tag)!.add(oracleId);
    names.set(oracleId, rec.name ?? oracleId);
    gzip.write(
      `${JSON.stringify({
        oracleId,
        name: rec.name ?? null,
        typeLine: rec.type_line ?? "",
        commanderLegal: rec.legalities?.commander ?? null,
        tags,
        cosTagsV1: cos,
        ip21: {
          spec: INTERACTION_PROFILE_V2_1_SPEC_VERSION,
          cardProfile: CARD_INTERACTION_PROFILE_V2_1_VERSION,
        },
      })}\n`,
    );
    cards += 1;
  }
  gzip.end();
  await done;

  const otagLabels = new Map<string, Set<string>>();
  let otagEntries = 0;
  for await (const rec of readJsonlGz<{
    type?: string;
    slug?: string;
    label?: string;
    taggings?: Array<{ oracle_id?: string; weight?: string }>;
  }>(otagPath)) {
    if (rec.type !== "oracle" || !rec.slug) continue;
    otagEntries += 1;
    const slug = rec.slug.toLowerCase();
    const set = otagLabels.get(slug) ?? new Set<string>();
    for (const tagging of rec.taggings ?? []) {
      const id = tagging.oracle_id?.trim();
      if (!id) continue;
      if (tagging.weight && SKIP_OTAG_WEIGHTS.has(tagging.weight)) continue;
      set.add(id);
    }
    otagLabels.set(slug, set);
  }

  const disagreements = [];
  for (const tag of COS_TAGS) {
    const ourSet = ours.get(tag)!;
    const scrySet = new Set<string>();
    const matchedLabels: string[] = [];
    for (const [slug, ids] of otagLabels) {
      const hit = OTAG_ALIASES[tag].some((alias) => slug === alias || slug.startsWith(`${alias}-`));
      if (!hit) continue;
      matchedLabels.push(slug);
      for (const id of ids) scrySet.add(id);
    }
    const onlyOurs: string[] = [];
    const onlyScryfall: string[] = [];
    for (const id of ourSet) if (!scrySet.has(id) && onlyOurs.length < 50) onlyOurs.push(`${names.get(id) ?? id}`);
    for (const id of scrySet) if (!ourSet.has(id) && onlyScryfall.length < 50) onlyScryfall.push(id);
    let onlyOursN = 0;
    let onlyScryN = 0;
    let both = 0;
    for (const id of ourSet) {
      if (scrySet.has(id)) both += 1;
      else onlyOursN += 1;
    }
    for (const id of scrySet) if (!ourSet.has(id)) onlyScryN += 1;
    disagreements.push({
      cosTag: tag,
      scryfallAliasesTried: OTAG_ALIASES[tag],
      scryfallAliasesFound: matchedLabels,
      nOurs: ourSet.size,
      nScryfall: scrySet.size,
      both,
      onlyOurs: onlyOursN,
      onlyScryfall: onlyScryN,
      onlyOursExamples: onlyOurs,
      onlyScryfallExamples: onlyScryfall.slice(0, 50).map((id) => names.get(id) ?? id),
      relatedSlugs: [...otagLabels.keys()].filter((s) =>
        OTAG_ALIASES[tag].some((alias) => s === alias || s.startsWith(`${alias}-`)),
      ),
    });
  }

  const manifest = {
    version: TAG_TABLE_VERSION,
    frozenLike: "commander-game-changers-snapshot",
    sources: {
      interactionProfile: {
        spec: INTERACTION_PROFILE_V2_1_SPEC_VERSION,
        card: CARD_INTERACTION_PROFILE_V2_1_VERSION,
        status: INTERACTION_PROFILE_V2_1_SPEC.status,
      },
      cosTextFeatures: {
        version: COS_V1_FEATURE_EXTRACTION_VERSION,
        families: COS_TAGS,
        note: "COS v1 regex kept as cosTagsV1 for audit. Scoring uses tags (v1.1).",
      },
      decisions: {
        ramp: "our definition: nonland mana production or extra lands onto the battlefield. Tap-lands are mana base.",
        draw: "our definition: positive draw, including cycling",
        protect: "our definition: grants hexproof/indestructible/protection/ward to you or others",
        interact: "our definition: answers (counter/destroy/exile/fight/damage/wipe/edict/bounce). Not flicker or gy exile.",
        recur: "our definition: return/cast from graveyard",
        tutor: "our definition: search a library and find cards to hand, battlefield, or top",
      },
      scryfallOracleCards: oraclePath.replace(/\\/g, "/"),
      scryfallOracleTags: otagPath.replace(/\\/g, "/"),
    },
    nCards: cards,
    table: {
      dest: tablePath.replace(/\\/g, "/"),
      sha256: sha256File(tablePath),
    },
  };
  writeJson(join(tagDir, "tag-table-manifest.json"), manifest);
  writeJson(join(tagDir, "otag-disagreements.json"), {
    version: `${TAG_TABLE_VERSION}-otag-crosscheck`,
    scryfallOracleTagEntryCount: otagEntries,
    scryfallOracleTagLabels: [...otagLabels.keys()].sort(),
    disagreements,
  });
  return {
    ...manifest,
    disagreementTags: disagreements.map((d) => ({
      tag: d.cosTag,
      aliasesFound: d.scryfallAliasesFound,
      onlyOurs: d.onlyOurs,
      onlyScryfall: d.onlyScryfall,
    })),
  };
}

async function* readJsonlGz<T>(path: string): AsyncGenerator<T> {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield JSON.parse(line) as T;
  }
}
