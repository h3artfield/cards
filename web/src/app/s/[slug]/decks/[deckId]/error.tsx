"use client";

export default function HandDeckError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07070a] px-6 text-center">
      <div className="max-w-md">
        <p className="text-sm font-semibold tracking-wide text-[#c9a227]">Could not open this deck</p>
        <p className="mt-3 text-sm text-neutral-300">
          The deck was created, but the editor failed while loading it. Refresh to try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-lg border border-[#c9a227]/50 px-4 py-2 text-sm text-[#e8d5a3]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
