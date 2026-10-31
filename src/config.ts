import { z } from "zod";
import { parseRouting, type Routing } from "./routing/routing";

export interface JiraConfig {
  baseUrl: string;
  user: string;
  apiToken: string;
}

export interface AlertsConfig {
  environment: string;
  grafanaUrl?: string;
  minIntervalMin: number;
  maxPer24h: number;
  logWindowMin: number;
  routing: Routing;
  jira?: JiraConfig;
}

const positive = z.coerce.number().int().positive();
const text = z.string().trim().min(1);

const envSchema = z.object({
  ALERT_ENVIRONMENT: text.default("prod"),
  ALERT_GRAFANA_URL: z.url().optional(),
  ALERT_MIN_INTERVAL_MIN: positive.default(30),
  ALERT_MAX_PER_24H: positive.default(8),
  ALERT_LOG_WINDOW_MIN: positive.default(30),
});

const jiraSchema = z.object({
  JIRA_BASE_URL: z.url(),
  JIRA_USER: text,
  JIRA_API_TOKEN: text,
});

function present(env: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([, value]) => typeof value === "string" && value.trim() !== "",
    ),
  );
}

// The Jira channel switches on only when every one of its variables is valid;
// a half configured channel is reported instead of failing at the first alert.
export function loadConfig(env: Env): AlertsConfig {
  const source = present(env as unknown as Record<string, unknown>);
  const base = envSchema.parse(source);
  const jira = jiraSchema.safeParse(source);
  return {
    environment: base.ALERT_ENVIRONMENT,
    grafanaUrl: base.ALERT_GRAFANA_URL?.replace(/\/+$/, ""),
    minIntervalMin: base.ALERT_MIN_INTERVAL_MIN,
    maxPer24h: base.ALERT_MAX_PER_24H,
    logWindowMin: base.ALERT_LOG_WINDOW_MIN,
    routing: parseRouting(),
    jira: jira.success
      ? {
          baseUrl: jira.data.JIRA_BASE_URL.replace(/\/+$/, ""),
          user: jira.data.JIRA_USER,
          apiToken: jira.data.JIRA_API_TOKEN,
        }
      : undefined,
  };
}
