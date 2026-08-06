import type { OracleAbilityType, SegmentedAbility } from "./oracle-action-schema";

const ABILITY_STARTERS =
  /^(?:When|Whenever|At the beginning of|At end of|If|As|As long as|\{[^}]+\}:|Activate|Suspend|Craft|Mutate|Chapter|Read a chapter|Choose one|Choose two|Choose three|May|You may|Flying|First strike|Deathtouch|Trample|Vigilance|Reach|Haste|Hexproof|Ward|Defender|Flash|Menace|Partner|Cascade|Landfall|Constellation|Heroic|Renown|Proliferate|Transform|Daybound|Nightbound|Cycling|Kicker|Flashback|Foretell|Disturb|Embalm|Eternalize|Spectacle|Adventure|Aftermath|Learn|Demonstrate|Blitz|Casualty|Reconfigure|Living metal|Unearth|Miracle|Bestow|Evoke|Delve|Convoke|Improvise|Afflict|Raid|Revolt|Metalcraft|Morbid|Hellbent|Threshold|Spell mastery|Landfall|Formidable|Domain|Metalcraft|Battalion|Bloodthirst|Fateful hour|Heroic|Inspired|Constellation|Exploit|Myriad|Support|Undying|Persist|Wither|Infect|Exalted|Annihilator|Cumulative upkeep|Echo|Phasing|Buyback|Buy this|Forecast|Gravestorm|Haunt|Hideaway|Kinship|Level up|Modular|Ninjutsu|Offering|Outlast|Populate|Prowl|Recover|Rebound|Replicate|Retrace|Ripple|Scavenge|Shroud|Split second|Storm|Soulbond|Sunburst|Totem armor|Transfigure|Tribute|Unleash|Vanishing|Bloodthirst|Cipher|Dash|Exploit|Megamorph|Monstrosity|Outnumber|Riot|Spectacle|Surge|Assist|Afterlife|Amass|Escape|Mutate|Companion|Mutate|Encore|Boast|Foretell|Mdfcn|Mood|Disturb|Craft|Case solved|Collect evidence|Choose a background|Doctor's companion|Spree|Plot|Gift|Solved|Solved case|Solved —|Solved:)/i;

/** Split oracle text into card faces (DFC, split, adventure). */
export function segmentCardFaces(oracleText: string): Array<{ faceId: string; text: string; start: number }> {
  const parts = oracleText.split(/\n\/\/\n/);
  if (parts.length === 1) {
    return [{ faceId: "front", text: oracleText, start: 0 }];
  }
  let offset = 0;
  return parts.map((text, i) => {
    const start = offset;
    offset += text.length + 5;
    return { faceId: i === 0 ? "front" : i === 1 ? "back" : `face_${i}`, text, start };
  });
}

