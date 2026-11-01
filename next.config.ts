import type { NextConfig } from "next";

// GitHub Pages project sites are served from /<repo>/. The deploy workflow
// sets NEXT_PUBLIC_BASE_PATH; local builds keep the root path.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // cmdlib is a fully static product: no server, no telemetry, no runtime.
  output: "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
