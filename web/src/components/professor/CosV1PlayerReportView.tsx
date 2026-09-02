import Link from "next/link";
import type { CosV1PlayerReport, CosV1PlayerReportBand } from "@/lib/commander-optimization-score/v1/types";
import { ordinalPercentile } from "@/lib/commander-optimization-score/v1/player-report";
import { howCosWorksPath } from "@/lib/commander-optimization-score/v1/public-path";

function bandOf(report: CosV1PlayerReport, band: CosV1PlayerReportBand) {
  return report.profile.filter((axis) => axis.band === band);
}

function AxisRow({
  label,
  percentile,
  mapping,
  explanation,
}: {
  label: string;
  percentile: number;
  mapping: "within_commander" | "global" | "blended";
  explanation: string;
}) {
  const width = `${Math.max(8, Math.min(100, Math.round(percentile)))}%`;
  return (
    <div className="professor-mtg-stat">
      <div className="flex items-baseline justify-between gap-2">
        <p className="professor-mtg-label text-[10px]">{label}</p>
        <p className="professor-mtg-body text-sm font-semibold tabular-nums">
          {ordinalPercentile(percentile)}
          <span className="ml-1 text-[10px] font-normal opacity-60">
            {mapping === "within_commander" ? "vs this commander" : mapping === "blended" ? "blended" : "global"}
          </span>
        </p>
      </div>
      <div className="professor-mtg-bar mt-2">
        <div className="professor-mtg-bar-fill" style={{ width }} />
      </div>
      <p className="professor-mtg-muted mt-2 text-xs leading-relaxed">{explanation}</p>
    </div>
  );
}

export function CosV1PlayerReportView({
  report,
  storeSlug,
}: {
  report: CosV1PlayerReport;
  storeSlug?: string;
}) {
  const drivers = bandOf(report, "Strength drivers");
  const traits = bandOf(report, "Deck characteristics");
  const extraCombos = report.knownComboCount - report.knownCombos.length;

  return (
    <div className="mt-6 space-y-6">
      <section>
        <p className="professor-mtg-label">Deck profile</p>
        <p className="professor-mtg-muted mt-1 text-xs leading-relaxed">
          Percentiles versus comparable decks. Strength drivers are associated with the frozen model.
          Deck characteristics are descriptive. None of these numbers are averaged into Competitive Strength.
        </p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <p className="professor-mtg-muted text-xs uppercase tracking-wide">Strength drivers</p>
            {drivers.map((axis) => (
              <AxisRow
                key={axis.id}
                label={axis.label}
                percentile={axis.percentile}
                mapping={axis.mapping}
                explanation={axis.explanation}
              />
            ))}
          </div>
          <div className="space-y-3">
            <p className="professor-mtg-muted text-xs uppercase tracking-wide">Deck characteristics</p>
            {traits.map((axis) => (
              <AxisRow
                key={axis.id}
                label={axis.label}
                percentile={axis.percentile}
                mapping={axis.mapping}
                explanation={axis.explanation}
              />
            ))}
          </div>
        </div>
      </section>

      <section>
        <p className="professor-mtg-label">How this deck works</p>
        <p className="professor-mtg-body mt-2 text-sm leading-relaxed">{report.howThisDeckWorks}</p>
      </section>

      {report.keySynergies.length ? (
        <section>
          <p className="professor-mtg-label">Key synergies</p>
          <ul className="professor-mtg-body mt-2 list-disc space-y-1 pl-5 text-sm">
            {report.keySynergies.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <p className="professor-mtg-label">Verified CommanderSpellbook combos</p>
        {report.knownCombos.length ? (
          <>
            <ul className="professor-mtg-body mt-2 space-y-2 text-sm">
              {report.knownCombos.map((combo) => (
                <li key={combo.pieces.join("|")}>
                  <span className="font-medium">{combo.pieces.join(" + ")}</span>
                  <span className="professor-mtg-muted ml-2 text-xs">
                    {combo.cardCount} cards · {combo.kind}
                    {combo.commanderInvolved ? " · commander involved" : ""}
                    {combo.buckets.length ? ` · ${combo.buckets.join(", ")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {extraCombos > 0 ? (
              <p className="professor-mtg-muted mt-2 text-xs">
                And {extraCombos} more verified line{extraCombos === 1 ? "" : "s"}.
              </p>
            ) : null}
          </>
        ) : (
          <p className="professor-mtg-body mt-2 text-sm leading-relaxed">
            No CARD_COMPLETE CommanderSpellbook lines on this list.
          </p>
        )}
      </section>

      <section>
        <p className="professor-mtg-label">Win conditions</p>
        <ul className="professor-mtg-body mt-2 space-y-2 text-sm">
          {report.winConditions.map((wc) => (
            <li key={`${wc.rank}-${wc.title}`}>
              <span className="professor-mtg-muted text-xs uppercase tracking-wide">{wc.rank}</span>
              <p className="font-medium">{wc.title}</p>
              <p className="professor-mtg-muted text-xs leading-relaxed">{wc.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="professor-mtg-label">Why it received these scores</p>
        <ul className="professor-mtg-body mt-2 list-disc space-y-1 pl-5 text-sm">
          {report.whyTheScore.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section>
        <p className="professor-mtg-label">Where the build has the most optimization headroom</p>
        <ul className="professor-mtg-body mt-2 list-disc space-y-1 pl-5 text-sm">
          {report.optimizationHeadroom.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <p>
        <Link href={howCosWorksPath(storeSlug)} className="professor-mtg-link" target="_blank" rel="noreferrer">
          How COS works
        </Link>
      </p>
    </div>
  );
}
