import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse/pdfjs cargan su worker desde node_modules: no se deben empaquetar.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
