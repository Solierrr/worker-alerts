import { createHash } from "node:crypto";
import type { AlertsConfig } from "../config";
import { resolveTarget } from "../routing/routing";
import type { GrafanaAlert, Priority } from "./schema";

export const jiraPriorities: Record<Priority, string> = {
  P1: "Highest",
  P2: "High",
  P3: "Medium",
  P4: "Low",
  P5: "Lowest",
};

export interface AlertLinks {
  dashboard?: string;
  logs?: string;
  traces?: string;
}

export interface Incident {
  alertId: string;
  alertName: string;
  service: string;
  environment: string;
  priority: Priority;
  jiraPriority: string;
  jiraProject: string;
  jiraIssueType: string;
  category: string;
  escalationGroup?: string;
  firing: boolean;
  test: boolean;
  startsAt: Date;
  endsAt?: Date;
  key: string;
  tags: string[];
  summary: string;
  description: string;
  impact: string;
  firstSteps: string;
  links: AlertLinks;
  logWindow: { from: Date; to: Date };
  logWindowMin: number;
}

const MINUTE = 60_000;
// Only a Grafana dashboard path with plain query characters is trusted from the payload
const dashboardPath = /^\/d\/[a-z0-9-]+(\?[A-Za-z0-9=&._%-]*)?$/;

function exploreUrl(base: string, pane: Record<string, unknown>) {
  const panes = encodeURIComponent(JSON.stringify({ a: pane }));
  return `${base}/explore?schemaVersion=1&panes=${panes}&orgId=1`;
}

function buildLinks(
  base: string | undefined,
  alert: GrafanaAlert,
  window: { from: Date; to: Date },
): AlertLinks {
  if (!base) return {};
  const { service_name: service, deployment_environment: env } = alert.labels;
  const path = alert.annotations?.dashboard ?? "";
  const dashboard = dashboardPath.test(path)
    ? path
    : `/d/solier-saude-geral?var-environment=${encodeURIComponent(env)}`;
  const range = {
    from: String(window.from.getTime()),
    to: String(window.to.getTime()),
  };
  return {
    dashboard: `${base}${dashboard}`,
    logs: exploreUrl(base, {
      datasource: "loki",
      queries: [
        {
          refId: "A",
          datasource: { type: "loki", uid: "loki" },
          expr: `{service_name="${service}", deployment_environment="${env}"} | severity_text=~"(?i)error|fatal|critical"`,
        },
      ],
      range,
    }),
    traces: exploreUrl(base, {
      datasource: "tempo",
      queries: [
        {
          refId: "A",
          datasource: { type: "tempo", uid: "tempo" },
          queryType: "traceql",
          query: `{ resource.service.name = "${service}" && resource.deployment.environment = "${env}" && status = error }`,
        },
      ],
      range,
    }),
  };
}

function incidentKey(alert: GrafanaAlert) {
  const { labels } = alert;
  return createHash("sha1")
    .update(
      `${labels.alert_id}|${labels.service_name}|${labels.deployment_environment}`,
    )
    .digest("hex")
    .slice(0, 12);
}

export function toIncident(
  alert: GrafanaAlert,
  config: AlertsConfig,
  now = new Date(),
): Incident {
  const { labels } = alert;
  const annotations = alert.annotations ?? {};
  const alertName = labels.alertname ?? "";
  const category = labels.category ?? "geral";
  const firing = alert.status === "firing";
  const startsAt = new Date(alert.startsAt);
  // Grafana sends the zero date as endsAt while the alert is still firing
  const reportedEnd = alert.endsAt ? new Date(alert.endsAt) : undefined;
  const endsAt =
    !firing && reportedEnd && reportedEnd.getUTCFullYear() > 2000
      ? reportedEnd
      : undefined;
  const key = incidentKey(alert);
  const target = resolveTarget(config.routing, labels.service_name);
  const margin = config.logWindowMin * MINUTE;
  const logWindow = {
    from: new Date(startsAt.getTime() - margin),
    to: new Date((endsAt ?? now).getTime() + margin),
  };
  return {
    alertId: labels.alert_id,
    alertName,
    service: labels.service_name,
    environment: labels.deployment_environment,
    priority: labels.priority,
    jiraPriority: jiraPriorities[labels.priority],
    jiraProject: target.project,
    jiraIssueType: target.issueType,
    category,
    escalationGroup: labels.escalation_group,
    firing,
    test: labels.test === "true",
    startsAt,
    endsAt,
    key,
    tags: [
      "grafana-alert",
      labels.priority,
      `svc-${labels.service_name}`,
      `env-${labels.deployment_environment}`,
      `alerta-${labels.alert_id.toLowerCase()}`,
      category,
      `inc-key-${key}`,
      ...(labels.escalation_group ? [`esc-${labels.escalation_group}`] : []),
      ...(labels.test === "true" ? ["teste"] : []),
    ],
    summary: annotations.summary ?? alertName,
    description: annotations.description ?? "",
    impact: annotations.impact ?? "",
    firstSteps: annotations.first_steps ?? "",
    links: buildLinks(config.grafanaUrl, alert, logWindow),
    logWindow,
    logWindowMin: config.logWindowMin,
  };
}
