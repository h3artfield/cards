/**
 * Scryfall bulk → per-set token looks for the token creator.
 *
 *   src/lib/token-creator/set-templates-v1.json   one entry per English paper token set
 *   src/lib/deck-tokens/card-token-sets-v1.json   card oracle id → token set of its newest printing with tokens
 *
 * Run: npx tsx --env-file=.env.local scripts/build-token-set-templates.ts [--vision] [--looks] [--only=tfdn,tblb]
 *   --vision  describe each set's art direction from sample tokens (one vision call per set, cached)
 *   --looks   measure each set's frame layout and colours from its real tokens (see lib/token-set-looks-v1.ts)
 *
 * Uses the newest default_cards bulk in .cache/scryfall-bulk (run deck-tokens:build first if there is none).
 * Palettes and vision answers are cached in .cache/token-sets, so reruns only fetch what is new.
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import sharp from "sharp";
import { getBulkCacheDir } from "../src/lib/deck-builder/golden-catalog/bulk-metadata";
import { callOpenAiJson } from "../src/lib/card-flow-v2/openai-json";
import { defaultLookV1, measureTokenSetLookV1, trimLookV1, type LookEraV1, type LookSampleV1 } from "./lib/token-set-looks-v1";
import { packLookV1 } from "../src/lib/token-creator/set-look-pack-v1";
import type {
  TokenSetDefaultLookV1,
  TokenSetIndexFileV1,
  TokenSetLookV1,
  TokenSetEraV1,
  TokenSetFrameEffectV1,
  TokenSetIndexEntryV1,
  TokenSetTemplateV1,
  TokenSetTemplatesFileV1,
} from "../src/lib/token-creator/set-templates-v1";

const ROOT = process.cwd();
const OUT_TEMPLATES = path.join(ROOT, "src", "lib", "token-creator", "set-templates-v1.json");
const OUT_INDEX = path.join(ROOT, "src", "lib", "token-creator", "set-index-v1.json");
const OUT_CARD_SETS = path.join(ROOT, "src", "lib", "deck-tokens", "card-token-sets-v1.json");
const CACHE = path.join(ROOT, ".cache", "token-sets");
const TOKEN_LAYOUTS = new Set(["token", "double_faced_token", "emblem"]);
const UA = { "User-Agent": "CardScanner9000/1.0 (token creator set templates)", Accept: "application/json" };

type Face = {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  image_uris?: { normal?: string; art_crop?: string };
};
type Card = Face & {
  id: string;
  oracle_id?: string;
  layout: string;
  set: string;
  set_type?: string;
  lang?: string;
  digital?: boolean;
  released_at?: string;
  frame?: string;
  frame_effects?: string[];
  border_color?: string;
  full_art?: boolean;
  card_faces?: Array<Face & { oracle_id?: string }>;
  all_parts?: Array<{ id: string; component: string }>;
};
type ScryfallSet = {
  code: string;
  name: string;
  set_type: string;
  released_at?: string;
  parent_set_code?: string;
  digital: boolean;
};

type Sample = { name: string; typeLine: string; normal: string; artCrop: string; creature: boolean };
type SetFacts = {
  code: string;
  count: number;
  frames: Record<string, number>;
  effects: Record<string, number>;
  borders: Record<string, number>;
  fullArt: number;
  samples: Sample[];
  /** A wider pick for measuring the frame: more colours, with and without rules text. */
  lookSamples: LookSampleV1[];
};

async function* readCards(file: string): AsyncGenerator<Card> {
  const input = createReadStream(file);
  const lines = createInterface({ input: file.endsWith(".gz") ? input.pipe(createGunzip()) : input });
  for await (const raw of lines) {
    const line = raw.trim().replace(/,$/, "");
    if (!line || line === "[" || line === "]") continue;
    yield JSON.parse(line) as Card;
  }
}

