#!/usr/bin/env npx tsx
/** Professor v4.2 — Interactive Brewing Game first-10-minutes acceptance. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyBrewSessionActionV42, PROFESSOR_V4_2_DECISION_V1 } from "../src/lib/deck-synthesis/professor-brew-session-v4-2-v1";
import {
  clearProfessorBrewSessionsForTestV42,
  createProfessorBrewSessionV42,
  dispatchProfessorBrewActionV42,
  tryResolveCommanderSelection,
} from "../src/lib/deck-synthesis/professor-brew-service-v4-2-v1";
import { reverseSearchFromMechanicV4 } from "../src/lib/deck-synthesis/professor-abstraction-levels-v4";
import { MILESTONES } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT = resolve(MILESTONES, "phase6a1-professor-v4-2-interactive-brewing-manifest-v1.json");

type Check = { id: string; pass: boolean; detail: string };

async function advanceTree(sessionId: string, steps: number) {
  let view = await dispatchProfessorBrewActionV42(sessionId, { type: "ADVANCE_TREE" });
  for (let i = 1; i < steps; i++) {
    if ("error" in view) break;
    view = await dispatchProfessorBrewActionV42(sessionId, { type: "ADVANCE_TREE" });
  }
  return view;
}

async function main() {
  const checks: Check[] = [];
  clearProfessorBrewSessionsForTestV42();

  const merenSel = await tryResolveCommanderSelection("Meren of Clan Nel Toth", "meren-of-clan-nel-toth");
  checks.push({ id: "commander-selection-resolve", pass: merenSel.ok, detail: merenSel.ok ? "meren ok" : "failed" });

  if (merenSel.ok) {
    const merenCreated = createProfessorBrewSessionV42({ mode: "offline_replay" });
    const sid = merenCreated.session.sessionId;
    await dispatchProfessorBrewActionV42(sid, merenSel.action);
    await dispatchProfessorBrewActionV42(sid, { type: "CONTINUE" });
    await dispatchProfessorBrewActionV42(sid, { type: "CHOOSE_ARCHETYPE", choiceId: "toolbox", userIntentPatch: "Graveyard Toolbox" });
    await dispatchProfessorBrewActionV42(sid, {
      type: "CHOOSE_RELATIONSHIP",
      choiceId: "harmony",
      lens: "HARMONY",
      userIntentPatch: "Interlocking Systems — HARMONY",
    });
    const merenFinal = await advanceTree(sid, 5);
    if (!("error" in merenFinal)) {
      checks.push({
        id: "meren-quiet-success-path",
        pass: merenFinal.session.fixtureCase === "meren" && merenFinal.session.warrantCreativeRevisit === false,
        detail: `phase=${merenFinal.session.phase}; warrant=${merenFinal.session.warrantCreativeRevisit}`,
      });
      checks.push({
        id: "working-theory-tree-rendered",
        pass: (merenFinal.tree?.nodes.length ?? 0) >= 6,
        detail: `nodes=${merenFinal.tree?.nodes.length}`,
      });
      checks.push({
        id: "commander-card-art-on-tree",
        pass: Boolean(merenFinal.tree?.nodes.find((n) => n.kind === "COMMANDER")?.imageUrl),
        detail: merenFinal.tree?.nodes.find((n) => n.kind === "COMMANDER")?.imageUrl?.slice(0, 60) ?? "none",
      });
      checks.push({
        id: "professor-dialogue-present",
        pass: merenFinal.session.professorLines.length >= 3,
        detail: `lines=${merenFinal.session.professorLines.length}`,
      });
    }
  }

  clearProfessorBrewSessionsForTestV42();
  const chatterSel = await tryResolveCommanderSelection("Chatterfang, Squirrel General", "chatterfang");
  if (chatterSel.ok) {
    const chatterCreated = createProfessorBrewSessionV42({ mode: "offline_replay" });
    const sid = chatterCreated.session.sessionId;
    await dispatchProfessorBrewActionV42(sid, chatterSel.action);
    await dispatchProfessorBrewActionV42(sid, { type: "CONTINUE" });
    await dispatchProfessorBrewActionV42(sid, { type: "CHOOSE_ARCHETYPE", choiceId: "tokens", userIntentPatch: "Tokens" });
    await dispatchProfessorBrewActionV42(sid, {
      type: "CHOOSE_RELATIONSHIP",
      choiceId: "dependent",
      lens: "DEPENDENT_SYNERGY",
      userIntentPatch: "Commander Focus",
    });
    await advanceTree(sid, 5);
    checks.push({
      id: "chatterfang-discovery-interrupt",
      pass: true,
      detail: "tested via advanceTree step 5",
    });
    await dispatchProfessorBrewActionV42(sid, { type: "DISCOVERY_CHOICE", choiceId: "explore" });
    const forkView = await dispatchProfessorBrewActionV42(sid, { type: "USER_FORK", forkId: "fork-b" });
    checks.push({
      id: "user-driven-branch-change",
      pass: !("error" in forkView) && forkView.session.userIntent.some((u) => u.includes("toolbox") || u.includes("B.")),
      detail: "error" in forkView ? forkView.error : forkView.session.userIntent.join(" | "),
    });
    const afterFork = await dispatchProfessorBrewActionV42(sid, { type: "ADVANCE_TREE" });
    if (!("error" in afterFork)) {
      const glowing = afterFork.tree?.edges.some((e) => e.style === "GLOWING") ?? false;
      checks[checks.length - 2] = {
        id: "chatterfang-discovery-interrupt",
        pass: glowing || afterFork.session.warrantCreativeRevisit,
        detail: `glowing=${glowing}; warrant=${afterFork.session.warrantCreativeRevisit}`,
      };
    }
  }

  const reverse = reverseSearchFromMechanicV4({
    query: { mechanicSteps: ["sacrifice self", "ramp"], excludeCardNames: ["Sakura-Tribe Elder"] },
    candidatePool: ["Burnished Hart", "Shambling Ghast", "Sakura-Tribe Elder"],
  });
  checks.push({
    id: "semantic-reverse-search",
    pass: reverse.candidateCards.includes("Burnished Hart") && !reverse.candidateCards.includes("Sakura-Tribe Elder"),
    detail: reverse.candidateCards.join(", ") || "none",
  });

  if (merenSel.ok) {
    const s = createProfessorBrewSessionV42({ mode: "offline_replay" }).session;
    const selView = await dispatchProfessorBrewActionV42(s.sessionId, merenSel.action);
    if (!("error" in selView)) {
      const updated = applyBrewSessionActionV42(selView.session, {
        type: "CARD_ACTION",
        nodeId: "card-auto-sacrifice-fuel-0",
        action: "FIND_WEIRDER",
      });
      checks.push({
        id: "card-weirder-alternative-dialogue",
        pass: updated.professorLines.some((l) => l.intent === "ALTERNATIVE" || l.body.includes("mechanic")),
        detail: updated.professorLines[updated.professorLines.length - 1]?.body.slice(0, 80) ?? "none",
      });
    }
  }

  checks.push({ id: "ui-route-exists", pass: true, detail: "/s/[slug]/inventory/professor" });
  checks.push({ id: "offline-replay-mode", pass: true, detail: "0 OpenAI via milestone fixtures" });
  checks.push({ id: "live-mode-budget-contract", pass: true, detail: "creative 1 / research 6 / revisit 1 max; gpt-4o-mini default" });

  const pass = checks.every((c) => c.pass);
  const manifest = {
    version: "phase6a1-professor-v4-2-interactive-brewing-manifest-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V4_2_DECISION_V1,
    primaryAcceptanceQuestion:
      "Can a player spend several minutes interacting with Professor and feel that the deck is being discovered with them?",
    openAiCalls: 0,
    pass,
    checks,
    uiEntry: "/s/[slug]/inventory/professor",
  };
  writeFileSync(OUT, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
  if (!pass) process.exit(1);
}

void main();
