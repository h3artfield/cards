import {
  CARD_BLEED,
  CARD_H,
  CARD_W,
  themeForColorsV1,
  type TokenBoxV1,
  type TokenCardV1,
} from "./design-v1";
import { tokenSetIndexEntryV1 } from "./set-index-v1";
import { applyTokenSetTemplateV1, restyleTokenSetCardV1 } from "./set-templates-v1";

/**
 * Starting points. A template fills in text and a layout; a family sets the
 * look of each layer. Both only produce an ordinary `TokenCardV1`, which the
 * customer can then change field by field, so nothing here is locked.
 */
export type TokenKindV1 = {
  id: string;
  label: string;
  name: string;
  typeLine: string;
  rulesText: string;
  rulesSource: TokenCardV1["rulesSource"];
  power: string;
  toughness: string;
  colors: string[];
  layout: "framed" | "blank";
  /** Seed for the art prompt when the customer writes none. */
  subject: string;
};

export const TOKEN_KINDS_V1: ReadonlyArray<TokenKindV1> = [
  { id: "creature", label: "Creature", name: "Zombie", typeLine: "Token Creature — Zombie", rulesText: "", rulesSource: "none", power: "2", toughness: "2", colors: ["B"], layout: "framed", subject: "a shambling undead zombie" },
  { id: "treasure", label: "Treasure", name: "Treasure", typeLine: "Token Artifact — Treasure", rulesText: "{T}, Sacrifice this artifact: Add one mana of any color.", rulesSource: "official", power: "", toughness: "", colors: [], layout: "framed", subject: "a gleaming pile of gold coins, gems and an ornate treasure chest" },
  { id: "food", label: "Food", name: "Food", typeLine: "Token Artifact — Food", rulesText: "{2}, {T}, Sacrifice this artifact: You gain 3 life.", rulesSource: "official", power: "", toughness: "", colors: [], layout: "framed", subject: "a rustic fantasy feast of bread, fruit and roasted food" },
  { id: "clue", label: "Clue", name: "Clue", typeLine: "Token Artifact — Clue", rulesText: "{2}, Sacrifice this artifact: Draw a card.", rulesSource: "official", power: "", toughness: "", colors: [], layout: "framed", subject: "a mysterious clue: a magnifying glass over an old letter and a key" },
  { id: "blood", label: "Blood", name: "Blood", typeLine: "Token Artifact — Blood", rulesText: "{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card.", rulesSource: "official", power: "", toughness: "", colors: [], layout: "framed", subject: "an ornate vial of glowing crimson blood" },
  { id: "map", label: "Map", name: "Map", typeLine: "Token Artifact — Map", rulesText: "{1}, {T}, Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery.", rulesSource: "official", power: "", toughness: "", colors: [], layout: "framed", subject: "an ancient treasure map unrolled with a compass" },
  { id: "powerstone", label: "Powerstone", name: "Powerstone", typeLine: "Token Artifact — Powerstone", rulesText: "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.", rulesSource: "official", power: "", toughness: "", colors: [], layout: "framed", subject: "a glowing ancient powerstone crystal humming with energy" },
  { id: "role", label: "Role", name: "Monster Role", typeLine: "Token Enchantment — Aura Role", rulesText: "Enchant creature you control\nEnchanted creature gets +1/+1 and has trample.", rulesSource: "official", power: "", toughness: "", colors: [], layout: "framed", subject: "a monstrous transformation aura swirling around a figure" },
  { id: "emblem", label: "Emblem", name: "Emblem", typeLine: "Emblem", rulesText: "", rulesSource: "custom", power: "", toughness: "", colors: [], layout: "framed", subject: "a radiant magical sigil floating in the air" },
  { id: "artifact", label: "Custom artifact", name: "Relic", typeLine: "Token Artifact", rulesText: "", rulesSource: "custom", power: "", toughness: "", colors: [], layout: "framed", subject: "a mysterious magical relic on a pedestal" },
  { id: "blank", label: "No template (full art)", name: "", typeLine: "", rulesText: "", rulesSource: "none", power: "", toughness: "", colors: [], layout: "blank", subject: "" },
];