/** Segment a card face into ability paragraphs. */
export function segmentAbilities(
  oracleId: string,
  cardFaceId: string,
  faceText: string,
  faceStartOffset = 0,
): SegmentedAbility[] {
  const paragraphs = faceText
    .split(/\n(?=[A-Z{("]|When |Whenever |At the beginning|Choose one|Choose two|Choose three|Suspend|Craft|Mutate|Chapter|Landfall|Cycling|Flashback|Foretell|Adventure|Aftermath|Read a chapter)/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length <= 1 && faceText.includes("\n")) {
    const lines = faceText.split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.map((paragraphText, abilityIndex) => {
      const paragraphStart = faceStartOffset + faceText.indexOf(paragraphText);
      return {
        abilityIndex,
        cardFaceId,
        abilityType: classifyAbilityType(paragraphText),
        paragraphText,
        paragraphStart,
        paragraphEnd: paragraphStart + paragraphText.length,
      };
    });
  }

  let searchFrom = 0;
  return paragraphs.map((paragraphText, abilityIndex) => {
    const localStart = faceText.indexOf(paragraphText, searchFrom);
    searchFrom = localStart + paragraphText.length;
    const paragraphStart = faceStartOffset + Math.max(0, localStart);
    return {
      abilityIndex,
      cardFaceId,
      abilityType: classifyAbilityType(paragraphText),
      paragraphText,
      paragraphStart,
      paragraphEnd: paragraphStart + paragraphText.length,
    };
  });
}

export function classifyAbilityType(paragraph: string): OracleAbilityType | "unknown" {
  const p = paragraph.trim();
  if (/^If you would|^As .* instead|^As .* enters|^Prevent /i.test(p)) return "replacement";
  if (/^Prevent /i.test(p)) return "preventing";
  if (/^(When|Whenever|At the beginning|At end of|At the start of|When .* dies|When .* enters|When .* attacks|When .* leaves|When .* cast|When .* dealt|When .* becomes|When .* transformed|When .* turned|When .* surveil|When .* connive|When .* explore|When .* venture|When .* class|When .* room|When .* unlock|When .* craft|When .* suspect|When .* collect evidence|When .* solve|When .* plot|When .* gift|When .* cloak|When .* manifest|When .* delirium|When .* descend|When .* ring|When .* the Ring|When .* ring tempts|When .* amass|When .* battalion|When .* morbid|When .* revolt|When .* raid|When .* metalcraft|When .* hellbent|When .* threshold|When .* spell mastery|When .* formidable|When .* domain|When .* metalcraft|When .* battalion|When .* bloodthirst|When .* fateful hour|When .* heroic|When .* inspired|When .* constellation|When .* exploit|When .* myriad|When .* support|When .* undying|When .* persist|When .* wither|When .* infect|When .* exalted|When .* annihilator|When .* cumulative upkeep|When .* echo|When .* phasing|When .* buyback|When .* forecast|When .* gravestorm|When .* haunt|When .* hideaway|When .* kinship|When .* level up|When .* modular|When .* ninjutsu|When .* offering|When .* outlast|When .* populate|When .* prowl|When .* recover|When .* rebound|When .* replicate|When .* retrace|When .* ripple|When .* scavenge|When .* shroud|When .* split second|When .* storm|When .* soulbond|When .* sunburst|When .* totem armor|When .* transfigure|When .* tribute|When .* unleash|When .* vanishing|When .* bloodthirst|When .* cipher|When .* dash|When .* exploit|When .* megamorph|When .* monstrosity|When .* outnumber|When .* riot|When .* spectacle|When .* surge|When .* assist|When .* afterlife|When .* amass|When .* escape|When .* mutate|When .* companion|When .* mutate|When .* encore|When .* boast|When .* foretell|When .* mdfcn|When .* mood|When .* disturb|When .* craft|When .* case solved|When .* collect evidence|When .* choose a background|When .* doctor's companion|When .* spree|When .* plot|When .* gift|When .* solved|When .* solved case|When .* solved —|When .* solved:)/i.test(p)) {
    return "triggered";
  }
  if (/^\{[^}]+\}:/.test(p) || /^Activate /i.test(p)) return "activated";
  if (/^(As |As long as |.*has |.*have |.*can't |.*cannot |.*can be |.*costs? |.*enters .* with |.* enters the battlefield |.* is |.* are |.* get |.* gets |.* gain |.* loses |.* lose |.* has base power|Players |Each |All |Creatures |Artifacts |Enchantments |Permanents |Lands |Spells |Abilities |Damage |Combat |Attacking |Blocking |Defending |Legendary |Nonlegendary |Nonbasic |Basic |Snow |Nonland |Noncreature |Nonartifact |Nonenchantment |Nonplaneswalker |Nonbattle |Battle |Dungeon |Room |Class |Saga |Chapter |Read a chapter|Choose one|Choose two|Choose three|Suspend|Craft|Mutate|Chapter|Landfall|Cycling|Flashback|Foretell|Adventure|Aftermath|Learn|Demonstrate|Blitz|Casualty|Reconfigure|Living metal|Unearth|Miracle|Bestow|Evoke|Delve|Convoke|Improvise|Afflict|Raid|Revolt|Metalcraft|Morbid|Hellbent|Threshold|Spell mastery|Landfall|Formidable|Domain|Metalcraft|Battalion|Bloodthirst|Fateful hour|Heroic|Inspired|Constellation|Exploit|Myriad|Support|Undying|Persist|Wither|Infect|Exalted|Annihilator|Cumulative upkeep|Echo|Phasing|Buyback|Buy this|Forecast|Gravestorm|Haunt|Hideaway|Kinship|Level up|Modular|Ninjutsu|Offering|Outlast|Populate|Prowl|Recover|Rebound|Replicate|Retrace|Ripple|Scavenge|Shroud|Split second|Storm|Soulbond|Sunburst|Totem armor|Transfigure|Tribute|Unleash|Vanishing|Bloodthirst|Cipher|Dash|Exploit|Megamorph|Monstrosity|Outnumber|Riot|Spectacle|Surge|Assist|Afterlife|Amass|Escape|Mutate|Companion|Mutate|Encore|Boast|Foretell|Mdfcn|Mood|Disturb|Craft|Case solved|Collect evidence|Choose a background|Doctor's companion|Spree|Plot|Gift|Solved|Solved case|Solved —|Solved:)/i.test(p)) {
    if (/^When|^Whenever|^At the beginning|^At end of|^At the start of/i.test(p)) return "triggered";
    if (/^\{[^}]+\}:/.test(p)) return "activated";
    return "static";
  }
  if (/^[A-Z][a-z]+(?:, [a-z]+)*\./.test(p) && !/^(When|Whenever|At|If|Choose|You may|Target|Destroy|Exile|Return|Draw|Create|Counter|Search|Reveal|Put|Shuffle|Scry|Surveil|Mill|Discard|Sacrifice|Add|Remove|Prevent|Copy|Cast|Play)/i.test(p)) {
    return "static";
  }
  return "spell_effect";
}

/** Verify extracted action evidence is a substring of oracle text at declared span. */
export function validateEvidenceSpan(
  oracleText: string,
  evidenceText: string,
  evidenceStart: number,
  evidenceEnd: number,
): { valid: boolean; reason?: string } {
  if (evidenceStart < 0 || evidenceEnd > oracleText.length || evidenceStart >= evidenceEnd) {
    return { valid: false, reason: "invalid_span_bounds" };
  }
  const slice = oracleText.slice(evidenceStart, evidenceEnd);
  if (slice !== evidenceText) {
    return { valid: false, reason: "span_text_mismatch" };
  }
  if (!oracleText.includes(evidenceText)) {
    return { valid: false, reason: "evidence_not_in_oracle" };
  }
  return { valid: true };
}

export function segmentOracleCard(input: {
  oracleId: string;
  oracleText: string;
}): SegmentedAbility[] {
  const faces = segmentCardFaces(input.oracleText);
  const abilities: SegmentedAbility[] = [];
  for (const face of faces) {
    abilities.push(...segmentAbilities(input.oracleId, face.faceId, face.text, face.start));
  }
  return abilities;
}
