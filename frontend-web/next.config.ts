import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build "standalone" : Next produit un serveur Node autonome minimal
  // (.next/standalone) avec uniquement les dépendances nécessaires — idéal pour
  // une image Docker légère (voir frontend-web/Dockerfile).
  output: "standalone",
};

export default nextConfig;
