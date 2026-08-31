import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: { build: true },
  minify: true,
  sourcemap: true,
  clean: true,
  platform: "node",
  target: "node20",
  deps: {
    neverBundle: ["better-auth", "surrealdb"],
  },
  treeshake: true,
});
