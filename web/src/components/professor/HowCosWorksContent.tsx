import Link from "next/link";
import { COS_V1_SCORE_VERSION } from "@/lib/commander-optimization-score/v1/constants";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="professor-mtg-title text-xl sm:text-2xl">{title}</h2>
      <div className="professor-mtg-body mt-3 space-y-3 text-sm leading-relaxed text-[var(--mtg-parchment)]">
        {children}
      </div>
    </section>
  );
}

function GradeCta({ href }: { href: string }) {
  return (
    <Link href={href} className="professor-mtg-btn inline-block px-5 py-3 text-xs">
      Grade a deck
    </Link>
  );
}

export function HowCosWorksContent({
  backHref,
  backLabel = "Back",
  gradeHref,
}: {
  backHref?: string;
  backLabel?: string;
  gradeHref: string;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      {backHref ? (
        <p className="mb-6">
          <Link href={backHref} className="professor-mtg-link">
            ← {backLabel}
          </Link>
        </p>
      ) : null}

      <header className="border-b border-[var(--mtg-stone-border)] pb-8">
        <p className="professor-mtg-label">How COS works</p>
        <h1 className="professor-mtg-title mt-2 text-3xl sm:text-4xl">
          How COS Scores Your Commander Deck
        </h1>
        <p className="professor-mtg-title mt-3 text-lg text-[var(--mtg-gold-bright)] sm:text-xl">
          Two numbers: how strong the deck is, and how well the 99 is optimized.
        </p>
        <p className="professor-mtg-body mt-5 max-w-2xl text-sm leading-relaxed">
          COS gives every Commander deck two main scores.
        </p>
        <div className="mt-6">
          <GradeCta href={gradeHref} />
        </div>
      </header>

      <div className="mt-10 space-y-12">
        <Section title="Competitive Strength">
          <p className="font-medium text-[var(--mtg-parchment-bright)]">
            How strong is this deck overall?
          </p>
          <p>
            COS measures the commander and the exact 99, then compares the result with the decks in
            its historical reference data.
          </p>
          <p className="text-[var(--mtg-parchment-bright)]">Example: 86 / 100</p>
          <p>
            A higher score means the deck&apos;s measured construction looks more like stronger decks
            in the COS reference population.
          </p>
          <p className="italic text-[var(--mtg-parchment-muted)]">
            It is not a predicted win percentage.
          </p>
        </Section>

        <Section title="Build Optimization">
          <p className="font-medium text-[var(--mtg-parchment-bright)]">
            How well is this particular 99 built for its commander?
          </p>
          <p>
            COS removes the commander&apos;s baseline strength and compares the construction of your
            99 with other builds of the same commander.
          </p>
          <p className="text-[var(--mtg-parchment-bright)]">Example: 82nd percentile</p>
          <p>
            That means this 99 scores higher on build optimization than about 82% of the reference
            builds for that commander.
          </p>
          <p>A deck can therefore have:</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="professor-mtg-stat p-4">
              <p className="professor-mtg-label">High Competitive Strength + Low Build Optimization</p>
              <p className="mt-2 text-xs">
                Powerful commander, but the 99 has room to improve.
              </p>
            </article>
            <article className="professor-mtg-stat p-4">
              <p className="professor-mtg-label">Lower Competitive Strength + High Build Optimization</p>
              <p className="mt-2 text-xs">
                The commander has a lower overall ceiling, but this build is highly tuned.
              </p>
            </article>
          </div>
          <p>
            Build Optimization is shown only when COS has enough reference lists for that commander.
          </p>
        </Section>

        <Section title="What COS Measures">
          <p>COS looks at measurable properties of the deck itself:</p>
          <p className="professor-mtg-label pt-1">Strength drivers</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Win Architecture", "Complete combo and win routes"],
              ["Mana Efficiency", "Curve, cheap cards, and acceleration"],
              ["Interaction", "Answers to opposing threats"],
              ["Protection", "Ability to protect important pieces"],
              ["Card Advantage", "Draw and card flow"],
              ["Coherence", "How strongly the 99 supports a common plan"],
            ].map(([title, body]) => (
              <article key={title} className="professor-mtg-stat p-3">
                <p className="professor-mtg-label text-[10px]">{title}</p>
                <p className="mt-2 text-xs leading-relaxed">{body}</p>
              </article>
            ))}
          </div>
          <p className="professor-mtg-label pt-2">Deck characteristics</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Access / Consistency", "Ability to find important cards"],
              ["Redundancy", "Backup ways to perform key functions"],
              ["Resilience", "Recovery after disruption"],
              ["Role Compression", "Cards that perform multiple jobs"],
            ].map(([title, body]) => (
              <article key={title} className="professor-mtg-stat p-3">
                <p className="professor-mtg-label text-[10px]">{title}</p>
                <p className="mt-2 text-xs leading-relaxed">{body}</p>
              </article>
            ))}
          </div>
          <p className="font-medium text-[var(--mtg-parchment-bright)]">
            These ten scores are not averaged to make Competitive Strength.
          </p>
          <p>They explain the deck.</p>
        </Section>

        <Section title="How the Number Is Made">
          <p>At its simplest:</p>
          <p className="font-medium text-[var(--mtg-parchment-bright)]">
            Deck Strength = Commander Baseline + Build Contribution
          </p>
          <p>
            Competitive Strength compares that result with the overall historical reference
            population.
          </p>
          <p>
            Build Optimization compares only the Build Contribution with other decks using the same
            commander.
          </p>
          <details className="professor-mtg-stat p-4">
            <summary className="professor-mtg-label cursor-pointer">Technical form</summary>
            <p className="mt-4 font-serif text-[var(--mtg-parchment-bright)]">
              <em>U</em> = <em>S</em>
              <sub>c</sub> + β<sup>⊤</sup>
              <em>z</em>(<em>x</em>)
            </p>
          </details>
        </Section>

        <Section title="Combos and Win Conditions">
          <p>
            COS uses CommanderSpellbook data to identify known combos whose required cards are
            actually present in the deck.
          </p>
          <p>Your report then shows:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>verified combo pieces</li>
            <li>what the combo produces</li>
            <li>primary win conditions</li>
            <li>secondary win conditions</li>
            <li>backup plans</li>
            <li>important synergies between cards</li>
          </ul>
          <p>Professor explains these results in normal language.</p>
        </Section>

        <Section title="Same Deck, Same Score">
          <p>COS&apos;s numeric grading does not come from an AI making a judgment.</p>
          <p>For the same exact deck under the same COS version:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Competitive Strength stays the same.</li>
            <li>Build Optimization stays the same.</li>
            <li>Profile scores stay the same.</li>
          </ul>
          <p>Professor may explain the deck differently, but it does not decide the COS numbers.</p>
        </Section>

        <Section title="What COS Does Not Measure">
          <p>COS does not add points for:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>playing more colors</li>
            <li>favorable matchups</li>
            <li>a player&apos;s skill</li>
            <li>popularity</li>
            <li>an AI deciding the deck “feels powerful”</li>
          </ul>
          <p>
            Color count was tested during development and did not add useful independent information
            once the commander and actual construction were accounted for.
          </p>
        </Section>

        <Section title="What the Score Means — and Doesn't">
          <p>COS measures deck strength and construction.</p>
          <p>It does not tell you that an 80 will always beat a 60.</p>
          <p>Actual games also depend on:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>pilot skill</li>
            <li>opening hands</li>
            <li>mulligans</li>
            <li>draws</li>
            <li>sequencing</li>
            <li>table politics</li>
            <li>opponents</li>
          </ul>
          <p className="font-medium text-[var(--mtg-parchment-bright)]">
            COS is a deck score, not a guaranteed win probability.
          </p>
        </Section>

        <section className="border-t border-[var(--mtg-stone-border)] pt-8">
          <p className="professor-mtg-label">See the two scores on your list</p>
          <h2 className="professor-mtg-title mt-2 text-xl">Grade a Commander deck</h2>
          <div className="mt-6">
            <GradeCta href={gradeHref} />
          </div>
          <p className="professor-mtg-muted mt-6 text-[11px]">COS v1 · {COS_V1_SCORE_VERSION}</p>
        </section>
      </div>
    </div>
  );
}