function newestBulk(type: string): string {
  const dir = getBulkCacheDir();
  const newest = readdirSync(dir)
    .filter((f) => f.startsWith(`${type}-`) && f.endsWith(".jsonl.gz"))
    .sort()
    .at(-1);
  if (!newest) throw new Error(`No cached ${type} bulk in ${dir}; run npm run deck-tokens:build first`);
  return path.join(dir, newest);
}

async function fetchSets(): Promise<Map<string, ScryfallSet>> {
  const res = await fetch("https://api.scryfall.com/sets", { headers: UA });
  if (!res.ok) throw new Error(`Scryfall sets: ${res.status}`);
  const body = (await res.json()) as { data: ScryfallSet[] };
  return new Map(body.data.map((s) => [s.code, s]));
}

const top = (counts: Record<string, number>): string | undefined =>
  Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];

const lookEra = (era: TokenSetEraV1): LookEraV1 => (era === "2015" ? "2015" : "2003");

function eraOf(frame: string | undefined): TokenSetEraV1 {
  if (frame === "1993" || frame === "1997" || frame === "2003") return frame;
  return "2015";
}

/** A set-wide frame effect only counts when most of its tokens share it. */
function effectOf(facts: SetFacts): TokenSetFrameEffectV1 {
  const share = (n: number) => n / Math.max(1, facts.count) >= 0.5;
  if (share(facts.fullArt)) return "fullart";
  for (const effect of ["enchantment", "snow", "inverted", "showcase", "etched"] as const) {
    if (share(facts.effects[effect] ?? 0)) return effect;
  }
  return "none";
}

// --- palette -----------------------------------------------------------------

type Rgb = [number, number, number];

