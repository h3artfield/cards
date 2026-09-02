"use client";

import type { ProfessorDeckFinalReportV48 } from "@/lib/deck-synthesis/professor-deck-final-report-v4-8-v1";

function VerdictBadge({ verdict }: { verdict: string }) {
  const tone =
    verdict === "ENDORSE"
      ? "bg-emerald-200 text-emerald-950"
      : verdict === "MINOR_CHANGES"
        ? "bg-amber-200 text-amber-950"
        : "bg-red-200 text-red-950";
  return (
    <span className={`inline-block border-2 border-[#111] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${tone}`}>
      {verdict.replace(/_/g, " ")}
    </span>
  );
}

export function ProfessorDeckFinalReportSections({ report }: { report: ProfessorDeckFinalReportV48 }) {
  const headProfessor = report.headProfessorReview;
  const frontier = report.frontierReview;
  const play = report.playReport;

  return (
    <div className="space-y-6 border-t-4 border-[#111] px-6 py-6 text-[#111]">
      {headProfessor?.summary || headProfessor?.review ? (
        <section className="professor-brew-brutal-panel border-4 border-[#111] bg-[#0a0a0a] p-5 text-neutral-100">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ffe14d]">Head Professor reviewed the deck</p>
          {headProfessor.status === "FAILED" && headProfessor.headProfessorError ? (
            <p className="mt-2 text-sm text-red-300">{headProfessor.headProfessorError}</p>
          ) : null}
          {headProfessor.review?.bracketAssessment ? (
            <div className="mt-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#ffe14d]">Bracket assignment</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-200">{headProfessor.review.bracketAssessment}</p>
              {headProfessor.review.predictedEffectiveBracket ? (
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Effective bracket: B{headProfessor.review.predictedEffectiveBracket}
                </p>
              ) : null}
            </div>
          ) : null}
          {headProfessor.summary && headProfessor.summary.keyImprovements.length > 0 ? (
            <div className="mt-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#ffe14d]">Key improvements</p>
              <ul className="mt-2 space-y-1 text-sm text-neutral-300">
                {headProfessor.summary.keyImprovements.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="professor-brew-brutal-panel border-2 border-[#111] bg-[#ffe14d] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-800">Named deck</p>
        <h3 className="mt-1 text-2xl font-black uppercase tracking-tight">{report.deckName}</h3>
        {report.deckSubtitle ? <p className="mt-2 text-sm font-bold text-neutral-900">{report.deckSubtitle}</p> : null}
        <p className="mt-3 text-sm leading-relaxed text-neutral-900">{report.deckIdentity}</p>
        {play ? (
          <p className="mt-3 text-xs font-black uppercase tracking-wider text-neutral-800">
            Final grade: {play.professorGradeLetter} ({play.professorGradeScore}/100)
          </p>
        ) : null}
      </section>

      <section className="professor-brew-brutal-panel border-2 border-[#111] bg-white p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">Strategy</p>
        <p className="mt-2 text-sm leading-relaxed">{report.strategySummary}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">Primary win condition</p>
            <p className="mt-1 text-sm font-bold">{report.primaryWinCondition}</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">What makes it unique</p>
            <p className="mt-1 text-sm leading-relaxed">{report.uniquenessThesis}</p>
          </div>
        </div>
      </section>

      {play ? (
        <>
          <section className="professor-brew-brutal-panel border-2 border-[#111] bg-[#faf8f2] p-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">How the deck works</p>
            <div className="mt-3 space-y-3 text-sm leading-relaxed">
              <p><span className="font-black uppercase text-[10px] tracking-wider">Early</span> — {play.howItWorks.earlyGame}</p>
              <p><span className="font-black uppercase text-[10px] tracking-wider">Mid</span> — {play.howItWorks.midgame}</p>
              <p><span className="font-black uppercase text-[10px] tracking-wider">Late</span> — {play.howItWorks.lateGame}</p>
            </div>
            {play.commanderRole ? (
              <p className="mt-4 text-sm leading-relaxed"><span className="font-black">Commander:</span> {play.commanderRole}</p>
            ) : null}
            {play.pilotingGuide ? (
              <p className="mt-3 text-sm leading-relaxed"><span className="font-black">Piloting:</span> {play.pilotingGuide}</p>
            ) : null}
            {play.mulliganGuide ? (
              <p className="mt-3 text-sm leading-relaxed"><span className="font-black">Mulligan:</span> {play.mulliganGuide}</p>
            ) : null}
          </section>

          <section className="professor-brew-brutal-panel border-2 border-[#111] bg-white p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Strengths</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {play.strengths.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-800">Weaknesses</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {play.weaknesses.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              </div>
            </div>
            {play.opponentAttacks.length > 0 ? (
              <div className="mt-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">How opponents attack it</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {play.opponentAttacks.map((a) => (
                    <li key={a}>• {a}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {play.recoveryPlan ? (
              <p className="mt-4 text-sm leading-relaxed">{play.recoveryPlan}</p>
            ) : null}
          </section>
        </>
      ) : null}

      <section className="professor-brew-brutal-panel border-2 border-[#111] bg-[#faf8f2] p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">Professor council summary</p>
        <p className="mt-2 text-sm leading-relaxed">{report.professorDefense.councilSummary}</p>
        <p className="mt-4 border-t-2 border-[#111]/20 pt-4 text-sm italic">{report.professorDefense.closingStatement}</p>
      </section>

      {frontier ? (
        <section className="professor-brew-brutal-panel border-2 border-[#111] bg-neutral-900 p-5 text-neutral-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ffe14d]">Head Professor assessment</p>
            <VerdictBadge verdict={frontier.verdict} />
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Model: {frontier.model}</p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-200">{frontier.summary}</p>
        </section>
      ) : null}

      {report.error ? (
        <p className="text-xs text-amber-800">Note: partial fallback used ({report.error}).</p>
      ) : null}
    </div>
  );
}
