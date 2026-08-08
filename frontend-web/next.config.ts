import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build "standalone" : Next produit un serveur Node autonome minimal
  // (.next/standalone) avec uniquement les dépendances nécessaires — idéal pour
  // une image Docker légère (voir frontend-web/Dockerfile).
  output: "standalone",
  // NB : Next 16 ne lance plus ESLint pendant `next build` (seul le typecheck TS
  // bloque). Le lint tourne à part en CI (frontend-ci, non bloquant).
};

export default nextConfig;
