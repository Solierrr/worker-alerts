import { z } from "zod";
import { parseRouting, type Routing } from "./routing/routing";

export interface JiraConfig {
  baseUrl: string;
  user: string;
  apiToken: string;
}

export interface EmailConfig {
  apiUrl: string;
  serviceKey: string;
  recipients: string[];
}

export interface AlertsConfig {
  environment: string;
  grafanaUrl?: string;
  minIntervalMin: number;
  maxPer24h: number;
  logWindowMin: number;
  routing: Routing;
  jira?: JiraConfig;
  email?: EmailConfig;
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

// O e-mail liga só com os três valores: o endereço do api-email, a chave de serviço do Worker e a
// lista de destinatários (separados por vírgula ou ponto e vírgula)
const emailSchema = z.object({
  EMAIL_API_URL: z.url(),
  EMAIL_SERVICE_KEY: text,
  ALERT_EMAIL_TO: z
    .string()
    .transform((value) =>
      value
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.email()).min(1).max(20)),
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
  const email = emailSchema.safeParse(source);
  return {
    environment: base.ALERT_ENVIRONMENT,
    grafanaUrl: base.ALERT_GRAFANA_URL?.replace(/\/+$/, ""),
    minIntervalMin: base.ALERT_MIN_INTERVAL_MIN,
    maxPer24h: base.ALERT_MAX_PER_24H,
    logWindowMin: base.ALERT_LOG_WINDOW_MIN,
    routing: parseRouting(),
    email: email.success
      ? {
          apiUrl: email.data.EMAIL_API_URL.replace(/\/+$/, ""),
          serviceKey: email.data.EMAIL_SERVICE_KEY,
          recipients: email.data.ALERT_EMAIL_TO,
        }
      : undefined,
    jira: jira.success
      ? {
          baseUrl: jira.data.JIRA_BASE_URL.replace(/\/+$/, ""),
          user: jira.data.JIRA_USER,
          apiToken: jira.data.JIRA_API_TOKEN,
        }
      : undefined,
  };
}
