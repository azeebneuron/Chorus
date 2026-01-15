import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "bin/chorus.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["@chorus/core", "react"],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
