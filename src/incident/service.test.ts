import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  alertsConfig,
  grafanaAlert,
  grafanaLabels,
  grafanaPayload,
} from "../../test/support";
import { grafanaWebhookSchema } from "../ingest/schema";
import { toIncident } from "../ingest/model";
import type { JiraClient, JiraIssue } from "../channels/jira/client";
import { createIncidentService } from "./service";

const config = alertsConfig({
  ALERT_GRAFANA_URL: "http://localhost:3000",
  JIRA_BASE_URL: "https://example.atlassian.net",
  JIRA_USER: "grafana@example.com",
  JIRA_API_TOKEN: "jira-test-token-only",
  JIRA_FIELD_START: "customfield_10294",
  JIRA_FIELD_END: "customfield_10295",
});
const now = new Date("2026-10-30T17:00:00Z");
const minutesAgo = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000);
const issue = (key: string, ago: number, priority = "Highest"): JiraIssue => ({
  key,
  created: minutesAgo(ago),
  priority,
  summary: key,
});
const incident = (alert = grafanaAlert()) =>
  toIncident(
    grafanaWebhookSchema.parse(grafanaPayload([alert])).alerts[0]!,
    config,
    now,
  );

let jira: { [K in keyof JiraClient]: ReturnType<typeof vi.fn> };
let history: JiraIssue[];
let related: JiraIssue[];
let open: JiraIssue[];
const service = () =>
  createIncidentService(jira as unknown as JiraClient, config, () => now);

beforeEach(() => {
  history = [];
  related = [];
  open = [];
  jira = {
    search: vi.fn(async (jql: string) =>
      jql.includes("is EMPTY")
        ? open
        : jql.includes('labels = "esc-')
          ? related
          : history,
    ),
    create: vi.fn().mockResolvedValue({ key: "INC-20" }),
    setEnd: vi.fn().mockResolvedValue(undefined),
    comment: vi.fn().mockResolvedValue(undefined),
    link: vi.fn().mockResolvedValue(undefined),
  };
});

