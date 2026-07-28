/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  experimental: {
    // Server Actions can stream large pose-analysis payloads; raise the body limit.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    const productionHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];
    if (process.env.AVA_ENVIRONMENT === "closed_beta" || process.env.AVA_ENVIRONMENT === "production")
      productionHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    return [{ source: "/(.*)", headers: productionHeaders }];
  },
};

export default nextConfig;
