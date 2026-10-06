import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@vado/contracts"],
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  poweredByHeader: false,
  typedRoutes: true,
  agentRules: false,
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ]);
  },
};
export default config;
