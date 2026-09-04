/**
 * Feature flag — Sol-directed Professor GUI integration (staging rollback).
 */
export const PROFESSOR_SOL_DIRECTED_GUI_FLAG_V1_1_1_VERSION =
  "professor-sol-directed-gui-flag-v1-1-1";

export function isProfessorSolDirectedGuiEnabled(): boolean {
  return process.env.PROFESSOR_SOL_DIRECTED_GUI_ENABLED === "true";
}

/** Client-side mirror — set NEXT_PUBLIC_PROFESSOR_SOL_DIRECTED_GUI_ENABLED=true in staging. */
export function isProfessorSolDirectedGuiEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_PROFESSOR_SOL_DIRECTED_GUI_ENABLED === "true";
}

/**
 * Server-only — set PROFESSOR_SOL_DIRECTED_NEIGHBOR_EXPANSION_ENABLED=true to let underfilled
 * requirement pools take RC8 semantic neighbors of their seeds. Off means retrieval is unchanged.
 */
export function isProfessorSolDirectedNeighborExpansionEnabled(): boolean {
  return process.env.PROFESSOR_SOL_DIRECTED_NEIGHBOR_EXPANSION_ENABLED === "true";
}

/**
 * Server-only — set PROFESSOR_SOL_DIRECTED_BRACKET_POWER_RANKING_ENABLED=true to let the
 * requested bracket reorder requirement pools by tournament play rate and drop Game Changers
 * from brackets whose hard rules allow none. Off means retrieval ranks purely on role fit.
 */
export function isProfessorSolDirectedBracketPowerRankingEnabled(): boolean {
  return process.env.PROFESSOR_SOL_DIRECTED_BRACKET_POWER_RANKING_ENABLED === "true";
}

/**
 * Server-only — set PROFESSOR_SOL_DIRECTED_BRACKET_ATTAINMENT_ENABLED=true to measure the
 * finished deck against the requested bracket and swap in Game Changers until it reaches it.
 * Off means the deck ships at whatever bracket it happens to measure, which on the builds
 * measured so far was an average of 0.67 brackets below the request.
 */
export function isProfessorSolDirectedBracketAttainmentEnabled(): boolean {
  return process.env.PROFESSOR_SOL_DIRECTED_BRACKET_ATTAINMENT_ENABLED === "true";
}

/**
 * Server-only — set PROFESSOR_SOL_DIRECTED_BRACKET_CEILING_ENABLED=true to trim a deck that
 * measures *above* the requested bracket back down to it. Off means a request for a casual
 * Core deck can ship as an Optimized one: across nine measured builds, four came out above
 * the request and one came out two brackets high, every case driven by an infinite combo
 * nobody asked for.
 */
export function isProfessorSolDirectedBracketCeilingEnabled(): boolean {
  return process.env.PROFESSOR_SOL_DIRECTED_BRACKET_CEILING_ENABLED === "true";
}
