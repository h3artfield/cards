import { MarketingShell, PricingCard, SectionHeading } from "@/components/marketing/MarketingShell";

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Pricing"
            title="Card Scanner 9000 Store Plan"
            description="One monthly subscription for your shop dashboard, customer scan flow, AI-assisted identification, staff review tools, and ongoing improvements."
          />
          <div className="mt-10">
            <PricingCard />
          </div>
          <p className="mx-auto mt-8 max-w-xl text-center text-sm text-slate-500">
            Designed to save stores up to 75% of the time normally spent looking up customer
            cards. Results vary by store volume and workflow.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