export type CreaturePresetV1 = {
  id: string;
  label: string;
  power: string;
  toughness: string;
  colors: string[];
  rulesText: string;
  typeLine: string;
  subject: string;
};

export const CREATURE_PRESETS_V1: ReadonlyArray<CreaturePresetV1> = [
  { id: "zombie", label: "Zombie", power: "2", toughness: "2", colors: ["B"], rulesText: "", typeLine: "Token Creature — Zombie", subject: "a shambling undead zombie" },
  { id: "goblin", label: "Goblin", power: "1", toughness: "1", colors: ["R"], rulesText: "", typeLine: "Token Creature — Goblin", subject: "a mischievous snarling goblin" },
  { id: "angel", label: "Angel", power: "4", toughness: "4", colors: ["W"], rulesText: "Flying", typeLine: "Token Creature — Angel", subject: "a majestic winged angel warrior" },
  { id: "dragon", label: "Dragon", power: "5", toughness: "5", colors: ["R"], rulesText: "Flying", typeLine: "Token Creature — Dragon", subject: "a fearsome fire-breathing dragon" },
  { id: "soldier", label: "Soldier", power: "1", toughness: "1", colors: ["W"], rulesText: "", typeLine: "Token Creature — Soldier", subject: "a disciplined armoured soldier with spear and shield" },
  { id: "spirit", label: "Spirit", power: "1", toughness: "1", colors: ["W"], rulesText: "Flying", typeLine: "Token Creature — Spirit", subject: "a translucent drifting ghostly spirit" },
  { id: "beast", label: "Beast", power: "3", toughness: "3", colors: ["G"], rulesText: "", typeLine: "Token Creature — Beast", subject: "a massive wild horned beast" },
  { id: "construct", label: "Construct", power: "1", toughness: "1", colors: [], rulesText: "", typeLine: "Token Artifact Creature — Construct", subject: "a hulking mechanical construct of gears and metal plates" },
  { id: "saproling", label: "Saproling", power: "1", toughness: "1", colors: ["G"], rulesText: "", typeLine: "Token Creature — Saproling", subject: "a small fungal saproling sprouting from the forest floor" },
];

export type PopularTokenV1 = {
  id: string;
  name: string;
  typeLine: string;
  power?: string;
  toughness?: string;
  colors: string[];
  text?: string;
};

/** The tokens most decks make, most common first; everything else is a search away. */
export const POPULAR_TOKENS_V1: ReadonlyArray<PopularTokenV1> = [
  { id: "treasure", name: "Treasure", typeLine: "Token Artifact — Treasure", colors: [], text: "{T}, Sacrifice this artifact: Add one mana of any color." },
  { id: "zombie", name: "Zombie", typeLine: "Token Creature — Zombie", power: "2", toughness: "2", colors: ["B"] },
  { id: "goblin", name: "Goblin", typeLine: "Token Creature — Goblin", power: "1", toughness: "1", colors: ["R"] },
  { id: "soldier", name: "Soldier", typeLine: "Token Creature — Soldier", power: "1", toughness: "1", colors: ["W"] },
  { id: "saproling", name: "Saproling", typeLine: "Token Creature — Saproling", power: "1", toughness: "1", colors: ["G"] },
  { id: "spirit", name: "Spirit", typeLine: "Token Creature — Spirit", power: "1", toughness: "1", colors: ["W"], text: "Flying" },
  { id: "clue", name: "Clue", typeLine: "Token Artifact — Clue", colors: [], text: "{2}, Sacrifice this artifact: Draw a card." },
  { id: "food", name: "Food", typeLine: "Token Artifact — Food", colors: [], text: "{2}, {T}, Sacrifice this artifact: You gain 3 life." },
  { id: "beast", name: "Beast", typeLine: "Token Creature — Beast", power: "3", toughness: "3", colors: ["G"] },
  { id: "angel", name: "Angel", typeLine: "Token Creature — Angel", power: "4", toughness: "4", colors: ["W"], text: "Flying" },
];

