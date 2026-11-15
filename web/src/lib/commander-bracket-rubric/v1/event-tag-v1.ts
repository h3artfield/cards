/**
 * Regex tags for TopDeck event titles. Entering a cEDH event is a B5
 * declaration; a "Bracket 3" in the title is a declared floor, not a
 * measurement. Unknown titles stay unknown — do not infer B4 from "EDH".
 */
export type EventFieldTagV1 =
  | { kind: "cedh"; declaredBracket: 5 }
  | { kind: "bracket_labeled"; declaredBracket: 1 | 2 | 3 | 4 | 5 }
  | { kind: "precon"; declaredBracket: 1 }
  | { kind: "casual"; declaredBracket: null }
  | { kind: "unknown"; declaredBracket: null };

const CEDH =
  /\b(?:c-?edh|cedh|competitive\s*(?:edh|commander)|c\s*edh)\b/i;
const BRACKET = /\bbracket\s*([1-5])\b|\bb([1-5])\b/i;
const PRECON = /\b(?:pre-?con|preconstructed|precons?)\b/i;
const CASUAL = /\b(?:casual|unpowered|jank|battlecruiser|pre-?con)\b/i;

export function tagEventFromTitleV1(title: string | null | undefined): EventFieldTagV1 {
  const name = (title ?? "").trim();
  if (!name) return { kind: "unknown", declaredBracket: null };

  const bracket = name.match(BRACKET);
  const declared = bracket
    ? (Number(bracket[1] || bracket[2]) as 1 | 2 | 3 | 4 | 5)
    : null;

  if (CEDH.test(name)) {
    if (declared && declared <= 3) {
      return { kind: "bracket_labeled", declaredBracket: declared };
    }
    return { kind: "cedh", declaredBracket: 5 };
  }
  if (declared != null) return { kind: "bracket_labeled", declaredBracket: declared };
  if (PRECON.test(name)) return { kind: "precon", declaredBracket: 1 };
  if (CASUAL.test(name)) return { kind: "casual", declaredBracket: null };
  return { kind: "unknown", declaredBracket: null };
}

/** cEDH entry is the B5 declaration. Measured floor stays 2–4. */
export function fieldBracketV1(args: {
  measured: 2 | 3 | 4;
  tag: EventFieldTagV1;
}): 1 | 2 | 3 | 4 | 5 {
  if (args.tag.kind === "cedh" && args.measured === 4) return 5;
  return args.measured;
}
