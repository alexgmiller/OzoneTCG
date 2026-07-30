import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          // Allow the SW to control the entire origin, not just paths under /sw.js
          { key: "Service-Worker-Allowed", value: "/" },
          // Always fetch the latest SW — never serve from the browser HTTP cache
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