async function imagePixels(url: string): Promise<Rgb[]> {
  const res = await fetch(url, { headers: { "User-Agent": UA["User-Agent"] } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const { data } = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(40, 30, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out: Rgb[] = [];
  for (let i = 0; i + 2 < data.length; i += 3) out.push([data[i]!, data[i + 1]!, data[i + 2]!]);
  return out;
}

function kmeans(pixels: Rgb[], k: number): Array<{ rgb: Rgb; share: number }> {
  if (pixels.length === 0) return [];
  let centers: Rgb[] = Array.from({ length: k }, (_, i) => pixels[Math.floor(((i + 0.5) / k) * pixels.length)]!);
  let assign = new Array<number>(pixels.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    assign = pixels.map((p) => {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    });
    centers = centers.map((c, i) => {
      const members = pixels.filter((_, j) => assign[j] === i);
      if (members.length === 0) return c;
      return [0, 1, 2].map((ch) => Math.round(members.reduce((s, m) => s + m[ch]!, 0) / members.length)) as Rgb;
    });
  }
  return centers
    .map((rgb, i) => ({ rgb, share: assign.filter((a) => a === i).length / pixels.length }))
    .sort((a, b) => b.share - a.share);
}

const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** Cache files are keyed by the samples used, so a change in sample choice is re-read. */
function cacheFile(kind: "palette" | "vision", facts: SetFacts, count: number): string {
  const key = createHash("sha1")
    .update(facts.samples.slice(0, count).map((s) => s.normal).join("|"))
    .digest("hex")
    .slice(0, 10);
  return path.join(CACHE, kind, `${facts.code}-${key}.json`);
}

async function paletteFor(facts: SetFacts): Promise<string[]> {
  const file = cacheFile("palette", facts, 4);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as string[];
  const pixels: Rgb[] = [];
  for (const sample of facts.samples.slice(0, 4)) {
    try {
      pixels.push(...(await imagePixels(sample.artCrop)));
    } catch (err) {
      console.warn(`  palette ${facts.code}: ${(err as Error).message}`);
    }
  }
  const palette = kmeans(pixels, 6).map((c) => hex(c.rgb));
  writeFileSync(file, JSON.stringify(palette));
  return palette;
}

// --- vision ------------------------------------------------------------------

// Frame colours follow each token's own colours, so only the illustration style is set-specific.
const VISION_SYSTEM = [
  "You describe the illustration style of a Magic: The Gathering token set from sample token cards,",
  "so new token art can be painted to sit alongside them. Describe the artwork only, not the card frame.",
  "Do not name artists, characters or the franchise.",
  "Answer JSON only:",
  "{",
  '  "artDirection": "one or two sentences an image model can follow: medium, rendering, lighting, colour palette and mood, plus recurring world and setting motifs",',
  '  "setting": "2 to 6 words naming the world and theme, e.g. \\"gothic horror plane, autumn\\""',
  "}",
].join("\n");

type VisionAnswer = { artDirection?: string; setting?: string };

async function visionFor(facts: SetFacts, setName: string): Promise<VisionAnswer | null> {
  const file = cacheFile("vision", facts, 3);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as VisionAnswer;
  const samples = facts.samples.slice(0, 3);
  if (samples.length === 0) return null;
  const content = [
    { type: "text" as const, text: `Token set: ${setName}. ${samples.length} sample tokens follow.` },
    ...samples.map((s) => ({ type: "image_url" as const, image_url: { url: s.normal, detail: "low" as const } })),
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const answer = await callOpenAiJson<VisionAnswer>(VISION_SYSTEM, content as never, {
        model: process.env.OPENAI_VISION_MODEL ?? "gpt-6-luna",
        maxTokens: 500,
        temperature: 0.2,
      });
      writeFileSync(file, JSON.stringify(answer));
      return answer;
    } catch (err) {
      console.warn(`  vision ${facts.code} attempt ${attempt + 1}: ${(err as Error).message.slice(0, 200)}`);
    }
  }
  return null;
}

// --- hand-tuned sets -----------------------------------------------------------

/** Popular sets, written by hand; these win over the vision pass. */
const HAND_TUNED: Record<string, { setting: string; artDirection: string }> = {
  tfdn: {
    setting: "classic high fantasy multiverse",
    artDirection: "Classic painted high-fantasy illustration with crisp detail, saturated colour and dramatic rim light; heroic creatures and iconic magic in clear, readable silhouettes against varied realms.",
  },
  tdsk: {
    setting: "haunted house horror",
    artDirection: "Painted horror illustration of an endless haunted house: claustrophobic rooms and corridors, peeling wallpaper, cold blue-black shadows cut by sickly green and rust-orange light, grotesque creatures emerging from the dark.",
  },
  tblb: {
    setting: "woodland animal folk",
    artDirection: "Warm storybook-painted woodland scenes of brave anthropomorphic animal folk in handmade gear; lush greens, golden dappled sunlight, cosy yet adventurous mood, huge plants and seasons at small-creature scale.",
  },
  tmkm: {
    setting: "gothic city murder mystery",
    artDirection: "Moody painted noir mystery in a gothic fantasy metropolis: rain-slick streets, lamplight and deep shadow, muted teal and amber palette, detectives, clues and sinister suspects framed like a crime scene.",
  },
  totj: {
    setting: "fantasy wild west frontier",
    artDirection: "Painted fantasy western: sun-blasted desert canyons, saloons and rail lines, outlaws and strange beasts, dusty orange and turquoise palette with hard noon light or fiery sunsets.",
  },
  tltr: {
    setting: "mythic fellowship epic",
    artDirection: "Richly painted mythic fantasy with a grounded, storybook feel: rugged mountains, ancient ruins, weathered armour and cloaks, earthy colours lit by firelight or cold mist, a sense of an epic quest.",
  },
  tpip: {
    setting: "retro-futurist wasteland",
    artDirection: "Painted post-apocalyptic retro-futurism: 1950s atomic-age design, rusted machinery, mutated creatures and irradiated ruins under hazy green-yellow skies, gritty texture and harsh light.",
  },
  tmh3: {
    setting: "eldritch multiverse wilds",
    artDirection: "Bold painted fantasy with an eldritch edge: alien landscapes, Eldrazi-like geometric horrors and ancient magic, strong contrasts of deep violet, sickly teal and bright arcane light.",
  },
  twoe: {
    setting: "dark fairy-tale kingdom",
    artDirection: "Painted fairy-tale illustration: enchanted forests, castles and cursed courts, whimsical creatures with a dark edge, jewel-toned palette, soft magical glow and storybook composition.",
  },
  tlci: {
    setting: "subterranean jungle ruins",
    artDirection: "Painted adventure fantasy of a vast underground world: glowing caverns, overgrown stepped temples, dinosaurs and fungi, saturated jungle greens and molten golds, sense of exploration and discovery.",
  },
  tneo: {
    setting: "neon-lit futurist spirit city",
    artDirection: "Vivid painted cyberpunk fantasy inspired by feudal-to-modern Japan: neon-lit city streets, mechs, ninjas and kami spirits, electric magenta and cyan against deep night blues.",
  },
  tsnc: {
    setting: "art deco crime city",
    artDirection: "Painted 1920s art deco fantasy noir: glamorous gangster families, gilded skyscrapers and smoky speakeasies, rich golds, emeralds and inky shadows with dramatic spotlighting.",
  },
  tone: {
    setting: "biomechanical horror world",
    artDirection: "Painted biomechanical horror: porcelain-white plating, exposed sinew and black oil, cathedral-like machinery, sterile pale palette stained with dark oil and red flesh.",
  },
  tbro: {
    setting: "ancient war machine era",
    artDirection: "Painted war-torn fantasy of ancient artifact engineering: brass and stone war machines, clockwork constructs and scorched battlefields, smoky ochre and steel-blue palette.",
  },
  tkhm: {
    setting: "norse myth realms",
    artDirection: "Painted Norse-myth fantasy: frost-bound fjords, longships, giants, dwarven forges and the world tree, cold blues and whites with warm firelight and auroras.",
  },
  tthb: {
    setting: "greek myth starfield gods",
    artDirection: "Painted Greek-myth fantasy: marble temples, heroes and monsters, gods made of a starry night-sky substance, warm Mediterranean light against deep star-filled blues.",
  },
  tstx: {
    setting: "magic university",
    artDirection: "Painted academic fantasy: grand gothic colleges, libraries and lecture halls, students and elemental spells, warm candlelight and vivid coloured magic.",
  },
  tdft: {
    setting: "fantasy death race",
    artDirection: "High-energy painted fantasy racing: wild vehicles and mounts tearing across desert and city tracks, speed lines, dust and sparks, hot oranges and electric blues.",
  },
  ttdm: {
    setting: "dragon clan mountain steppes",
    artDirection: "Epic painted fantasy of warring clans in mountainous steppes beneath dragonstorms, great dragons in flight, wind-swept armour and banners, stormy skies with bright elemental colour.",
  },
  tfin: {
    setting: "heroic fantasy RPG world",
    artDirection: "Painted heroic fantasy-RPG illustration: crystals, airships, summoned beasts and adventurers in ornate gear, luminous colour and dramatic, celebratory lighting.",
  },
};

HAND_TUNED.totp = HAND_TUNED.totj!;
HAND_TUNED.tbig = HAND_TUNED.totj!;

// --- main --------------------------------------------------------------------

async function pool<T>(items: T[], size: number, run: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        await run(items[i]!, i);
      }
    }),
  );
}

