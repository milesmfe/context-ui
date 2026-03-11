import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    core: "src/core.ts",
    react: "src/react.ts",
    svelte: "src/svelte.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ["react", "svelte"],
});
