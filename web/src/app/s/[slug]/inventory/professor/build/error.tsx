"use client";

export default function ProfessorBuildError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07070a] px-6 text-center">
      <div className="max-w-md">
        <p className="text-sm font-semibold tracking-wide text-[#c9a227]">The deck is still there</p>
        <p className="mt-3 text-sm text-neutral-300">
          The build finished, but this page hit an error while opening the list. Refresh to try
          again — the cards were saved.
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