async function main() {
  const vision = process.argv.includes("--vision");
  const looks = process.argv.includes("--looks");
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(/[\s,]+/);
  mkdirSync(path.join(CACHE, "palette"), { recursive: true });
  mkdirSync(path.join(CACHE, "vision"), { recursive: true });

  const sets = await fetchSets();
  const file = newestBulk("default_cards");
  console.log(`Reading ${path.basename(file)}…`);

  const facts = new Map<string, SetFacts>();
  /** Source printings with token links: oracle id → every set it was printed in, with dates. */
  const sourcePrintings = new Map<string, Array<{ set: string; released: string }>>();

  for await (const card of readCards(file)) {
    if (card.digital || (card.lang ?? "en") !== "en") continue;
    const set = sets.get(card.set);
    if (!set || set.digital) continue;
    if (TOKEN_LAYOUTS.has(card.layout)) {
      if (set.set_type !== "token") continue;
      const f =
        facts.get(card.set) ??
        ({ code: card.set, count: 0, frames: {}, effects: {}, borders: {}, fullArt: 0, samples: [], lookSamples: [] } satisfies SetFacts);
      facts.set(card.set, f);
      f.count++;
      if (card.frame) f.frames[card.frame] = (f.frames[card.frame] ?? 0) + 1;
      for (const e of card.frame_effects ?? []) f.effects[e] = (f.effects[e] ?? 0) + 1;
      if (card.border_color) f.borders[card.border_color] = (f.borders[card.border_color] ?? 0) + 1;
      if (card.full_art) f.fullArt++;
      const face = card.image_uris ? card : card.card_faces?.[0];
      const typeLine = card.type_line ?? face?.type_line ?? "";
      // Helper and reminder cards ("Card", "Card — Manifest") live in token sets too; only real tokens show the look.
      const isToken = /^Token\b/.test(typeLine);
      if (face?.image_uris?.normal && face.image_uris.art_crop && isToken && f.samples.length < 8) {
        f.samples.push({
          name: face.name ?? card.name ?? "",
          typeLine,
          normal: face.image_uris.normal,
          artCrop: face.image_uris.art_crop,
          creature: /Creature/.test(typeLine),
        });
      }
      if (face?.image_uris?.normal && isToken && f.lookSamples.length < 24) {
        f.lookSamples.push({
          name: face.name ?? card.name ?? "",
          image: face.image_uris.normal,
          colors: card.colors ?? face.colors ?? [],
          text: face.oracle_text ?? card.oracle_text ?? "",
          creature: /Creature/.test(typeLine),
          hasPt: (face.power ?? card.power) != null,
        });
      }
      continue;
    }
    if (!card.all_parts?.some((p) => p.component === "token")) continue;
    const oracleId = card.oracle_id ?? card.card_faces?.[0]?.oracle_id;
    if (!oracleId || !card.released_at) continue;
    const list = sourcePrintings.get(oracleId) ?? [];
    list.push({ set: card.set, released: card.released_at });
    sourcePrintings.set(oracleId, list);
  }

  console.log(`${sets.size} Scryfall sets, ${facts.size} token sets, ${sourcePrintings.size} cards that make tokens`);

  /** Source set code → its token set. */
  const tokenSetFor = new Map<string, string>();
  for (const code of facts.keys()) {
    const parent = sets.get(code)?.parent_set_code;
    if (parent) tokenSetFor.set(parent, code);
  }

  const codes = [...facts.keys()]
    .filter((c) => (only ? only.includes(c) : true))
    .filter((c) => facts.get(c)!.samples.length > 0)
    .sort((a, b) => (sets.get(b)!.released_at ?? "").localeCompare(sets.get(a)!.released_at ?? ""));
  console.log(`${codes.length} token sets with images`);

  const templates: TokenSetTemplateV1[] = [];
  await pool(codes, 6, async (code, i) => {
    const f = facts.get(code)!;
    const meta = sets.get(code)!;
    const parent = meta.parent_set_code ? sets.get(meta.parent_set_code) : undefined;
    // Creatures show the art direction best; artifact tokens are often plain objects.
    f.samples.sort((a, b) => Number(b.creature) - Number(a.creature));
    const palette = await paletteFor(f);
    const answer = vision ? await visionFor(f, parent?.name ?? meta.name) : null;
    const cached = !vision && existsSync(cacheFile("vision", f, 3))
      ? (JSON.parse(readFileSync(cacheFile("vision", f, 3), "utf8")) as VisionAnswer)
      : answer;
    const era = eraOf(top(f.frames));
    const look = looks
      ? await measureTokenSetLookV1({
          cacheDir: path.join(CACHE, "look"),
          code,
          setName: parent?.name ?? meta.name,
          era: lookEra(era),
          samples: f.lookSamples,
        })
      : null;
    templates.push({
      code,
      name: parent?.name ?? meta.name.replace(/ Tokens$/, ""),
      parentCode: parent?.code ?? null,
      released: meta.released_at ?? "",
      era,
      effect: effectOf(f),
      border: (top(f.borders) as TokenSetTemplateV1["border"]) ?? "black",
      palette,
      samples: f.samples.slice(0, 3).map((s) => ({ name: s.name, image: s.normal })),
      ...(look ? { look } : {}),
      ...(cached?.artDirection ? { artDirection: cached.artDirection.slice(0, 400) } : {}),
      ...(cached?.setting ? { setting: cached.setting.slice(0, 60) } : {}),
    });
    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${codes.length}`);
  });
  templates.sort((a, b) => b.released.localeCompare(a.released) || a.code.localeCompare(b.code));

  // Commander and bonus token sets share the main set's look; their samples are often a mix of reprints.
  const byName = new Map(templates.map((t) => [t.name, t]));
  for (const t of templates) {
    const main = byName.get(t.name.replace(/ (Commander|Eternal)$/, ""));
    if (main && main !== t && main.artDirection) {
      t.artDirection = main.artDirection;
      t.setting = main.setting;
    }
  }
  for (const t of templates) {
    const tuned = HAND_TUNED[t.code];
    if (!tuned) continue;
    Object.assign(t, tuned);
    for (const other of templates) {
      if (other !== t && other.name.replace(/ (Commander|Eternal)$/, "") === t.name) Object.assign(other, tuned);
    }
  }

  if (only) {
    console.log(JSON.stringify(templates, null, 2));
    return;
  }

  const out: TokenSetTemplatesFileV1 = { version: 1, generatedAt: new Date().toISOString(), sets: templates };
  writeFileSync(OUT_TEMPLATES, `${JSON.stringify(out)}\n`, "utf8");

  const defaults: TokenSetIndexFileV1["defaults"] = {};
  for (const era of ["2015", "2003"] as const) {
    const measured = templates.filter((t) => lookEra(t.era) === era && t.look).map((t) => t.look!);
    if (measured.length) defaults[era] = defaultLookV1(era, measured);
  }
  const trimmed = (t: TokenSetTemplateV1): TokenSetLookV1 | undefined => {
    const base: TokenSetDefaultLookV1 | undefined = defaults[lookEra(t.era)];
    return t.look && base ? trimLookV1(t.look, base) : t.look;
  };
  const index: TokenSetIndexFileV1 = {
    version: 3,
    defaults,
    sets: templates.map((t) => {
      const look = trimmed(t);
      const entry: Omit<TokenSetIndexEntryV1, "look"> = {
        code: t.code,
        name: t.name,
        released: t.released,
        era: t.era,
        effect: t.effect,
        ...(t.setting ? { setting: t.setting } : {}),
        palette: t.palette.slice(0, 4),
        sample: t.samples[0]?.image ?? null,
      };
      return look ? { ...entry, look: packLookV1(look) } : entry;
    }),
  };
  writeFileSync(OUT_INDEX, `${JSON.stringify(index)}\n`, "utf8");

  const known = new Set(templates.map((t) => t.code));
  const cardSets: Record<string, string> = {};
  // Reprints in sets without their own tokens (The List, Secret Lair) are skipped,
  // so a card lands on the newest printing that came with matching tokens.
  for (const [oracleId, printings] of [...sourcePrintings.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const best = printings
      .map((p) => ({ ...p, tokenSet: tokenSetFor.get(p.set) }))
      .filter((p): p is typeof p & { tokenSet: string } => Boolean(p.tokenSet && known.has(p.tokenSet)))
      .sort((a, b) => b.released.localeCompare(a.released))[0];
    if (best) cardSets[oracleId] = best.tokenSet;
  }
  writeFileSync(OUT_CARD_SETS, `${JSON.stringify(cardSets)}\n`, "utf8");
  console.log(
    `Wrote ${templates.length} set templates (${templates.filter((t) => t.artDirection).length} with art direction) and ` +
      `${Object.keys(cardSets).length} card → token set links`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
