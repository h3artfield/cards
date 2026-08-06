import type { CategoryDetectiveGuide } from "../types";

/** Structured MTG collector knowledge — image, catalog, and market layers. */
export const MTG_DETECTIVE_GUIDE: CategoryDetectiveGuide = {
  category: "mtg",
  importantRegions: [
    "title line (card name)",
    "type line with expansion/set symbol",
    "expansion symbol color on older cards (black=common, silver=uncommon, gold=rare, orange-red=mythic)",
    "bottom-left collector line (e.g. 122/269 R M15 EN)",
    "The List mark — small Planeswalker symbol / fork-like icon in the bottom-left corner on reprints from The List",
    "collector number, rarity letter, set code, language code",
    "bottom-center oval hologram/security stamp (modern rares+ — not full-card foil proof)",
    "foil reflection across art and frame when tilted",
    "frame treatment (regular, borderless, extended art, showcase, retro, full-art)",
    "promo stamps (prerelease, event, championship)",
    "serialized number if present",
    "pre-modern shooting-star foil mark in text box (older foils only)",
    "card back for authenticity (color, alignment, rosette when visible)",
  ],
  keyFields: [
    "card_name",
    "set_code",
    "set_name",
    "collector_number",
    "rarity",
    "language",
    "foil_pattern",
    "frameTreatment",
    "promo_stamp",
    "the_list_mark",
    "edition",
    "serializedNumber",
  ],
  identificationFormula:
    "Card name + set code + collector number + exact finish + frame/treatment + condition (e.g. Sol Ring — LTC #314 — Surge Foil — Borderless — Near Mint). Never price from name alone.",
  catalogSources: [
    "Scryfall — primary print index: set, collector number, finishes, promo types, security stamp, images, legality (API fields for exact printing).",
    "Gatherer / Oracle — official Oracle text and rulings when printed text on old cards differs.",
  ],
  marketResearchNotes: [
    "Compare TCGplayer (U.S. list), eBay sold (promos/graded/odd variants), Cardmarket (EU), and store buylists for realistic buy-side value.",
    "Play demand affects price — check format relevance (Commander, Modern, Legacy, etc.) and tools like EDHREC for Commander staples.",
    "Separate traditional foil, nonfoil, foil-etched, textured foil, surge foil, galaxy foil, serialized foil, and promo foil — same name can differ 10×+ in value.",
    "Some treatments are product-exclusive (Collector Boosters, Secret Lair, prerelease stamps).",
  ],
  variantTraps: [
    "same card name may have 5–20+ distinct printings — set code + collector number + finish + treatment required",
    "expansion symbol identifies set; on many older cards symbol color hints rarity (not true for all modern printings)",
    "bottom line like 122/269 R M15 EN encodes collector #, rarity, set code, language — parse before locking",
    "foil and nonfoil share art/frame/number — finish is physical reflection, not a different layout",
    "bottom-center oval stamp on modern rare/mythic ≠ whole-card foil",
    "special finishes: traditional foil, nonfoil, foil-etched, textured foil, surge foil, galaxy foil, serialized foil, promo foil",
    "frame/treatment variants: borderless, extended art, showcase, retro, full-art, Secret Lair, Universes Beyond, prerelease stamp",
    "The List reprints look like a normal printing but have a small Planeswalker/fork icon in the bottom-left — Scryfall set code plst, collector number often SET-### (e.g. AFC-198)",
    "textured/special foils may use a different collector number than the standard version",
    "language code matters — EN default for U.S.; JP/KR/RU and other languages can premium on some cards",
    "condition (NM/LP/MP/HP/DMG) strongly affects foils, Reserved List, and Commander staples",
    "authenticity: thickness, texture, light test, rosette, font, border, gloss level — fakes are common on expensive cards",
  ],
  lockRequirements: [
    "card name",
    "set code or set identity",
    "collector number",
    "language",
    "finish when foil and nonfoil both exist",
    "frame or promo treatment when borderless/showcase/extended art/prerelease/Secret Lair suspected",
    "serialized number when a serialized printing exists",
  ],
  staffTips: [
    "Parse the bottom-left line when visible: collectorNumber/rarityLetter/setCode/language (e.g. 122/269 R M15 EN).",
    "Expansion symbol on the type line identifies the set; do not confuse with unrelated promo stamps.",
    "Foil vs nonfoil: look for broad prismatic/rainbow wash on art and frame in the photo — subtle iridescent patches mean foil; matte art with shine only on the bottom security stamp means nonfoil rare.",
    "Do not lock foil from the security stamp alone.",
    "When Scryfall returns multiple finishes at the same collector number, require finish evidence before lock.",
    "The List: check bottom-left for the small Planeswalker/fork icon — same art/name as another printing but a separate market product (plst).",
    "Showcase/borderless/extended art/retro frames are separate market products even with the same name.",
    "If finish or treatment is unclear from a flat photo, mark unknown and keep candidate comparison — do not collapse to cheapest printing.",
    "For high-value singles, note authenticity cues (texture, light test, rosette) and request rescan if suspicious.",
  ],
};

/** Vision-only rules for the image evidence agent prompt. */
export const MTG_IMAGE_EVIDENCE_RULES = `Magic: The Gathering — extract from the photo:
- Expansion/set symbol on the type line (set identity; on older cards symbol color may hint rarity: black=common, silver=uncommon, gold=rare, orange-red=mythic).
- Bottom-left collector line when readable — often: collectorNumber/total rarityLetter setCode language (example: 122/269 R M15 EN). Populate collector_number, set_code, rarity, language slots.
- The List reprints: small Planeswalker/fork-like icon in the bottom-left corner (not the expansion symbol on the type line). If visible, set the_list_mark to "yes" and note collector numbers like SET-### when readable.
- Finish: look for broad prismatic/rainbow/metallic wash on artwork and frame in the static photo — subtle iridescent color patches suggest foil. Matte art with shine confined to the bottom-center oval/triangle security stamp suggests nonfoil — stamp alone is NOT full-card foil proof.
- Frame/treatment: note borderless, extended art, showcase frame, retro frame, prerelease stamp, serialized number if visible.
- Pre-modern foils may show a shooting-star in the text box; do not apply to modern frames.
- If finish/treatment cannot be determined from a flat photo, mark finish unknown — do not guess.`;
