import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  minify: true,
  treeshake: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  platform: "node",
  target: "node20",
  external: ["better-auth", "surrealdb"],
});
