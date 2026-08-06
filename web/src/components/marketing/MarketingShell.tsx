import Link from "next/link";

const navLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/signup", label: "Sign up" },
  { href: "/login", label: "Store login" },
  { href: "/stores", label: "Find a store" },
];

export function MarketingNav() {
  return (
    <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-sm text-white">
            CS
          </span>
          <span className="hidden sm:inline">Card Scanner 9000</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-violet-700">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:inline"
          >
            Store login
          </Link>
          <Link
            href="/signup"
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
          >
            Start for $100/mo
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="font-semibold text-slate-900">Card Scanner 9000</p>
          <p className="mt-1 text-sm text-slate-600">
            Built for card shops that do not want employees spending all day looking up every
            single card.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
          <Link href="/pricing" className="hover:text-violet-700">
            Pricing
          </Link>
          <Link href="/signup" className="hover:text-violet-700">
            Sign up
          </Link>
          <Link href="/login" className="hover:text-violet-700">
            Store login
          </Link>
          <a href="mailto:support@cardscanner9000.com" className="hover:text-violet-700">
            Request demo
          </a>
        </div>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

export function MarketingCta({
  primaryHref = "/signup",
  primaryLabel = "Start for $100/month",
  secondaryHref = "/login",
  secondaryLabel = "Store login",
}: {
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Link
        href={primaryHref}
        className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
      >
        {primaryLabel}
      </Link>
      <Link
        href={secondaryHref}
        className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
      >
        {secondaryLabel}
      </Link>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow ? (
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">{eyebrow}</p>
      ) : null}
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-lg text-slate-600">{description}</p>
      ) : null}
    </div>
  );
}

export function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
    </div>
  );
}

export function PricingCard() {
  const includes = [
    "Store dashboard",
    "Customer scan/order flow",
    "AI-assisted card identification",
    "Staff review tools",
    "Pricing support",
    "Email notifications",
    "Ongoing improvements",
  ];

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-8 shadow-lg">
      <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">
        Card Scanner 9000 Store Plan
      </p>
      <p className="mt-4 text-5xl font-black text-slate-900">
        $100
        <span className="text-lg font-semibold text-slate-500">/month</span>
      </p>
      <p className="mt-2 text-sm text-slate-600">Monthly subscription · cancel anytime</p>
      <ul className="mt-6 space-y-2 text-sm text-slate-700">
        {includes.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-violet-600">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className="mt-8 flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700"
      >
        Start for $100/month
      </Link>
    </div>
  );
}
