import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Règles react-hooks v6 (set-state-in-effect / refs) repassées en WARNING : elles
  // flaguent des motifs intentionnels et sûrs (init/redirect dans un effect, sync de
  // ref) qui feraient sinon échouer `next build`. À réévaluer si on refactore les hooks.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      // Icônes et sprites pixel-art servis tels quels (image-rendering: pixelated) :
      // next/image les redimensionnerait et les lisserait, sans gain de poids réel.
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