/** True when `card` is still exactly this token, so its tile can show as picked. */
export function isTokenPickV1(card: TokenCardV1, token: Omit<PopularTokenV1, "id">): boolean {
  return (
    card.name === token.name &&
    card.typeLine === token.typeLine &&
    card.power === (token.power ?? "") &&
    card.toughness === (token.toughness ?? "") &&
    card.rulesText === (token.text ?? "")
  );
}

export type TokenFamilyV1 = {
  id: string;
  label: string;
  apply: (card: TokenCardV1) => TokenCardV1;
};

const LAYOUT_FRAMED = {
  title: { x: 40, y: 40, w: 550, h: 62 },
  art: { x: 40, y: 110, w: 550, h: 440 },
  type: { x: 40, y: 558, w: 550, h: 44 },
  rules: { x: 40, y: 610, w: 550, h: 214 },
  pt: { x: 468, y: 790, w: 124, h: 58 },
} satisfies Record<string, TokenBoxV1>;

const LAYOUT_FULL = {
  title: { x: 46, y: 44, w: 538, h: 66 },
  art: { x: -CARD_BLEED, y: -CARD_BLEED, w: CARD_W + CARD_BLEED * 2, h: CARD_H + CARD_BLEED * 2 },
  type: { x: 46, y: 600, w: 538, h: 40 },
  rules: { x: 46, y: 644, w: 538, h: 170 },
  pt: { x: 462, y: 790, w: 124, h: 56 },
} satisfies Record<string, TokenBoxV1>;

function withLayout(card: TokenCardV1, layout: typeof LAYOUT_FRAMED, artMode: TokenCardV1["art"]["mode"]): TokenCardV1 {
  return {
    ...card,
    title: { ...card.title, box: { ...layout.title } },
    type: { ...card.type, box: { ...layout.type } },
    rules: { ...card.rules, box: { ...layout.rules } },
    pt: { ...card.pt, box: { ...layout.pt } },
    art: { ...card.art, mode: artMode, window: { ...LAYOUT_FRAMED.art } },
  };
}

type FamilyLook = {
  frame: TokenCardV1["frame"]["style"];
  frameColor?: string;
  accent?: string;
  layout?: "framed" | "full";
  plate: TokenCardV1["title"]["plate"];
  plateColor: string;
  plateOpacity?: number;
  titleFont: TokenCardV1["title"]["font"];
  smallCaps?: boolean;
  titleColor: string;
  treatment: TokenCardV1["title"]["treatment"];
  effect: TokenCardV1["title"]["effect"];
  panel: TokenCardV1["rules"]["panel"];
  panelColor: string;
  panelOpacity?: number;
  rulesFont: TokenCardV1["rules"]["font"];
  rulesColor: string;
  ornaments?: boolean;
  finish?: TokenCardV1["finish"];
  hideText?: boolean;
};

