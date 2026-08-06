import type { CardFaceComponentType, OracleAbilityType, SegmentedAbility } from "./oracle-action-schema";

export interface SegmentedCardFace {
  faceId: string;
  faceName: string;
  faceIndex: number;
  text: string;
  /** Card-relative span start (inclusive). */
  start: number;
  /** Card-relative span end (exclusive). */
  end: number;
  /** Face-relative span is always [0, text.length). */
  faceEvidenceStart: number;
  faceEvidenceEnd: number;
  cardEvidenceStart: number;
  cardEvidenceEnd: number;
  componentType: CardFaceComponentType;
}

const TYPE_LINE =
  /\b(?:Instant|Sorcery|Creature|Land|Artifact|Enchantment|Planeswalker|Battle|Kindred|Room|Artifact Creature|Enchantment Creature|Land Creature) —/i;

function normalizeOracle(oracleText: string): string {
  return oracleText.replace(/\r\n/g, "\n");
}

function extractFaceName(faceText: string): string {
  for (const line of faceText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^\{[^}]+\}/.test(trimmed)) continue;
    if (TYPE_LINE.test(trimmed)) continue;
    if (/^(When|Whenever|At the beginning|Choose one|Flash|Flying|Daybound|Nightbound|Aftermath)\b/i.test(trimmed)) {
      continue;
    }
    if (/^[A-Z][a-z]+(?:, [a-z]+)*\.?$/.test(trimmed) && trimmed.length < 40) continue;
    return trimmed;
  }
  const first = faceText.split("\n").map((l) => l.trim()).find(Boolean);
  return first ?? "Unknown";
}

function hasTypeLine(text: string): boolean {
  return TYPE_LINE.test(text);
}

function isAdventureSpell(text: string): boolean {
  return /\b(?:Instant|Sorcery) — Adventure\b/i.test(text) || /\b— Adventure\b/i.test(text);
}

function isCreaturePermanentFace(text: string): boolean {
  return /\b(?:Creature|Artifact Creature|Enchantment Creature|Land Creature|Planeswalker|Battle|Kindred) —/i.test(text);
}

function inferSingleFaceComponentType(text: string): CardFaceComponentType {
  if (/\bSaga\b/i.test(text) || /\b(I|II|III|IV|V) —/m.test(text)) return "single_face";
  if (/\bClass \d+/i.test(text)) return "single_face";
  if (/\b(Daybound|Nightbound)\b/i.test(text)) return "transform_front";
  if (/\bRoom\b/i.test(text) && !text.includes("\n//\n")) return "room_left";
  return "single_face";
}

function inferSplitFaceComponentType(
  fullText: string,
  faceText: string,
  faceIndex: number,
  faceCount: number,
): CardFaceComponentType {
  const otherIndex = faceIndex === 0 ? 1 : 0;
  const parts = fullText.split(/\n\/\/\n|\n\/\/\s*\n|\nAftermath\n/i);
  const otherText = parts[otherIndex] ?? "";

  if (/\nAftermath\n/i.test(fullText)) {
    return faceIndex === 0 ? "single_face" : "aftermath_half";
  }

  if (isAdventureSpell(faceText)) return "adventure";
  if (isCreaturePermanentFace(faceText) && isAdventureSpell(otherText)) return "adventure_creature";

  if (/\bRoom —/i.test(faceText) || (/\bRoom\b/i.test(fullText) && faceCount === 2)) {
    return faceIndex === 0 ? "room_left" : "room_right";
  }

  if (/\b(Daybound|Nightbound)\b/i.test(fullText) && faceCount === 2) {
    return faceIndex === 0 ? "transform_front" : "transform_back";
  }

  if (faceCount === 2 && hasTypeLine(faceText) && hasTypeLine(otherText) && !isAdventureSpell(faceText) && !isAdventureSpell(otherText)) {
    return faceIndex === 0 ? "mdfc_front" : "mdfc_back";
  }

  return "split_half";
}

function buildFace(
  text: string,
  start: number,
  faceIndex: number,
  faceId: string,
  componentType: CardFaceComponentType,
): SegmentedCardFace {
  const faceName = extractFaceName(text);
  const end = start + text.length;
  return {
    faceId,
    faceName,
    faceIndex,
    text,
    start,
    end,
    faceEvidenceStart: 0,
    faceEvidenceEnd: text.length,
    cardEvidenceStart: start,
    cardEvidenceEnd: end,
    componentType,
  };
}

function segmentByDelimiter(
  normalized: string,
  delimiter: RegExp,
  faceIdForIndex: (index: number, count: number) => string,
  componentForPart: (fullText: string, partText: string, index: number, count: number) => CardFaceComponentType,
): SegmentedCardFace[] {
  const parts = normalized.split(delimiter);
  const delimMatch = normalized.match(delimiter);
  const delimLen = delimMatch?.[0]?.length ?? 0;
  let offset = 0;
  const faces: SegmentedCardFace[] = [];

  for (let i = 0; i < parts.length; i++) {
    const text = parts[i];
    const start = offset;
    faces.push(
      buildFace(
        text,
        start,
        i,
        faceIdForIndex(i, parts.length),
        componentForPart(normalized, text, i, parts.length),
      ),
    );
    offset = start + text.length + (i < parts.length - 1 ? delimLen : 0);
  }
  return faces;
}

/** Split oracle text into card faces (split, MDFC, adventure, room, aftermath). */
export function segmentCardFaces(oracleText: string): SegmentedCardFace[] {
  const normalized = normalizeOracle(oracleText);

  if (/\nAftermath\n/i.test(normalized) && !/\n\/\/\n/.test(normalized)) {
    return segmentByDelimiter(
      normalized,
      /\nAftermath\n/i,
      (i) => (i === 0 ? "front" : "aftermath"),
      (full, part, i, count) => inferSplitFaceComponentType(full, part, i, count),
    );
  }

  const splitPattern = /\n\/\/\n|\n\/\/\s*\n/;
  if (splitPattern.test(normalized)) {
    return segmentByDelimiter(
      normalized,
      splitPattern,
      (i, count) => {
        if (/\bRoom\b/i.test(normalized) && count === 2) return i === 0 ? "left" : "right";
        return i === 0 ? "front" : i === 1 ? "back" : `face_${i}`;
      },
      (full, part, i, count) => inferSplitFaceComponentType(full, part, i, count),
    );
  }

  return [
    buildFace(normalized, 0, 0, "front", inferSingleFaceComponentType(normalized)),
  ];
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

/** True when card-relative evidence span crosses a face boundary. */
export function evidenceCrossesFaceBoundary(
  faces: SegmentedCardFace[],
  evidenceStart: number,
  evidenceEnd: number,
): boolean {
  const overlapping = faces.filter((f) => evidenceStart < f.end && evidenceEnd > f.start);
  return overlapping.length > 1;
}

export function faceForEvidenceSpan(
  faces: SegmentedCardFace[],
  evidenceStart: number,
  evidenceEnd: number,
): SegmentedCardFace | undefined {
  return faces.find((f) => evidenceStart >= f.start && evidenceEnd <= f.end);
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
