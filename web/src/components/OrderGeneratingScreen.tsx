export function OrderGeneratingScreen({
  orderNumber,
  subtitle = "We're identifying your cards. This usually takes a minute.",
}: {
  orderNumber?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
        aria-hidden
      />
      <h1 className="mt-6 text-xl font-bold text-[var(--text-hi)]">
        Generating your order
      </h1>
      {orderNumber && (
        <p className="mt-2 text-sm font-medium text-indigo-700">{orderNumber}</p>
      )}
      <p className="mt-3 max-w-sm text-sm text-[var(--text)]">{subtitle}</p>
      <p className="mt-6 text-xs text-[var(--text-lo)]">
        Please keep this page open — you&apos;ll see your cards once processing
        finishes.
      </p>
    </div>
  );
}
