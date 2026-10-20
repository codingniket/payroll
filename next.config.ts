import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PDF.js loads its worker beside the server module. Keeping the package
  // external preserves that file instead of asking Next to bundle it.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