function family(id: string, label: string, look: FamilyLook): TokenFamilyV1 {
  return {
    id,
    label,
    apply: (input) => {
      const theme = themeForColorsV1(input.colors);
      let card = withLayout(input, look.layout === "full" ? LAYOUT_FULL : LAYOUT_FRAMED, look.layout === "full" ? "full" : "window");
      const show = !look.hideText;
      card = {
        ...card,
        familyId: id,
        setCode: null,
        frame: {
          style: look.frame,
          color: look.frameColor ?? theme.frame,
          accent: look.accent ?? theme.accent,
        },
        title: {
          ...card.title,
          show,
          plate: look.plate,
          plateColor: look.plateColor,
          plateOpacity: look.plateOpacity ?? 1,
          font: look.titleFont,
          smallCaps: look.smallCaps ?? false,
          color: look.titleColor,
          treatment: look.treatment,
          effect: look.effect,
        },
        type: {
          ...card.type,
          show: show && Boolean(card.typeLine.trim()),
          plate: look.plate === "none" ? "none" : "bar",
          plateColor: look.plateColor,
          plateOpacity: look.plateOpacity ?? 1,
          font: look.titleFont === "unifraktur" || look.titleFont === "creepster" ? "im_fell" : look.titleFont,
          color: look.titleColor,
        },
        rules: {
          ...card.rules,
          show,
          panel: look.panel,
          panelColor: look.panelColor,
          panelOpacity: look.panelOpacity ?? (look.panel === "translucent" ? 0.6 : look.panel === "glass" ? 0.45 : 1),
          font: look.rulesFont,
          color: look.rulesColor,
          ornaments: look.ornaments ?? false,
        },
        pt: {
          ...card.pt,
          show: show && Boolean(card.power || card.toughness),
          plate: look.plate === "none" ? "none" : look.plate === "torn" || look.plate === "scroll" ? "bar" : look.plate,
          plateColor: look.plateColor,
          font: look.titleFont === "unifraktur" ? "cinzel" : look.titleFont,
          color: look.titleColor,
        },
        finish: look.finish ?? "none",
      };
      if (look.hideText) {
        card = {
          ...card,
          title: { ...card.title, show: false },
          type: { ...card.type, show: false },
          rules: { ...card.rules, show: false },
          pt: { ...card.pt, show: false },
        };
      }
      return card;
    },
  };
}

