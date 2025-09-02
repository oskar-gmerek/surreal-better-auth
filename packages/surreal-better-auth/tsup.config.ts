import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  minify: true,
  treeshake: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  platform: "node",
  target: "node20",
  external: ["better-auth", "surrealdb"],
  esbuildOptions(options) {
    options.conditions = ["module", "import", "default"];
  },
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
});
