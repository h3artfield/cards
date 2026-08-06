import Image from "next/image";

type Variant = "hero" | "header" | "compact" | "storefront" | "brutalist" | "auth";

export function StoreBrandMark({
  storeName,
  logoUrl,
  variant = "hero",
  subtitle,
}: {
  storeName: string;
  logoUrl?: string | null;
  variant?: Variant;
  subtitle?: string;
}) {
  const logoSizes: Record<Variant, string> = {
    hero: "h-20 w-20 rounded-2xl",
    header: "h-9 w-9 rounded-lg",
    compact: "mx-auto h-12 w-12 rounded-xl",
    storefront: "h-28 w-28 rounded-3xl shadow-md ring-1 ring-black/5",
    brutalist: "h-48 w-48 object-contain drop-shadow-[0_4px_24px_rgba(0,0,0,0.3)]",
    auth: "h-44 w-44 object-contain sm:h-52 sm:w-52",
  };

  const logoPx: Record<Variant, number> = {
    hero: 80,
    header: 36,
    compact: 32,
    storefront: 112,
    brutalist: 192,
    auth: 208,
  };

  const logo = logoUrl ? (
    <Image
      src={logoUrl}
      alt={`${storeName} logo`}
      width={logoPx[variant]}
      height={logoPx[variant]}
      className={`object-contain ${logoSizes[variant]}`}
      unoptimized={logoUrl.startsWith("data:")}
    />
  ) : (
    <div
      className={`flex items-center justify-center bg-indigo-600 text-white ${logoSizes[variant]} ${
        variant === "storefront"
          ? "text-4xl shadow-md"
          : variant === "brutalist"
            ? "h-48 w-48 text-5xl"
            : variant === "auth"
              ? "h-44 w-44 text-6xl sm:h-52 sm:w-52"
            : variant === "hero"
            ? "text-3xl"
            : variant === "header"
              ? "text-lg"
              : "text-xl"
      }`}
    >
      🃏
    </div>
  );

  if (variant === "header") {
    return (
      <div className="flex items-center gap-3">
        {logo}
        <div className="min-w-0 text-left">
          <p className="truncate text-lg font-bold text-gray-900">{storeName}</p>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="text-center">
        {logo}
        <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-gray-950 drop-shadow-[0_1px_8px_rgba(255,255,255,0.9)]">{storeName}</p>
      </div>
    );
  }

  if (variant === "storefront") {
    return (
      <div className="text-center text-white">
        <div className="flex justify-center">{logo}</div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">{storeName}</h1>
        {subtitle && <p className="mt-2 text-base text-indigo-100">{subtitle}</p>}
      </div>
    );
  }

  if (variant === "auth") {
    return (
      <div className="mb-10 flex flex-col items-center text-center">
        {logo}
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {storeName}
        </h1>
        {subtitle && (
          <p className="mt-3 text-sm uppercase tracking-[0.12em] text-neutral-400">
            {subtitle}
          </p>
        )}
      </div>
    );
  }

  if (variant === "brutalist") {
    return (
      <div className="flex flex-col items-center text-center">
        {logo}
        <h1 className="mt-8 max-w-full text-balance text-2xl font-black uppercase leading-snug tracking-tight text-gray-950 drop-shadow-[0_2px_14px_rgba(255,255,255,0.95)]">
          {storeName}
        </h1>
        {subtitle && (
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.14em] text-gray-700 drop-shadow-[0_1px_10px_rgba(255,255,255,0.9)]">
            {subtitle}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="text-center">
      {logo}
      <h1 className="mt-4 text-2xl font-bold">{storeName}</h1>
    </div>
  );
}
