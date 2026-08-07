/**
 * Shared variable-quantity attachment for Layer-2 primitives.
 * X being context-defined is not uncertainty when the definition is in the same ability.
 */

export type VariableQuantityCertainty =
  | "defined_in_ability"
  | "spell_cost_x"
  | "ambiguous";

export interface VariableQuantityFields {
  quantityType?: "literal" | "variable";
  quantitySymbol?: string;
  quantityExpression?: string;
  quantityDefinitionSpan?: string;
  quantitySource?: "ability_where_clause" | "spell_mana_cost" | "unresolved";
  quantityCertainty?: VariableQuantityCertainty;
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
