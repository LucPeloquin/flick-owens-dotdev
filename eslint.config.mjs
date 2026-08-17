import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The SkyEmu checkout and generated Emscripten module are provisioned
    // dependencies, not source files owned by this app. Keep upstream lint
    // noise out of the project check while still linting our worker/adapter
    // integration code.
    "vendor/skyemu-v5/**",
    "public/emulator/skyemu-v5/**",
  ]),
]);

export default eslintConfig;
