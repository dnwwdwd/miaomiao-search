import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  typedRoutes: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    const serverUrl = process.env.LAZYCAT_SEARCH_SERVER_URL ?? "http://127.0.0.1:3001";
    return [
      { source: "/api/:path*", destination: `${serverUrl}/api/:path*` },
      { source: "/mcp", destination: `${serverUrl}/mcp` },
    ];
  },
};

export default nextConfig;