describe("firing alert", () => {
  it("creates the first ticket with priority, tags and start", async () => {
    const result = await service().handle(incident());
    expect(result).toEqual({
      alertId: "A03",
      service: "core",
      action: "created",
      issueKey: "INC-20",
    });
    const created = jira.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(created).toMatchObject({
      summary: "[P1] core (prod): 7.1 % de respostas 5xx há 10 min",
      priority: "Highest",
      startsAt: new Date("2026-10-30T16:06:30Z"),
    });
    expect(created.labels).toContain(`inc-key-${incident().key}`);
    expect(jira.link).not.toHaveBeenCalled();
    const jql = jira.search.mock.calls[0]![0] as string;
    expect(jql).toContain('project = "INC"');
    expect(jql).toContain(`labels = "inc-key-${incident().key}"`);
    expect(jql).toContain("ORDER BY created DESC");
  });
  it("does not create another ticket inside the 30 minute interval", async () => {
    history = [issue("INC-5", 10)];
    expect(await service().handle(incident())).toMatchObject({
      action: "skipped_interval",
      issueKey: "INC-5",
    });
    expect(jira.create).not.toHaveBeenCalled();
  });
  it("creates a new ticket after 30 minutes even if the old one is open, and links them", async () => {
    history = [issue("INC-5", 35), issue("INC-3", 300)];
    const result = await service().handle(incident());
    expect(result).toMatchObject({ action: "created", issueKey: "INC-20" });
    expect(jira.link).toHaveBeenCalledWith("INC-20", "INC-5");
    const description = JSON.stringify(
      (jira.create.mock.calls[0]![0] as { description: unknown }).description,
    );
    expect(description).toContain("Ocorrência nº 3");
  });
  it("stops at the 24 hour ceiling and comments on the last ticket", async () => {
    history = Array.from({ length: 8 }, (_, index) =>
      issue(`INC-${index + 1}`, 40 + index * 60),
    );
    expect(await service().handle(incident())).toMatchObject({
      action: "ceiling_comment",
      issueKey: "INC-1",
    });
    expect(jira.create).not.toHaveBeenCalled();
    expect(jira.comment).toHaveBeenCalledWith("INC-1", expect.anything());
  });
  it("counts only the last 24 hours against the ceiling", async () => {
    history = [
      ...Array.from({ length: 7 }, (_, index) =>
        issue(`INC-${index + 1}`, 40 + index * 60),
      ),
      issue("INC-0", 3000),
    ];
    expect((await service().handle(incident())).action).toBe("created");
  });
  it("links the escalation and comments on both tickets", async () => {
    related = [issue("INC-9", 20, "High")];
    const result = await service().handle(incident());
    expect(result.action).toBe("created");
    expect(jira.link).toHaveBeenCalledWith("INC-20", "INC-9");
    expect(jira.comment).toHaveBeenCalledWith("INC-9", expect.anything());
    expect(jira.comment).toHaveBeenCalledWith("INC-20", expect.anything());
    const jql = jira.search.mock.calls
      .map(([query]) => query as string)
      .find((query) => query.includes("esc-erro-5xx"))!;
    expect(jql).toContain('labels = "svc-core"');
    expect(jql).toContain('labels = "env-prod"');
    expect(jql).toContain(`labels != "inc-key-${incident().key}"`);
  });
  it("links an escalation ticket only once when it is also the previous ticket", async () => {
    history = [issue("INC-9", 40)];
    related = [issue("INC-9", 40)];
    await service().handle(incident());
    expect(
      jira.link.mock.calls.filter(([, other]) => other === "INC-9"),
    ).toHaveLength(1);
  });
  it("skips alerts without an escalation group in the escalation search", async () => {
    const alert = grafanaAlert({
      labels: Object.fromEntries(
        Object.entries(grafanaLabels({ alert_id: "A10" })).filter(
          ([name]) => name !== "escalation_group",
        ),
      ),
    });
    await service().handle(incident(alert));
    expect(
      jira.search.mock.calls.some(([query]) => String(query).includes("esc-")),
    ).toBe(false);
  });
  it("keeps the created ticket when linking or commenting fails", async () => {
    related = [issue("INC-9", 20)];
    history = [issue("INC-5", 40)];
    jira.link.mockRejectedValue(new Error("down"));
    jira.comment.mockRejectedValue(new Error("down"));
    const result = await service().handle(incident());
    expect(result).toMatchObject({ action: "created", issueKey: "INC-20" });
    expect(result.warnings).toEqual(["link_failed", "comment_failed"]);
  });
  it("fails when the ticket cannot be created", async () => {
    jira.create.mockRejectedValue(new Error("down"));
    await expect(service().handle(incident())).rejects.toThrow("down");
  });
  it("ignores environments other than the configured one", async () => {
    const result = await service().handle(
      incident(
        grafanaAlert({
          labels: grafanaLabels({ deployment_environment: "qa" }),
        }),
      ),
    );
    expect(result.action).toBe("ignored_env");
    expect(jira.search).not.toHaveBeenCalled();
  });
});

describe("resolved alert", () => {
  const resolved = () =>
    incident(
      grafanaAlert({ status: "resolved", endsAt: "2026-10-30T16:20:00Z" }),
    );
  it("records the end and comments on every open ticket without changing status", async () => {
    open = [issue("INC-5", 20), issue("INC-4", 70)];
    const result = await service().handle(resolved());
    expect(result).toMatchObject({
      action: "end_recorded",
      issueKey: "INC-5",
      issueKeys: ["INC-5", "INC-4"],
    });
    expect(jira.setEnd).toHaveBeenCalledWith(
      "INC-5",
      new Date("2026-10-30T16:20:00Z"),
    );
    expect(jira.setEnd).toHaveBeenCalledWith(
      "INC-4",
      new Date("2026-10-30T16:20:00Z"),
    );
    expect(jira.comment).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(jira.comment.mock.calls[0])).toContain("14 min");
    expect(jira.search.mock.calls[0]![0]).toContain("cf[10295] is EMPTY");
    expect(jira.create).not.toHaveBeenCalled();
  });
  it("does nothing when there is no ticket waiting for an end", async () => {
    expect((await service().handle(resolved())).action).toBe("no_open_ticket");
    expect(jira.setEnd).not.toHaveBeenCalled();
  });
  it("uses the current time when Grafana sends no valid end", async () => {
    open = [issue("INC-5", 20)];
    await service().handle(incident(grafanaAlert({ status: "resolved" })));
    expect(jira.setEnd).toHaveBeenCalledWith("INC-5", now);
  });
});
