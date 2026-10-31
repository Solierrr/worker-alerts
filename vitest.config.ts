import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          WEBHOOK_TOKEN: "test-token-with-enough-length-0123456789",
          ALERT_GRAFANA_URL: "https://grafana.test",
          JIRA_BASE_URL: "https://jira.test",
          JIRA_USER: "grafana@test",
          JIRA_API_TOKEN: "jira-token",
        },
      },
    }),
  ],
  test: { include: ["src/**/*.test.ts", "test/**/*.test.ts"] },
});