export const TOKEN_FAMILIES_V1: ReadonlyArray<TokenFamilyV1> = [
  family("retro_collectible", "Retro Collectible Card", { frame: "classic", plate: "bar", plateColor: "#e9e2c9", titleFont: "philosopher", smallCaps: true, titleColor: "#1b1712", treatment: "flat", effect: "none", panel: "box", panelColor: "#efe7d2", rulesFont: "crimson_pro", rulesColor: "#1b1712" }),
  family("gothic_cathedral", "Gothic Cathedral", { frame: "ornate", frameColor: "#2b2530", accent: "#c9b37a", plate: "engraved", plateColor: "#3a3340", titleFont: "unifraktur", titleColor: "#e8e2f0", treatment: "silver", effect: "engrave", panel: "gothic", panelColor: "#d9d2c4", rulesFont: "im_fell", rulesColor: "#1d1a20", ornaments: true }),
  family("ancient_stone", "Ancient Stone Tablet", { frame: "stone", frameColor: "#6d6a64", accent: "#b9b3a6", plate: "stone", plateColor: "#8a857b", titleFont: "cinzel", titleColor: "#2a2723", treatment: "stone", effect: "engrave", panel: "tablet", panelColor: "#9c968a", rulesFont: "cinzel", rulesColor: "#1f1d1a" }),
  family("arcane_runestone", "Arcane Runestone", { frame: "stone", frameColor: "#3a3f55", accent: "#7fd6ff", plate: "runic", plateColor: "#20263a", titleFont: "metamorphous", titleColor: "#bfefff", treatment: "magic", effect: "glow", panel: "glass", panelColor: "#16203a", rulesFont: "metamorphous", rulesColor: "#e3f6ff" }),
  family("gilded_renaissance", "Gilded Renaissance", { frame: "ornate", frameColor: "#6b4f1d", accent: "#f2d27a", plate: "curved_metal", plateColor: "#caa24a", titleFont: "cormorant", titleColor: "#2a1d08", treatment: "gold", effect: "emboss", panel: "parchment", panelColor: "#efe0bb", rulesFont: "cormorant", rulesColor: "#2a1d08", ornaments: true }),
  family("royal_heraldry", "Royal Heraldry", { frame: "metal", frameColor: "#2b3f7a", accent: "#e8c766", plate: "scroll", plateColor: "#f1e6c8", titleFont: "cinzel_decorative", titleColor: "#2b3f7a", treatment: "flat", effect: "none", panel: "plaque", panelColor: "#e8dcc0", rulesFont: "eb_garamond", rulesColor: "#1b2340" }),
  family("weathered_parchment", "Weathered Parchment", { frame: "parchment", frameColor: "#b59a6a", accent: "#6b4a26", plate: "torn", plateColor: "#e8d6ad", titleFont: "im_fell", titleColor: "#3a2a16", treatment: "ink", effect: "none", panel: "parchment", panelColor: "#ead9b2", rulesFont: "im_fell", rulesColor: "#3a2a16" }),
  family("illuminated_manuscript", "Illuminated Manuscript", { frame: "parchment", frameColor: "#d9c49a", accent: "#b8322a", plate: "scroll", plateColor: "#f3e7c8", titleFont: "uncial", titleColor: "#8a1f17", treatment: "ink", effect: "none", panel: "parchment", panelColor: "#f3e7c8", rulesFont: "uncial", rulesColor: "#2a1f12", ornaments: true }),
  family("dark_necromancer", "Dark Necromancer", { frame: "stone", frameColor: "#1d1a20", accent: "#7df0a0", plate: "runic", plateColor: "#141216", titleFont: "pirata", titleColor: "#b9ffd0", treatment: "magic", effect: "glow", panel: "translucent", panelColor: "#0d0c0f", rulesFont: "im_fell", rulesColor: "#dff5e6" }),
  family("celestial_gold", "Celestial Gold", { frame: "metal", frameColor: "#e8d9a8", accent: "#fff1b8", plate: "curved_metal", plateColor: "#e0c46a", titleFont: "cinzel", titleColor: "#3a2c08", treatment: "gold", effect: "emboss", panel: "glass", panelColor: "#fff8e1", panelOpacity: 0.7, rulesFont: "cormorant", rulesColor: "#2a2108" }),
  family("infernal_obsidian", "Infernal Obsidian", { frame: "stone", frameColor: "#140c0c", accent: "#ff6a2a", plate: "stone", plateColor: "#231515", titleFont: "pirata", titleColor: "#ffb07a", treatment: "magic", effect: "glow", panel: "tablet", panelColor: "#2a1a18", rulesFont: "im_fell", rulesColor: "#ffe6d6" }),
  family("elven_filigree", "Elven Filigree", { frame: "ornate", frameColor: "#2f5a3e", accent: "#d8e8b0", plate: "curved_metal", plateColor: "#c7d4c0", titleFont: "almendra", titleColor: "#1e3324", treatment: "silver", effect: "emboss", panel: "glass", panelColor: "#e9f2e1", panelOpacity: 0.75, rulesFont: "almendra", rulesColor: "#1e3324", ornaments: true }),
  family("dwarven_forged", "Dwarven Forged Metal", { frame: "metal", frameColor: "#4a3a2a", accent: "#d08a3a", plate: "engraved", plateColor: "#6a5440", titleFont: "metamorphous", titleColor: "#ffe2b8", treatment: "gold", effect: "engrave", panel: "plaque", panelColor: "#cdb595", rulesFont: "eb_garamond", rulesColor: "#2a1d10" }),
  family("steampunk", "Steampunk Machinery", { frame: "metal", frameColor: "#5a3d1e", accent: "#c99a4a", plate: "curved_metal", plateColor: "#b98a3e", titleFont: "cinzel", titleColor: "#2a1a08", treatment: "gold", effect: "emboss", panel: "plaque", panelColor: "#e2cfa6", rulesFont: "eb_garamond", rulesColor: "#2a1a08" }),
  family("crystal_glass", "Crystal and Glass", { frame: "borderless", frameColor: "#9fc9e0", accent: "#e6f7ff", plate: "bar", plateColor: "#d8f1ff", plateOpacity: 0.4, titleFont: "cinzel", titleColor: "#ffffff", treatment: "silver", effect: "shadow", panel: "glass", panelColor: "#e6f7ff", panelOpacity: 0.35, rulesFont: "eb_garamond", rulesColor: "#ffffff" }),
  family("ethereal_magic", "Ethereal Magic", { frame: "borderless", frameColor: "#2a1f4a", accent: "#d6b8ff", layout: "full", plate: "none", plateColor: "#1a1330", titleFont: "cinzel_decorative", titleColor: "#f4eaff", treatment: "magic", effect: "glow", panel: "glow", panelColor: "#140d26", rulesFont: "cormorant", rulesColor: "#f4eaff" }),
  family("organic_wood", "Organic Wood and Vines", { frame: "classic", frameColor: "#5b3e22", accent: "#9fca6a", plate: "bar", plateColor: "#8a5f34", titleFont: "almendra", titleColor: "#f6ecd6", treatment: "wood", effect: "shadow", panel: "leather", panelColor: "#d9c29a", rulesFont: "eb_garamond", rulesColor: "#2a1d10" }),
  family("cinematic_full_art", "Cinematic Full Art", { frame: "full_art", layout: "full", plate: "none", plateColor: "#000000", titleFont: "cinzel", titleColor: "#ffffff", treatment: "flat", effect: "shadow", panel: "translucent", panelColor: "#0a0a0a", rulesFont: "eb_garamond", rulesColor: "#f5f5f5", finish: "vignette" }),
  family("minimal_luxury", "Minimal Luxury", { frame: "borderless", frameColor: "#0b0b0b", accent: "#d9b968", layout: "full", plate: "none", plateColor: "#000000", titleFont: "cormorant", titleColor: "#e8cf8a", treatment: "gold", effect: "shadow", panel: "integrated", panelColor: "#000000", rulesFont: "cormorant", rulesColor: "#f3ead2" }),
  family("completely_blank", "Completely Blank", { frame: "none", layout: "full", plate: "none", plateColor: "#000000", titleFont: "cinzel", titleColor: "#ffffff", treatment: "flat", effect: "shadow", panel: "none", panelColor: "#000000", rulesFont: "eb_garamond", rulesColor: "#ffffff", hideText: true }),
];

