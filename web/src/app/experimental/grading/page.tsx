import Link from "next/link";

export const metadata = {
  title: "How decks are graded",
};

const SCALE = [
  ["0 of 100", "000"],
  ["25 of 100", "500"],
  ["40 of 100", "620"],
  ["44 of 100", "649"],
  ["100 of 100", "999"],
] as const;

export default function GradingPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="text-xs uppercase tracking-widest text-amber-400">Calculated decks</div>
        <h1 className="text-2xl font-semibold">How decks are graded</h1>
        <p className="max-w-3xl text-sm text-neutral-400">
          The same deck, the same stated plan, and the same 100 shuffles always produce the same four-digit score.{" "}
          <Link href="/experimental/calculated-decks" className="text-amber-400 hover:text-amber-300">
            Back to deck scores
          </Link>
        </p>
      </header>
      <main className="max-w-3xl space-y-10 px-6 py-8 text-sm leading-6 text-neutral-300">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-100">The four digits</h2>
          <p>
            The thousands digit is the deck&apos;s measured Commander bracket, from 1 to 5. The last three digits say how often the Professor&apos;s named line reaches a rules win. A bracket 3 deck whose line resolves on 44 of 100 seeds is <span className="text-neutral-100">3649</span>. A bracket 4 deck at 2 of 100 is <span className="text-neutral-100">4015</span>.
          </p>
          <p>
            The bracket digit comes from the cards in the list: game changers, chained extra turns, mass land denial, and the rest of the Commander bracket rubric. A build can be asked for bracket 4 and still measure as another bracket. That measured bracket is the one printed in the score.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-100">The steps</h2>
          <ol className="list-decimal space-y-3 pl-5">
            <li>The Professor builds one Commander deck and writes how that specific list is played: mulligans, early setup, and the order of the important cards.</li>
            <li>
              The Professor names the win. That claim lists the required pieces, how they connect, and the result that ends the game. The checker owns the rules numbers: 10 poison, 40 life from one opponent, or 21 commander damage.
            </li>
            <li>
              The checker matches that claim to the cards. A named creature with no power, a poison plan with no poison on the named creatures, or a win the cards cannot produce stops here. That deck gets no last three digits.
            </li>
            <li>
              A fixed pilot then plays the primary plan across the same 100 shuffles, seeds 0 through 99. Mana is generic. Lands and noncreature mana rocks enter ready. The pilot casts the named mana, tutors, and required pieces. Recovery cards are kept out of the win.
            </li>
            <li>
              The opponent does not take actions. Removing that one silent seat is the rules win used for this score. The plan rate is the share of those 100 seeds where the named line reaches that win. If the commander is the only required card, every rules win counts. Otherwise a required card other than the commander has to be cast or tutored in that game.
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-100">The scale</h2>
          <p>
            The last three digits are <span className="text-neutral-100">500 + 400 × log10(odds(p) / odds(0.25))</span>, clipped to 000–999. Odds of a rate p are p / (1 − p). A line that resolves on 25 of 100 seeds is 500. Doubling those odds adds about 120, so 40 of 100 is 620. Zero successes are 000. A line that resolves on every seed is 999.
          </p>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-800 text-xs uppercase tracking-widest text-neutral-500">
                <th className="py-2 pr-4 font-medium">Named line</th>
                <th className="py-2 font-medium">Last three digits</th>
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
          <h2 className="text-lg font-semibold text-neutral-100">The columns beside the score</h2>
          <p>Speed, plan, resilience, and synergy are measurements next to the four digits. They are not averaged into it.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="text-neutral-100">Plan</span> is the named-line rate that feeds the last three digits.
            </li>
            <li>
              <span className="text-neutral-100">Speed</span> is the median turn among rules wins. It is shown once at least 10 of the 100 seeds win by the rules. Winning earlier does not raise the four digits. Bracket 4&apos;s floor is that a game is expected to last at least four turns.
            </li>
            <li>
              <span className="text-neutral-100">Synergy</span> checks whether the named pieces, tutors, and mana belong to the stated plan. It stays beside the score.
            </li>
            <li>
              <span className="text-neutral-100">Resilience</span> is reserved for seven scripted setbacks on the same seeds: a removed creature, a removed commander, wipes, an exiled graveyard, and a countered payoff. Those replays are not running yet, so the column is empty.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
