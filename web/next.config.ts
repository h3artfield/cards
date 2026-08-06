import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
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
