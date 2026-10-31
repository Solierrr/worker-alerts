import {
  ceilingComment,
  closingComment,
  relatedComment,
  ticketDescription,
  ticketSummary,
} from "./content";
import type { JiraClient } from "../channels/jira/client";
import type { AlertsConfig } from "../config";
import type { Incident } from "../ingest/model";

export type IncidentAction =
  | "created"
  | "skipped_interval"
  | "ceiling_comment"
  | "ignored_env"
  | "skipped_pause"
  | "end_recorded"
  | "no_open_ticket";

export interface IncidentResult {
  alertId: string;
  service: string;
  action: IncidentAction;
  issueKey?: string;
  issueKeys?: string[];
  warnings?: string[];
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const HISTORY_DAYS = 30;
const HISTORY_LIMIT = 100;
export const RESOLVED_LABEL = "inc-resolvido";

export function createIncidentService(
  jira: JiraClient,
  config: AlertsConfig,
  clock: () => Date = () => new Date(),
) {
  const settings = config.jira;
  if (!settings) throw new Error("Jira is not configured");
  const label = (value: string) => `labels = "${value}"`;

  async function onFiring(incident: Incident): Promise<IncidentResult> {
    const now = clock();
    const project = `project = "${incident.jiraProject}"`;
    const base = { alertId: incident.alertId, service: incident.service };
    const history = await jira.search(
      `${project} AND ${label(`inc-key-${incident.key}`)} AND created >= -${HISTORY_DAYS}d ORDER BY created DESC`,
      HISTORY_LIMIT,
    );
    const last = history[0];
    if (
      last &&
      now.getTime() - last.created.getTime() < config.minIntervalMin * MINUTE
    )
      return { ...base, action: "skipped_interval", issueKey: last.key };

    const last24h = history.filter(
      (issue) => now.getTime() - issue.created.getTime() < DAY,
    );
    if (last && last24h.length >= config.maxPer24h) {
      await jira.comment(
        last.key,
        ceilingComment(incident, config.maxPer24h, now),
      );
      return { ...base, action: "ceiling_comment", issueKey: last.key };
    }

    const { key } = await jira.create({
      project: incident.jiraProject,
      issueType: incident.jiraIssueType,
      summary: ticketSummary(incident),
      description: ticketDescription(incident, {
        occurrence: history.length + 1,
        firstAt: history.at(-1)?.created,
      }),
      priority: incident.jiraPriority,
      labels: incident.tags,
    });

    const warnings = new Set<string>();
    const attempt = async (warning: string, action: () => Promise<void>) => {
      try {
        await action();
      } catch {
        warnings.add(warning);
      }
    };
    const relatedKeys = new Set<string>();
    if (last) relatedKeys.add(last.key);
    let peer: { key: string; priority: string } | undefined;
    if (incident.escalationGroup) {
      let escalation: Awaited<ReturnType<JiraClient["search"]>> = [];
      try {
        escalation = await jira.search(
          `${project} AND ${label(`esc-${incident.escalationGroup}`)} AND ${label(`svc-${incident.service}`)} AND ${label(`env-${incident.environment}`)} AND labels != "inc-key-${incident.key}" AND created >= -24h ORDER BY created DESC`,
          1,
        );
      } catch {
        warnings.add("escalation_lookup_failed");
      }
      const other = escalation[0];
      if (other && !relatedKeys.has(other.key)) {
        relatedKeys.add(other.key);
        peer = other;
      }
    }
    for (const related of relatedKeys)
      await attempt("link_failed", () => jira.link(key, related));
    if (peer) {
      const other = peer;
      await attempt("comment_failed", () =>
        jira.comment(
          other.key,
          relatedComment(
            `Novo ticket do mesmo problema em outro nível de alerta: ${key} (${incident.priority}).`,
          ),
        ),
      );
      await attempt("comment_failed", () =>
        jira.comment(
          key,
          relatedComment(
            `Ticket do mesmo problema em outro nível de alerta: ${other.key} (${other.priority}).`,
          ),
        ),
      );
    }

    return {
      ...base,
      action: "created",
      issueKey: key,
      ...(warnings.size ? { warnings: [...warnings] } : {}),
    };
  }

  async function onResolved(incident: Incident): Promise<IncidentResult> {
    const project = `project = "${incident.jiraProject}"`;
    const base = { alertId: incident.alertId, service: incident.service };
    const open = await jira.search(
      `${project} AND ${label(`inc-key-${incident.key}`)} AND labels != "${RESOLVED_LABEL}" AND created >= -${HISTORY_DAYS}d ORDER BY created DESC`,
      50,
    );
    if (!open.length) return { ...base, action: "no_open_ticket" };
    const endsAt = incident.endsAt ?? clock();
    for (const issue of open) {
      // Only the end is recorded (label and comment): closing the ticket stays a human decision
      await jira.addLabel(issue.key, RESOLVED_LABEL);
      await jira.comment(issue.key, closingComment(incident, endsAt));
    }
    return {
      ...base,
      action: "end_recorded",
      issueKey: open[0]!.key,
      issueKeys: open.map((issue) => issue.key),
    };
  }

  return {
    async handle(incident: Incident): Promise<IncidentResult> {
      if (incident.environment !== config.environment)
        return {
          alertId: incident.alertId,
          service: incident.service,
          action: "ignored_env",
        };
      return incident.firing ? onFiring(incident) : onResolved(incident);
    },
  };
}
