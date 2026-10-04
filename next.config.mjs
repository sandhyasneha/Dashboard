/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Admin pages show live numbers, so never reuse a saved copy of a page the browser has already visited
  // (the default keeps it for 30 seconds, which made Filings & revenue look stale after clicking away and back).
  experimental: { staleTimes: { dynamic: 0, static: 30 } },
};
export default nextConfig;
