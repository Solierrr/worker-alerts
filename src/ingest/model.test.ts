import { describe, expect, it } from "vitest";
import {
  alertsConfig,
  grafanaAlert,
  grafanaLabels,
  grafanaPayload,
} from "../../test/support";
import { grafanaWebhookSchema } from "./schema";
import { jiraPriorities, toIncident } from "./model";

const grafana = alertsConfig({ ALERT_GRAFANA_URL: "http://localhost:3000/" });
const bare = alertsConfig();
const now = new Date("2026-10-30T17:00:00Z");
const parse = (alert = grafanaAlert()) =>
  grafanaWebhookSchema.parse(grafanaPayload([alert])).alerts[0]!;

describe("Grafana webhook schema", () => {
  it("accepts the real payload shape and ignores unknown fields", () => {
    const parsed = grafanaWebhookSchema.safeParse(grafanaPayload());
    expect(parsed.success).toBe(true);
  });
  it("requires the labels that the alert rules carry", () => {
    for (const missing of [
      "alert_id",
      "priority",
      "service_name",
      "deployment_environment",
    ]) {
      const labels: Record<string, string> = grafanaLabels({});
      delete labels[missing];
      const result = grafanaWebhookSchema.safeParse(
        grafanaPayload([grafanaAlert({ labels })]),
      );
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain(missing);
    }
  });
  it("rejects unknown priorities, empty and oversized groups", () => {
    const bad = grafanaLabels({ priority: "P9" });
    expect(
      grafanaWebhookSchema.safeParse(
        grafanaPayload([grafanaAlert({ labels: bad })]),
      ).success,
    ).toBe(false);
    expect(grafanaWebhookSchema.safeParse(grafanaPayload([])).success).toBe(
      false,
    );
    expect(
      grafanaWebhookSchema.safeParse(
        grafanaPayload(Array.from({ length: 51 }, () => grafanaAlert())),
      ).success,
    ).toBe(false);
  });
  it("rejects service and environment values that could break a query", () => {
    for (const labels of [
      grafanaLabels({ service_name: 'core"} or {x="' }),
      grafanaLabels({ deployment_environment: "prod\nx" }),
    ])
      expect(
        grafanaWebhookSchema.safeParse(
          grafanaPayload([grafanaAlert({ labels })]),
        ).success,
      ).toBe(false);
  });
});

describe("incident model", () => {
  it("maps P1 to P5 to the Jira priority names", () => {
    expect(jiraPriorities).toEqual({
      P1: "Highest",
      P2: "High",
      P3: "Medium",
      P4: "Low",
      P5: "Lowest",
    });
    expect(toIncident(parse(), grafana, now).jiraPriority).toBe("Highest");
  });
  it("derives a stable key per alert, service and environment", () => {
    const base = toIncident(parse(), grafana, now);
    expect(base.key).toMatch(/^[0-9a-f]{12}$/);
    expect(toIncident(parse(), grafana, now).key).toBe(base.key);
    const other = (patch: Record<string, string>) =>
      toIncident(
        parse(grafanaAlert({ labels: grafanaLabels(patch) })),
        grafana,
        now,
      ).key;
    expect(other({ service_name: "auth" })).not.toBe(base.key);
    expect(other({ alert_id: "A02" })).not.toBe(base.key);
    expect(other({ deployment_environment: "qa" })).not.toBe(base.key);
    expect(other({ priority: "P2" })).toBe(base.key);
  });
  it("builds the Jira tags", () => {
    expect(toIncident(parse(), grafana, now).tags).toEqual([
      "grafana-alert",
      "P1",
      "svc-core",
      "env-prod",
      "alerta-a03",
      "erros",
      `inc-key-${toIncident(parse(), grafana, now).key}`,
      "esc-erro-5xx",
    ]);
  });
  it("reads firing and resolved alerts and the zero end date", () => {
    const firing = toIncident(parse(), grafana, now);
    expect(firing.firing).toBe(true);
    expect(firing.endsAt).toBeUndefined();
    expect(firing.startsAt.toISOString()).toBe("2026-10-30T16:06:30.000Z");
    const resolved = toIncident(
      parse(
        grafanaAlert({ status: "resolved", endsAt: "2026-10-30T16:20:00Z" }),
      ),
      grafana,
      now,
    );
    expect(resolved.firing).toBe(false);
    expect(resolved.endsAt?.toISOString()).toBe("2026-10-30T16:20:00.000Z");
  });
  it("only links to the configured Grafana, never to payload URLs", () => {
    const links = toIncident(parse(), grafana, now).links;
    expect(links.dashboard).toBe(
      "http://localhost:3000/d/solier-servico-java?var-service=core&var-environment=prod",
    );
    expect(links.logs).toMatch(/^http:\/\/localhost:3000\/explore\?/);
    expect(links.traces).toMatch(/^http:\/\/localhost:3000\/explore\?/);
    const evil = (path: string) =>
      toIncident(
        parse(
          grafanaAlert({
            annotations: { ...grafanaAlert().annotations, dashboard: path },
          }),
        ),
        grafana,
        now,
      ).links.dashboard;
    for (const path of [
      "https://evil.example/d/x",
      "//evil.example/d/x",
      "/admin/users",
      "/d/x?a=<script>",
    ])
      expect(evil(path)).toBe(
        "http://localhost:3000/d/solier-saude-geral?var-environment=prod",
      );
    expect(toIncident(parse(), bare, now).links).toEqual({});
  });
  it("opens the log window 30 minutes before and after the alert", () => {
    const firing = toIncident(parse(), grafana, now);
    expect(firing.logWindow.from.toISOString()).toBe(
      "2026-10-30T15:36:30.000Z",
    );
    expect(firing.logWindow.to.toISOString()).toBe("2026-10-30T17:30:00.000Z");
    const resolved = toIncident(
      parse(
        grafanaAlert({ status: "resolved", endsAt: "2026-10-30T16:20:00Z" }),
      ),
      grafana,
      now,
    );
    expect(resolved.logWindow.to.toISOString()).toBe(
      "2026-10-30T16:50:00.000Z",
    );
    const range = new URL(firing.links.logs!).searchParams.get("panes");
    expect(JSON.parse(range!).a.range).toEqual({
      from: String(Date.parse("2026-10-30T15:36:30Z")),
      to: String(Date.parse("2026-10-30T17:30:00Z")),
    });
  });
});
