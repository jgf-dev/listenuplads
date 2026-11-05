import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    // Logic suites are colocated vitest files. The trust-surfaces suite in
    // tests/ is a node --test runner (plain .mjs) — keep vitest scoped to src.
    include: ["src/**/*.test.ts"],
  },
});
