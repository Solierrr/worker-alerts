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
          // Os canais opcionais ficam desligados: um .dev.vars com segredos de verdade não pode
          // fazer o teste chamar o e-mail ou o Telegram
          EMAIL_API_URL: "",
          EMAIL_SERVICE_KEY: "",
          ALERT_EMAIL_TO: "",
          TELEGRAM_BOT_TOKEN: "",
          TELEGRAM_CHAT_ID: "",
        },
      },
    }),
  ],
  test: { include: ["src/**/*.test.ts", "test/**/*.test.ts"] },
});
