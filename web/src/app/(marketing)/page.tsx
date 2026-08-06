import Link from "next/link";
import {
  FeatureCard,
  MarketingCta,
  MarketingShell,
  PricingCard,
  SectionHeading,
} from "@/components/marketing/MarketingShell";

const problems = [
  "Employees spend too much time looking up cards.",
  "Customers bring piles of mixed cards.",
  "Variants, foils, reprints, and parallels are easy to misprice.",
  "Staff jump between eBay, PriceCharting, TCGplayer, Scryfall, and other tools.",
  "Manual lookup slows down the counter.",
];

const solutions = [
  "Customer scans cards or submits photos.",
  "System identifies likely card versions.",
  "System pulls market and pricing evidence.",
  "Store staff reviews and confirms.",
  "The order becomes ready for final in-store review.",
  "Customer can be notified when processing is complete.",
];

const features = [
  {
    title: "AI-assisted card identification",
    description: "Photos are analyzed to suggest likely names, sets, and printings.",
  },
  {
    title: "Variant and printing detection",
    description: "Narrow reprints, foils, and parallels before staff confirm.",
  },
  {
    title: "Multi-game support",
    description: "Built for Pokémon, Magic, Yu-Gi-Oh, sports cards, and more.",
  },
  {
    title: "V2 pricing workflow",
    description: "Evidence → suspects → staff confirmation → store rules.",
  },
  {
    title: "Staff confirmation tools",
    description: "Review exact versions with photos and pricing context.",
  },
  {
    title: "Store review dashboard",
    description: "Orders, cards, and review queue in one place.",
  },
  {
    title: "Customer order tracking",
    description: "Customers submit from your store link or QR code.",
  },
  {
    title: "Ready-for-review emails",
    description: "Notify customers when processing is complete.",
  },
  {
    title: "Manual comp entry",
    description: "Add comps when market data needs a human touch.",
  },
  {
    title: "Price history support",
    description: "Reference recent market movement during review.",
  },
  {
    title: "Multi-source market checks",
    description: "Cross-check pricing evidence from several sources.",
  },
  {
    title: "AI-assisted pricing with staff confirmation",
    description: "Estimates help staff — final decisions stay in your hands.",
  },
];

const steps = [
  {
    n: "1",
    title: "Customer submits cards",
    body: "They scan or upload photos through your store link.",
  },
  {
    n: "2",
    title: "Card Scanner 9000 analyzes photos",
    body: "Identification and pricing evidence are prepared automatically.",
  },
  {
    n: "3",
    title: "Store staff review exact versions",
    body: "Confirm printings, condition, and offer details.",
  },
  {
    n: "4",
    title: "Pricing and offers are prepared",
    body: "Your store rules apply after staff confirmation.",
  },
  {
    n: "5",
    title: "Final in-store review",
    body: "Customer brings cards to an associate for the final pass.",
  },
];

export default function MarketingHomePage() {
  return (
    <MarketingShell>
      <section className="bg-gradient-to-b from-violet-50 via-white to-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">
              Card Scanner 9000
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
              Scan customer cards. Get prices faster. Review with confidence.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-600">
              Card Scanner 9000 helps trading card stores identify, price, and organize
              customer buyback orders using AI-assisted card recognition, market pricing, and
              staff review tools.
            </p>
            <div className="mt-8 flex justify-center">
              <MarketingCta />
            </div>
            <p className="mt-6 text-sm text-slate-500">
              Designed to save stores up to 75% of the time normally spent looking up customer
              cards.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="The problem"
            title="Buyback counters get buried in lookup work"
            description="Every pile of customer cards turns into a scavenger hunt across apps, sites, and binders."
          />
          <ul className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-2">
            {problems.map((item) => (
              <li
                key={item}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="The solution"
            title="Turn card piles into organized review orders"
            description="Card Scanner 9000 helps card shops scan, identify, price, and review customer card buyback orders faster."
          />
          <ol className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2">
            {solutions.map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700"
              >
                {item}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-y border-slate-100 bg-violet-50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Time savings"
            title="Save up to 75% of card lookup time"
            description="Designed to save stores up to 75% of the time normally spent looking up customer cards — less manual searching, faster sorting, and staff only review the uncertain cards."
          />
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2">
            {[
              "Less manual searching",
              "Faster sorting",
              "Faster card version narrowing",
              "Cleaner buyback workflow",
              "Staff only review the uncertain cards",
              "Cut down time identifying and pricing cards",
            ].map((item) => (
              <div
                key={item}
                className="rounded-xl bg-white/80 px-4 py-3 text-sm font-medium text-slate-800"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="Features" title="Everything your counter team needs" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <FeatureCard key={f.title} title={f.title} description={f.description} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="From customer photos to final review" />
          <div className="mx-auto mt-10 grid max-w-4xl gap-4">
            {steps.map((step) => (
              <div
                key={step.n}
                className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
                  {step.n}
                </span>
                <div>
                  <h3 className="font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="Pricing" title="One simple plan for card shops" />
          <div className="mt-10">
            <PricingCard />
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-slate-900 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold">Ready to speed up your card buyback counter?</h2>
          <p className="mt-4 text-slate-300">
            Sign up your store and start processing customer orders with AI-assisted review tools.
          </p>
          <div className="mt-8 flex justify-center">
            <MarketingCta
              primaryHref="/signup"
              secondaryHref="/login"
              secondaryLabel="Store login"
            />
          </div>
          <p className="mt-6">
            <Link href="mailto:support@cardscanner9000.com" className="text-sm text-violet-300 hover:underline">
              Request demo
            </Link>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
