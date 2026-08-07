/**
 * Shared variable-quantity attachment for Layer-2 primitives.
 * X being context-defined is not uncertainty when the definition is in the same ability.
 */

export type VariableQuantityCertainty =
  | "defined_in_ability"
  | "spell_cost_x"
  | "ambiguous";

export interface VariableQuantityFields {
  quantityType?: "literal" | "variable" | "derived";
  quantitySymbol?: string;
  quantityExpression?: string;
  quantityDefinitionSpan?: string;
  quantitySource?: "ability_where_clause" | "spell_mana_cost" | "unresolved";
  quantityCertainty?: VariableQuantityCertainty;
  quantityBase?: string;
  quantityMultiplier?: string;
  quantityDivisor?: string;
  quantityRounding?: "up" | "down" | "none";
}

const WHERE_X_IS = /\bwhere X is ([^.]+)/i;

/** Parse quantity for lose_life / gain_life / deal_damage / draw / create_token / mill spans. */
export function parseVariableQuantityFields(
  actionType: string,
  evidenceText: string,
  abilityParagraph: string,
): VariableQuantityFields {
  const equalTo = evidenceText.match(
    /\b(?:Each opponent |Each player |You |Target player |That player )?(?:lose(?:s)?|gain(?:s)?) life equal to (.+)$/i,
  );
  if (equalTo?.[1]) {
    return {
      quantityType: "variable",
      quantityExpression: equalTo[1].trim(),
      quantitySource: "ability_where_clause",
      quantityCertainty: "defined_in_ability",
    };
  }

  const dealsEqual = evidenceText.match(/\bdeals? damage equal to (.+)$/i);
  if (dealsEqual?.[1]) {
    return {
      quantityType: "variable",
      quantityExpression: dealsEqual[1].trim(),
      quantitySource: "ability_where_clause",
      quantityCertainty: "defined_in_ability",
    };
  }

  const derived = matchDerivedQuantity(actionType, evidenceText, abilityParagraph);
  if (derived) return derived;

  const symbolMatch = matchVariableSymbol(actionType, evidenceText);
  if (!symbolMatch) {
    const literal = matchLiteralQuantity(actionType, evidenceText);
    if (literal) {
      return { quantityType: "literal", quantityExpression: literal, quantityCertainty: "defined_in_ability" };
    }
    return {};
  }

  const { symbol, evidenceSpan } = symbolMatch;
  const whereInAbility = abilityParagraph.match(WHERE_X_IS);
  if (whereInAbility?.[1] && symbol === "X") {
    return {
      quantityType: "variable",
      quantitySymbol: symbol,
      quantityExpression: whereInAbility[1].trim(),
      quantityDefinitionSpan: whereInAbility[0].trim(),
      quantitySource: "ability_where_clause",
      quantityCertainty: "defined_in_ability",
    };
  }

  if (symbol === "X" && /\{X\}/.test(abilityParagraph)) {
    return {
      quantityType: "variable",
      quantitySymbol: "X",
      quantityExpression: "X",
      quantitySource: "spell_mana_cost",
      quantityCertainty: "spell_cost_x",
    };
  }

  if (symbol === "X") {
    const spellEffectX =
      /\b(?:lose(?:s)?|gain(?:s)?) X life\b/i.test(evidenceText) ||
      /\bdraw(?:s)? X cards?\b/i.test(evidenceText) ||
      /\bdeals? X damage\b/i.test(evidenceText) ||
      /\bcreate(?:s)? X [\w ]*tokens?\b/i.test(evidenceText) ||
      /\bmill(?:s)? X cards?\b/i.test(evidenceText);
    if (spellEffectX && !WHERE_X_IS.test(abilityParagraph)) {
      return {
        quantityType: "variable",
        quantitySymbol: "X",
        quantityExpression: "X",
        quantitySource: "spell_mana_cost",
        quantityCertainty: "spell_cost_x",
      };
    }
    return {
      quantityType: "variable",
      quantitySymbol: "X",
      quantityExpression: "X",
      quantitySource: "unresolved",
      quantityCertainty: "ambiguous",
    };
  }

  return {
    quantityType: "variable",
    quantitySymbol: symbol,
    quantityExpression: symbol,
    quantityCertainty: "defined_in_ability",
  };
}

function matchVariableSymbol(
  actionType: string,
  evidenceText: string,
): { symbol: string; evidenceSpan: string } | null {
  const patterns: Record<string, RegExp> = {
    lose_life: /\b(?:Each opponent |Each player |You |Target player |That player )?lose(?:s)? X life\b/i,
    gain_life: /\b(?:Each opponent |Each player |You |Target player |That player )?gain(?:s)? X life\b/i,
    deal_damage: /\bdeals? X damage\b/i,
    draw: /\bdraw(?:s)? X cards?\b/i,
    create_token: /\bcreate(?:s)? X\b/i,
    mill: /\bmill(?:s)? X cards?\b/i,
  };
  const p = patterns[actionType];
  if (!p?.test(evidenceText)) return null;
  return { symbol: "X", evidenceSpan: evidenceText };
}

function matchLiteralQuantity(actionType: string, evidenceText: string): string | null {
  if (actionType === "lose_life" || actionType === "gain_life") {
    const m = evidenceText.match(/\b(?:lose|gain)(?:s)? (\d+|up to \d+) life\b/i);
    return m?.[1] ?? null;
  }
  if (actionType === "deal_damage") {
    const m = evidenceText.match(/\bdeals? (\d+) damage\b/i);
    return m?.[1] ?? null;
  }
  return null;
}

export function variableQuantityNeedsReview(fields: VariableQuantityFields): boolean {
  return fields.quantityCertainty === "ambiguous";
}

function matchDerivedQuantity(
  actionType: string,
  evidenceText: string,
  abilityParagraph: string,
): VariableQuantityFields | null {
  const halfLife = evidenceText.match(/\b(?:Each opponent |Each player |Target player |That player |You )?lose(?:s)? half (?:their |your )?life\b/i);
  if (halfLife && (actionType === "lose_life" || /\bloses? half/i.test(evidenceText))) {
    const rounding = /\bRound up each time\b/i.test(abilityParagraph) ? "up" : "none";
    return {
      quantityType: "derived",
      quantityExpression: "half their life",
      quantityBase: "their life total",
      quantityDivisor: "2",
      quantityRounding: rounding === "up" ? "up" : "none",
      quantitySource: "ability_where_clause",
      quantityCertainty: "defined_in_ability",
    };
  }

  const halfDraw = evidenceText.match(/\b(?:draw|draws) cards? equal to half (.+)$/i);
  if (halfDraw && actionType === "draw") {
    const rounding = /\bRound up each time\b/i.test(abilityParagraph) ? "up" : "none";
    return {
      quantityType: "derived",
      quantityExpression: `half ${halfDraw[1].trim()}`,
      quantityBase: halfDraw[1].trim(),
      quantityDivisor: "2",
      quantityRounding: rounding === "up" ? "up" : "none",
      quantitySource: "ability_where_clause",
      quantityCertainty: "defined_in_ability",
    };
  }

  const halfMill = evidenceText.match(/\bmill(?:s)? half (.+)$/i);
  if (halfMill && actionType === "mill") {
    return {
      quantityType: "derived",
      quantityExpression: `half ${halfMill[1].trim()}`,
      quantityBase: halfMill[1].trim(),
      quantityDivisor: "2",
      quantityRounding: /\bRound up each time\b/i.test(abilityParagraph) ? "up" : "none",
      quantitySource: "ability_where_clause",
      quantityCertainty: "defined_in_ability",
    };
  }

  return null;
}
