/**
 * Oracle-derived semantic function tags for deck construction and commander blueprints.
 */
export const PROFESSOR_CARD_SEMANTIC_FUNCTIONS_V1_1_1_VERSION =
  "professor-card-semantic-functions-v1-1-1";

/** Max oracle text chars sent to Constructor per candidate (nonlands and lands). */
export const CONSTRUCTOR_CANDIDATE_ORACLE_TEXT_MAX_V111 = 600;

export function inferCardSemanticFunctions(oracleText: string, typeLine: string): string[] {
  const text = `${oracleText} ${typeLine}`.toLowerCase();
  const fns: string[] = [];
  if (/surveil|mill|graveyard/.test(text)) fns.push("GRAVEYARD_SETUP");
  if (/return.*graveyard|from your graveyard|cast.*graveyard/.test(text)) fns.push("GRAVEYARD_RECURSION");
  if (/create .* token|token/.test(text)) fns.push("TOKEN_GENERATION");
  if (/sacrifice/.test(text)) fns.push("SACRIFICE");
  if (/draw (a|one|two|three|\d+) card|draws .* card/.test(text)) fns.push("CARD_DRAW");
  if (/flying|hexproof|indestructible|double strike|trample|menace/.test(text)) fns.push("COMBAT");
  if (/extra turn|take an extra turn/.test(text)) fns.push("EXTRA_TURN");
  if (/counter target spell/.test(text)) fns.push("INTERACTION");
  if (/add \{/.test(text)) fns.push("MANA");
  if (/exile/.test(text)) fns.push("EXILE");
  if (/transform|transforms/.test(text)) fns.push("TRANSFORM");
  if (/search your library|tutor/.test(text)) fns.push("TUTOR");
  if (/destroy target|destroy all|deals .* damage to (any target|target)/.test(text)) fns.push("REMOVAL");
  if (/protection from|prevent all damage|regenerate|indestructible until/.test(text)) fns.push("PROTECTION");
  return fns;
}
