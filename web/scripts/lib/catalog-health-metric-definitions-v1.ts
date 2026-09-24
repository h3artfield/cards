export const CATALOG_HEALTH_METRIC_DEFINITIONS = {
  cardsWithAnyIntegrityIssue:
    "semanticInvalid OR idInvalid OR provenanceInvalid OR acceptedActionOutsideOwnerSpanCount > 0 OR forbiddenEmissionCount > 0",
  cardsWithAnyParserDiagnostic: "semantic.diagnostics.length > 0",
  cardsWithAnyNeedsReview: "needsReviewActions.length > 0",
  cardsNonPublishable: "publishable === false (structuralInvalid OR idInvalid OR provenanceInvalid)",
  cardsWithNoDiagnostics:
    "semantic.diagnostics.length === 0 (orthogonal to correctness — many valid cards emit zero diagnostics)",
};