export function tokenFamilyByIdV1(id: string): TokenFamilyV1 {
  return TOKEN_FAMILIES_V1.find((f) => f.id === id) ?? TOKEN_FAMILIES_V1[0]!;
}

export function tokenKindByIdV1(id: string): TokenKindV1 {
  return TOKEN_KINDS_V1.find((k) => k.id === id) ?? TOKEN_KINDS_V1[0]!;
}

function baseCard(kind: TokenKindV1): TokenCardV1 {
  return {
    version: 1,
    kindId: kind.id,
    familyId: "retro_collectible",
    name: kind.name,
    typeLine: kind.typeLine,
    rulesText: kind.rulesText,
    flavorText: "",
    rulesSource: kind.rulesSource,
    power: kind.power,
    toughness: kind.toughness,
    colors: [...kind.colors],
    frame: { style: "classic", color: "#7d838c", accent: "#d6dbe2" },
    title: {
      show: true, plate: "bar", plateOpacity: 1, plateColor: "#e9e2c9", font: "philosopher", size: 38, weight: 700,
      color: "#1b1712", letterSpacing: 1, smallCaps: true, effect: "none", treatment: "flat", align: "left", box: { ...LAYOUT_FRAMED.title },
    },
    type: {
      show: true, plate: "bar", plateOpacity: 1, plateColor: "#e9e2c9", font: "philosopher", size: 24, color: "#1b1712", box: { ...LAYOUT_FRAMED.type },
    },
    rules: {
      show: true, panel: "box", panelOpacity: 1, panelColor: "#efe7d2", borderWidth: 3, padding: 22, font: "crimson_pro", size: 30,
      color: "#1b1712", lineHeight: 1.25, align: "left", shadow: false, ornaments: false, showFlavor: true, box: { ...LAYOUT_FRAMED.rules },
    },
    pt: {
      show: Boolean(kind.power || kind.toughness), plate: "bar", plateColor: "#e9e2c9", font: "philosopher", size: 40, color: "#1b1712", box: { ...LAYOUT_FRAMED.pt },
    },
    art: { mode: "window", window: { ...LAYOUT_FRAMED.art }, zoom: 1, offsetX: 0, offsetY: 0 },
    finish: "none",
  };
}

