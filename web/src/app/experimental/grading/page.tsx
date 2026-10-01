import Link from "next/link";

export const metadata = {
  title: "How decks are graded",
};

const SCALE = [
  ["Field-median threat-by-clock rate", "500"],
  ["About 2× those odds", "~620"],
  ["Never threatens by the clock", "000"],
  ["Threatens by the clock on every seed", "999"],
] as const;

export default function GradingPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="text-xs uppercase tracking-widest text-amber-400">Calculated decks</div>
        <h1 className="text-2xl font-semibold">How decks are graded</h1>
        <p className="max-w-3xl text-sm text-neutral-400">
          Phase A: the bracket digit is live; the last three digits stay withheld until the threat-by-clock
          statistic is frozen and that band passes its gate.{" "}
          <Link href="/experimental/calculated-decks" className="text-amber-400 hover:text-amber-300">
            Back to deck scores
          </Link>
        </p>
      </header>
      <main className="max-w-3xl space-y-10 px-6 py-8 text-sm leading-6 text-neutral-300">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-100">The four digits</h2>
          <p>
            The thousands digit is the deck&apos;s measured Commander bracket from the WotC rubric (game changers,
            extra turns, MLD, and the rest). A build asked for bracket 4 can still measure as another bracket; the
            measured digit is what prints.
          </p>
          <p>
            The last three digits will mean how often the list presents a lethal goldfish threat{" "}
            <span className="text-neutral-100">on or before the typical own-turn clock for that bracket</span>
            , compared with other decks in the same band. Until that statistic is frozen, the board shows{" "}
            <span className="text-neutral-100">4···</span> (or the matching bracket digit), never a provisional
            three-digit stamp from the old named-line page.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-100">Threat-by-clock (freeze candidate)</h2>
          <p>This is the blocker before any published <span className="text-neutral-100">BXYZ</span>:</p>
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              For bracket band <span className="text-neutral-100">b</span>, build a comparison field of decks that
              can reach a lethal goldfish threat. Exclude unreachable lists from the field.
            </li>
            <li>
              Let <span className="text-neutral-100">C_b</span> be the median own-turn among those successful threat
              games (the bracket clock).
            </li>
            <li>
              For a scored deck, run the frozen goldfish engine for N seeds.{" "}
              <span className="text-neutral-100">p</span> is the share of seeds that present a lethal threat on or
              before own-turn <span className="text-neutral-100">C_b</span>. This uses the list alone — not the
              Professor&apos;s named line.
            </li>
            <li>
              Let <span className="text-neutral-100">p_med</span> be the median of <span className="text-neutral-100">p</span>{" "}
              over the field. Last three digits:{" "}
              <span className="text-neutral-100">
                500 + 400 × log10(odds(p) / odds(p_med))
              </span>
              , clipped to 000–999, with odds(x) = x / (1 − x). Zero and one map to 000 and 999.
            </li>
          </ol>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-800 text-xs uppercase tracking-widest text-neutral-500">
                <th className="py-2 pr-4 font-medium">Meaning</th>
                <th className="py-2 font-medium">Last three</th>
              </tr>
            </thead>
            <tbody>
              {SCALE.map(([rate, digits]) => (
                <tr key={rate} className="border-b border-neutral-900">
                  <td className="py-2 pr-4">{rate}</td>
                  <td className="py-2 font-semibold text-neutral-100">{digits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-100">Plan check (not the score)</h2>
          <p>
            The old named-line pilot still runs as evidence. It does not fill the last three digits. We keep the raw
            fields separate:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="text-neutral-100">Valid / invalid</span> — can the named pieces, tutors, and outlet
              exist on this list?
            </li>
            <li>
              <span className="text-neutral-100">Named-line rate</span> — share of seeds where that line reaches a
              rules win.
            </li>
            <li>
              <span className="text-neutral-100">Named-line speed</span> — median own-turn among those wins (shown
              once enough seeds succeed).
            </li>
          </ul>
          <p>
            The board&apos;s Plan check column is a short summary of those fields. Expand a row to see the evidence.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-100">Own turns</h2>
          <p>
            Goldfish Speed is counted in the scored deck&apos;s own turns. In the current one-seat pilot, log lines
            like T11 are already own turns — not multiplayer game turns divided by seat count. Later multiplayer
            clocks, if added, will convert with ceil(gameTurn / seats) and will be versioned.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-100">Columns beside the score</h2>
          <p>These measurements sit next to the digits. They have zero weight until Forge analysis says otherwise.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="text-neutral-100">Speed</span> — median own-turn of goldfish threats / wins for the
              scoring path (once enough successes).
            </li>
            <li>
              <span className="text-neutral-100">Plan check</span> — named-line evidence summary (above).
            </li>
            <li>
              <span className="text-neutral-100">Synergy</span> — reserved for a frozen EDHREC co-occurrence snapshot
              (population fit). Not plan connectivity.
            </li>
            <li>
              <span className="text-neutral-100">Theme fit</span> — reserved for RC8 semantic fit to the commander.
            </li>
            <li>
              <span className="text-neutral-100">Combos</span> — reserved for Commander Spellbook complete and
              one-card-short lines.
            </li>
            <li>
              <span className="text-neutral-100">Resilience</span> — reserved for scripted setback replays; empty for
              now.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
