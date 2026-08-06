"use client";

import { glassPanel } from "@/lib/glass-styles";

export const STOREFRONT_BG_URL = "/images/storefront-bg.png";
export const SIGN_IN_BG_VIDEO_URL = "/videos/sign-in-bg.mp4";

type BrandedPageShellProps = {
  children: React.ReactNode;
  /** Wrap content in a frosted card (sign-in). Store entry passes false. */
  card?: boolean;
  /** Sign-in uses looping muted video; store pages keep the static image. */
  background?: "image" | "video";
};

export function BrandedPageShell({
  children,
  card = true,
  background = "image",
}: BrandedPageShellProps) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-neutral-900">
      {background === "video" ? (
        <video
          className="absolute inset-0 h-full w-full scale-105 object-cover"
          src={SIGN_IN_BG_VIDEO_URL}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden
        />
      ) : (
        <div
          className="absolute inset-0 scale-105 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${STOREFRONT_BG_URL}")` }}
          aria-hidden
        />
      )}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/15"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-5 py-10 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:px-6">
        {card ? (
          <div className={`${glassPanel} px-6 py-8`}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