export function defaultTokenCardV1(kindId: string, familyId?: string): TokenCardV1 {
  const kind = tokenKindByIdV1(kindId);
  const card = baseCard(kind);
  const fam = tokenFamilyByIdV1(familyId ?? (kind.layout === "blank" ? "completely_blank" : "retro_collectible"));
  return fam.apply(card);
}

export function applyCreaturePresetV1(card: TokenCardV1, presetId: string): TokenCardV1 {
  const preset = CREATURE_PRESETS_V1.find((p) => p.id === presetId);
  if (!preset) return card;
  const next: TokenCardV1 = {
    ...card,
    kindId: "creature",
    name: preset.label,
    typeLine: preset.typeLine,
    power: preset.power,
    toughness: preset.toughness,
    colors: [...preset.colors],
    rulesText: preset.rulesText,
    rulesSource: preset.rulesText ? "official" : "none",
    pt: { ...card.pt, show: true },
  };
  return card.setCode ? restyleTokenSetCardV1(next) : tokenFamilyByIdV1(card.familyId).apply(next);
}

/** What the art prompt is about when the customer writes nothing. */
export function defaultSubjectForCardV1(card: TokenCardV1): string {
  const preset = CREATURE_PRESETS_V1.find((p) => p.label.toLowerCase() === card.name.trim().toLowerCase());
  if (preset) return preset.subject;
  const kind = TOKEN_KINDS_V1.find((k) => k.id === card.kindId);
  if (kind?.id === "creature" || /creature/i.test(card.typeLine)) {
    const subtype = card.typeLine.split("—")[1]?.trim() || card.name || "creature";
    return `a fantasy ${subtype.toLowerCase()}`;
  }
  if (kind?.subject && card.name.trim().toLowerCase() === kind.name.toLowerCase()) return kind.subject;
  return card.name.trim() ? `${card.name.trim()}, a fantasy ${card.typeLine.replace(/^Token\s*/i, "").toLowerCase() || "object"}` : kind?.subject || "a fantasy scene";
}

/** A deck's token, as the Professor's deck tools describe it, turned into a card. */
export function cardFromDeckTokenV1(token: {
  name: string;
  typeLine: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  text?: string;
}): TokenCardV1 {
  const type = token.typeLine.toLowerCase();
  const kindId = type.includes("creature")
    ? "creature"
    : (["treasure", "food", "clue", "blood", "map", "powerstone"].find((k) => type.includes(k)) ??
      (type.includes("role") ? "role" : type.includes("emblem") ? "emblem" : "artifact"));
  const card = baseCard(tokenKindByIdV1(kindId));
  const typeLine = /^token\b/i.test(token.typeLine) || /^emblem/i.test(token.typeLine)
    ? token.typeLine
    : `Token ${token.typeLine}`;
  return tokenFamilyByIdV1("retro_collectible").apply({
    ...card,
    name: token.name,
    typeLine,
    power: token.power ?? "",
    toughness: token.toughness ?? "",
    colors: (token.colors ?? []).filter((c) => /^[WUBRG]$/.test(c)),
    rulesText: token.text ?? "",
    rulesSource: token.text ? "official" : "none",
    pt: { ...card.pt, show: Boolean(token.power || token.toughness) },
  });
}

/** Swaps in a different token while keeping the set or look the customer already picked. */
export function withTokenV1(current: TokenCardV1, token: Parameters<typeof cardFromDeckTokenV1>[0]): TokenCardV1 {
  const next = cardFromDeckTokenV1(token);
  const set = tokenSetIndexEntryV1(current.setCode);
  if (set) return applyTokenSetTemplateV1(next, set);
  if (current.familyId !== "completely_blank" && current.familyId !== "set_template") {
    return tokenFamilyByIdV1(current.familyId).apply(next);
  }
  return next;
}

export const TOKEN_CARD_DIMENSIONS_V1 = { width: CARD_W, height: CARD_H, bleed: CARD_BLEED };
