import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/commander-optimization-score": [
      "./data/milestones/mechanical-space/commander-optimization-score-v1/**",
      "./data/milestones/mechanical-space/spellbook-win-architecture-space-v1/normalized-combo-dictionary.jsonl",
      "./data/milestones/catalog-shadow/catalog-semantic-visualization-v1-points.json.gz",
      "./data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz",
    ],
  },
  typescript: {
    // Milestone snapshot TS under data/ and legacy parser strictness gaps — app routes typecheck in CI separately.
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "cards.scryfall.io",
      },
      {
        protocol: "https",
        hostname: "c1.scryfall.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
    ];
  },
  // Required when opening the dev server from a phone via LAN IP (e.g. 192.168.1.125:3000).
  // Without this, Next.js blocks /_next/* chunks and client components never load.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.1.125",
    "192.168.109.1",
    "192.168.120.1",
    "*.trycloudflare.com",
  ],
};

export default nextConfig;
