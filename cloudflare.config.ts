import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "listenuplads",
    compatibilityDate: "2026-11-10",
    observability: {
      enabled: true,
    },
    assets: {
      notFoundHandling: "single-page-application",
    },
  },
});
