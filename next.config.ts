import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  typedRoutes: true,
  output: "standalone",
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    const serverUrl = process.env.MIAOMIAO_SEARCH_SERVER_URL ?? "http://127.0.0.1:3001";
    return [
      { source: "/api/:path*", destination: `${serverUrl}/api/:path*` },
      { source: "/mcp", destination: `${serverUrl}/mcp` },
    ];
  },
};

export default nextConfig;
