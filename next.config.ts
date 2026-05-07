import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Restrict who can iframe Spark. Browsers enforce frame-ancestors;
        // X-Frame-Options is the legacy fallback but only supports a single origin,
        // so we rely on CSP for the multi-origin allowlist (enumeral.ai + localhost dev).
        source: "/embed",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://enumeral.ai https://www.enumeral.ai http://localhost:* http://127.0.0.1:*",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
