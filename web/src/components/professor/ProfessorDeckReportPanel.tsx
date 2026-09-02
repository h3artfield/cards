"use client";

import { useState } from "react";
import type {
  ProfessorCategoryGradeV4,
  ProfessorDeckGradeV4,
  ProfessorImprovementOptionV4,
} from "@/lib/deck-synthesis/professor-deck-grade-v4-v1";
import type { ProfessorDeckFinalReportV48 } from "@/lib/deck-synthesis/professor-deck-final-report-v4-8-v1";
import { ProfessorDeckFinalReportSections } from "./ProfessorDeckFinalReportSections";

function barWidth(score: number): string {
  return `${Math.max(8, Math.min(100, score))}%`;
}

function CategoryBlock({ category }: { category: ProfessorCategoryGradeV4 }) {
  return (
    <section className="professor-brew-brutal-panel border-2 border-[#111] bg-[#faf8f2] p-4 text-[#111]">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-wide text-[#111]">{category.label}</h3>
        <p className="text-sm font-black text-[#111]">
          {category.letter} <span className="text-neutral-700">/ {category.score}</span>
        </p>
      </div>
      <div className="mt-2 h-2 border-2 border-[#111] bg-neutral-200">
        <div className="h-full bg-[#ffe14d]" style={{ width: barWidth(category.score) }} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-neutral-800">{category.explanation}</p>
      {category.evidence.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-neutral-700">
          {category.evidence.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      ) : null}
      {category.affectedCards.length > 0 ? (
        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
          Key cards: {category.affectedCards.slice(0, 4).join(", ")}
        </p>
      ) : null}
    </section>
  );
}

export function ProfessorDeckReportPanel({
  grade,
  commanderName,
  finalReport,
  onClose,
  onShowImprovements,
}: {
  grade: ProfessorDeckGradeV4;
  commanderName: string;
  finalReport?: ProfessorDeckFinalReportV48 | null;
  onClose: () => void;
  onShowImprovements: (option: ProfessorImprovementOptionV4) => void;
}) {
  const [showImprovements, setShowImprovements] = useState(false);
  const actionableOptions = grade.improvementOptions.filter((option) => option.id !== "improve-happy");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-8">
      <div className="professor-brew-brutal-on-paper w-full max-w-3xl shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b-4 border-[#111] px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600">Professor&apos;s Deck Report</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">
              {finalReport?.deckName ?? commanderName}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="professor-brew-brutal-btn px-3 py-1.5 text-xs">
            Close
          </button>
        </header>

        <div className="grid gap-6 px-6 py-6 sm:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <div className="border-4 border-[#111] bg-[#ffe14d] p-5 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.18em]">Professor Grade</p>
              <p className="mt-2 text-5xl font-black">{grade.overallLetter}</p>
              <p className="text-lg font-black">
                {grade.cos?.competitiveStrength != null
                  ? `Competitive Strength ${Math.round(grade.cos.competitiveStrength)} / 100`
                  : "COS not scored"}
              </p>
            </div>

            {grade.bracketAlignment ? (
              <div className="professor-brew-brutal-panel border-2 border-[#111] bg-white p-4 text-[#111]">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">Requested</p>
                    <p className="mt-1 font-black">B{grade.bracketAlignment.requestedBracket}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">Effective</p>
                    <p className="mt-1 font-black">B{grade.bracketAlignment.effectiveBracket}</p>
                  </div>
                </div>
                <p
                  className={`mt-3 text-center text-[10px] font-black uppercase tracking-[0.15em] ${
                    grade.bracketAlignmentStatus === "TARGET_ACHIEVED"
                      ? "text-emerald-800"
                      : grade.bracketAlignmentStatus === "TARGET_MISSED"
                        ? "text-amber-800"
                        : "text-neutral-700"
                  }`}
                >
                  {grade.bracketAlignmentStatus === "TARGET_ACHIEVED"
                    ? `B${grade.bracketAlignment.requestedBracket} ✓ Target achieved`
                    : grade.bracketAlignmentStatus === "TARGET_EXCEEDED"
                      ? "Target exceeded"
                      : "Bracket alignment · Target missed"}
                </p>
              </div>
            ) : null}

            <div className="professor-brew-brutal-panel border-2 border-[#111] bg-white p-4 text-[#111]">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-700">Mechanical Confidence</p>
              <p className="mt-1 text-2xl font-black text-[#111]">{grade.mechanicalConfidencePercent}% verified</p>
              <p className="mt-1 text-xs text-neutral-800">
                {grade.verifiedConnections} / {grade.totalConnections} important connections checked against theory
              </p>
            </div>

            <div className="professor-brew-brutal-panel border-2 border-[#111] bg-white p-4 text-sm text-[#111]">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-700">Character Sheet</p>
              <dl className="mt-3 space-y-2 text-xs text-neutral-900">
                <div>
                  <dt className="font-black uppercase text-[#111]">Core Engines</dt>
                  <dd className="text-neutral-800">{grade.characterSheet.coreEngines.join(" · ") || "Seeding…"}</dd>
                </div>
                <div>
                  <dt className="font-black uppercase text-[#111]">Discovered Synergies</dt>
                  <dd className="text-neutral-800">★ {grade.characterSheet.discoveredSynergies}</dd>
                </div>
                <div>
                  <dt className="font-black uppercase text-[#111]">Verified Connections</dt>
                  <dd className="text-neutral-800">✓ {grade.characterSheet.verifiedConnectionsLabel}</dd>
                </div>
                <div>
                  <dt className="font-black uppercase text-[#111]">Weird Discoveries</dt>
                  <dd className="text-neutral-800">★ {grade.characterSheet.weirdDiscoveries}</dd>
                </div>
                <div>
                  <dt className="font-black uppercase text-[#111]">Independence</dt>
                  <dd className="text-neutral-800">Works without commander ~{grade.characterSheet.independencePercent}%</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="space-y-3 text-[#111]">
            {grade.categories.map((category) => (
              <div key={category.id} className="flex items-center justify-between border-b-2 border-[#111]/20 py-1.5 text-sm">
                <span className="font-bold uppercase tracking-wide text-[#111]">{category.label}</span>
                <span className="font-black text-[#111]">
                  {category.letter} <span className="text-neutral-700">{category.score}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 border-t-4 border-[#111] px-6 py-6">
          <CategoryBlock category={grade.bestArea} />
          <CategoryBlock category={grade.weakestArea} />
        </div>

        {finalReport?.status === "COMPLETE" ? <ProfessorDeckFinalReportSections report={finalReport} /> : null}

        <div className="professor-brew-brutal-panel border-t-4 border-[#111] bg-white px-6 py-5 text-[#111]">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-700">Professor&apos;s Notes</p>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">▲ Best area</p>
              <p className="font-bold text-[#111]">
                {grade.bestArea.label} — {grade.bestArea.letter}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-800">▼ Weakest area</p>
              <p className="font-bold text-[#111]">
                {grade.weakestArea.label} — {grade.weakestArea.letter}
              </p>
            </div>
            <p className="text-neutral-800">{grade.professorNotes[grade.professorNotes.length - 1]}</p>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-neutral-900">{grade.improvementProfessorLine}</p>

          {!showImprovements ? (
            <button
              type="button"
              onClick={() => setShowImprovements(true)}
              className="professor-brew-brutal-btn mt-4 px-4 py-2 text-xs"
            >
              Show me how to improve
            </button>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {actionableOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onShowImprovements(option)}
                  className="professor-brew-brutal-btn px-4 py-2 text-xs"
                >
                  [ {option.label} ]
                </button>
              ))}
              {grade.improvementOptions
                .filter((option) => option.id === "improve-happy")
                .map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onShowImprovements(option)}
                    className="professor-brew-brutal-btn px-4 py-2 text-xs"
                  >
                    {option.label}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
