import type { CardFaceComponentType, OracleAbilityType, SegmentedAbility } from "./oracle-action-schema";

export interface SegmentedCardFace {
  faceId: string;
  faceName?: string;
  text: string;
  start: number;
  end: number;
  componentType: CardFaceComponentType;
}

/** Split oracle text into card faces (split, adventure, MDFC, room). */
export function segmentCardFaces(oracleText: string): SegmentedCardFace[] {
  const normalized = oracleText.replace(/\r\n/g, "\n");
  const splitPattern = /\n\/\/\n|\n\/\/\s*\n|(?:^|\n)\s*\/\/\s*\n/;
  const parts = normalized.split(splitPattern);
  if (parts.length === 1) {
    return [
      {
        faceId: "front",
        text: normalized,
        start: 0,
        end: normalized.length,
        componentType: inferSingleFaceComponentType(normalized),
      },
    ];
  }

  let offset = 0;
  const faces: SegmentedCardFace[] = [];
  const delimiter = normalized.match(splitPattern)?.[0] ?? "\n//\n";

  for (let i = 0; i < parts.length; i++) {
    const text = parts[i];
    const start = offset;
    const end = start + text.length;
    offset = end + (i < parts.length - 1 ? delimiter.length : 0);

    const faceName = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0 && !/^\{[^}]+\}/.test(l));
    faces.push({
      faceId: i === 0 ? "front" : i === 1 ? "back" : `face_${i}`,
      faceName,
      text,
      start,
      end,
      componentType: inferMultiFaceComponentType(normalized, text, i, parts.length),
    });
  }
  return faces;
}

function inferSingleFaceComponentType(text: string): CardFaceComponentType {
  if (/\bSaga\b/i.test(text) || /\b(I|II|III|IV|V) —/m.test(text)) return "saga";
  if (/\bClass \d+/i.test(text)) return "class";
  if (/\b(Daybound|Nightbound)\b/i.test(text)) return "transform";
  if (/\bRoom\b/i.test(text)) return "room";
  return "single";
}

function inferMultiFaceComponentType(
  fullText: string,
  faceText: string,
  faceIndex: number,
  faceCount: number,
): CardFaceComponentType {
  if (/\bAftermath\b/i.test(faceText)) return "adventure";
  if (/\bAdventure\b|\bInstant — Adventure\b|\bSorcery — Adventure\b/i.test(faceText)) {
    return faceIndex === 0 ? "adventure" : "adventure";
  }
  if (/\bRoom\b/i.test(faceText)) return "room";
  if (/\b(Daybound|Nightbound)\b/i.test(fullText)) return "transform";
  if (faceCount === 2) {
    if (/\bInstant —|\bSorcery —|\bCreature —|\bLand —|\bArtifact —|\bEnchantment —|\bPlaneswalker —|\bBattle —|\bKindred —|\bArtifact Creature —|\bEnchantment Creature —|\bLand Creature —|\bLegendary /i.test(faceText)) {
      return "mdfc";
    }
    return "split";
  }
  return "split";
}

function expandCompositeParagraphs(faceText: string): string[] {
  const chunks: string[] = [];

  for (const raw of faceText.split(/\n(?=[A-Z{("]|When |Whenever |At the beginning|Choose one|Choose two|Choose three|Suspend|Craft|Mutate|Chapter|Landfall|Cycling|Flashback|Foretell|Adventure|Aftermath|Read a chapter|[+\−-]\d+:|I —|II —|III —|IV —|V —|•)/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (/^Choose (?:one|two|three|one or more)/i.test(trimmed) && trimmed.includes("•")) {
      const header = trimmed.split("\n")[0]?.trim() ?? trimmed;
      chunks.push(header);
      for (const bullet of trimmed.split(/\n•\s*/).slice(1)) {
        const b = bullet.trim();
        if (b) chunks.push(`• ${b}`);
      }
      continue;
    }

    if (/^(I|II|III|IV|V) —/m.test(trimmed)) {
      for (const chapter of trimmed.split(/\n(?=(?:I|II|III|IV|V) —)/)) {
        const c = chapter.trim();
        if (c) chunks.push(c);
      }
      continue;
    }

    if (/^[+\−-]\d+:/m.test(trimmed)) {
      for (const line of trimmed.split(/\n(?=[+\−-]\d+:)/)) {
        const l = line.trim();
        if (l) chunks.push(l);
      }
      continue;
    }

    chunks.push(trimmed);
  }

  if (chunks.length === 0) return [faceText.trim()].filter(Boolean);
  return chunks;
}

/** Segment a card face into ability paragraphs. */
export function segmentAbilities(
  oracleId: string,
  cardFaceId: string,
  faceText: string,
  faceStartOffset = 0,
): SegmentedAbility[] {
  void oracleId;
  const paragraphs = expandCompositeParagraphs(faceText);

  if (paragraphs.length <= 1 && faceText.includes("\n")) {
    const lines = faceText.split("\n").map((l) => l.trim()).filter(Boolean);
    let searchFrom = 0;
    return lines.map((paragraphText, abilityIndex) => {
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

  let searchFrom = 0;
  return paragraphs.map((paragraphText, abilityIndex) => {
    const localStart = faceText.indexOf(paragraphText, searchFrom);
    searchFrom = localStart >= 0 ? localStart + paragraphText.length : searchFrom;
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
  if (/^(When|Whenever|At the beginning|At end of|At the start of|At the beginning of)/i.test(p)) {
    return "triggered";
  }
  if (/^\{[^}]+\}:|^Activate |^[+\−-]\d+:|^\(\{[^}]+\}[^)]*\):/i.test(p)) return "activated";
  if (/^(As |As long as |.*can't |.*cannot |.*can be |Each |All |Creatures |Permanents |Players |Enchanted |Equipped )/i.test(p)) {
    return "static";
  }
  if (/^[A-Z][a-z]+(?:, [a-z]+)*\.?$/.test(p) && p.length < 80) return "static";
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
