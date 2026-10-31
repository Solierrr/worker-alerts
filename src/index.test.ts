import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { grafanaAlert, grafanaPayload } from "../test/support";
import { createApp, type HandleIncident } from "./index";

const headers = {
  authorization: `Bearer ${env.WEBHOOK_TOKEN}`,
  "content-type": "application/json",
};
const post = (
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  init: RequestInit = {},
  bindings: Env = env,
) =>
  app.request(
    path,
    {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
      ...init,
    },
    bindings,
  );

describe("health", () => {
  it("answers without credentials", async () => {
    const response = await createApp().request("/health", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});

describe("webhook guards", () => {
  const app = createApp(vi.fn());
  it("refuses a missing or wrong token", async () => {
    for (const authorization of [undefined, "Bearer wrong"]) {
      const response = await post(app, "/grafana", grafanaPayload(), {
        headers: {
          "content-type": "application/json",
          ...(authorization ? { authorization } : {}),
        },
      });
      expect(response.status).toBe(401);
    }
  });
  it("refuses a body over 256 KiB", async () => {
    const response = await post(
      app,
      "/grafana",
      JSON.stringify({ padding: "x".repeat(300 * 1024) }),
    );
    expect(response.status).toBe(413);
  });
  it("refuses bodies that are not JSON or not valid", async () => {
    const plain = await post(app, "/grafana", "x", {
      headers: { ...headers, "content-type": "text/plain" },
    });
    expect(plain.status).toBe(415);
    expect((await post(app, "/grafana", "{not json")).status).toBe(422);
    const invalid = await post(app, "/grafana", { alerts: [] });
    expect(invalid.status).toBe(422);
    expect(((await invalid.json()) as { code: string }).code).toBe(
      "VALIDATION_FAILED",
    );
  });
});

describe("webhook", () => {
  it("hands every incident to the coordinator and returns the results", async () => {
    const handle = vi.fn<HandleIncident>(async (_env, incident) => ({
      alertId: incident.alertId,
      service: incident.service,
      action: "created",
      issueKey: "INC-1",
    }));
    const response = await post(
      createApp(handle),
      "/grafana",
      grafanaPayload(),
    );
    expect(response.status).toBe(200);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0]![1].key).toMatch(/^[0-9a-f]{12}$/);
    expect(await response.json()).toEqual({
      results: [
        {
          alertId: "A03",
          service: "core",
          action: "created",
          issueKey: "INC-1",
        },
      ],
    });
  });
  it("answers 503 so the Grafana retries when the Jira call fails", async () => {
    const handle: HandleIncident = async () => {
      throw Object.assign(new Error("Jira"), {
        operation: "search",
        status: 500,
      });
    };
    const response = await post(
      createApp(handle),
      "/grafana",
      grafanaPayload(),
    );
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe(
      "JIRA_REQUEST_FAILED",
    );
  });
  it("answers CHANNEL_NOT_CONFIGURED when the Jira variables are missing", async () => {
    const bare = { ...env, JIRA_API_TOKEN: "" } as Env;
    const response = await post(
      createApp(vi.fn()),
      "/grafana",
      grafanaPayload(),
      {},
      bare,
    );
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe(
      "CHANNEL_NOT_CONFIGURED",
    );
  });
});

describe("preview", () => {
  const preview = async (alert: Record<string, unknown>) => {
    const response = await post(
      createApp(vi.fn()),
      "/grafana/preview",
      grafanaPayload([alert]),
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { tickets: Record<string, unknown>[] })
      .tickets[0]!;
  };
  it("shows the ticket that would be created, without contacting Jira", async () => {
    const ticket = await preview(grafanaAlert());
    expect(ticket).toMatchObject({
      action: "would_create",
      priority: "Highest",
    });
    expect(String(ticket.summary)).toMatch(/^\[P1\]/);
  });
  it("marks test alerts and skips other environments and resolutions", async () => {
    const labels = { ...grafanaAlert().labels, test: "true" };
    const test = await preview(grafanaAlert({ labels }));
    expect(String(test.summary)).toMatch(/^\[TESTE\] \[P1\]/);
    expect(test.labels).toContain("teste");
    const otherEnv = await preview(
      grafanaAlert({
        labels: { ...grafanaAlert().labels, deployment_environment: "dev" },
      }),
    );
    expect(otherEnv.action).toBe("ignored_env");
    const resolved = await preview(grafanaAlert({ status: "resolved" }));
    expect(resolved.action).toBe("would_record_end");
  });
});

describe("heartbeat and monitor", () => {
  const monitor = (paused = false) => ({
    heartbeat: vi.fn(async () => undefined),
    pausedRecently: vi.fn(async () => paused),
    run: vi.fn(async () => ({
      heartbeat: "ok" as const,
      heartbeatAgeMin: 0,
      clusterActive: true,
      probes: [],
      opened: [],
      resolved: [],
    })),
  });
  it("records a beat only with the token", async () => {
    const api = monitor();
    const app = createApp(vi.fn(), api);
    const refused = await app.request("/heartbeat", { method: "POST" }, env);
    expect(refused.status).toBe(401);
    expect(api.heartbeat).not.toHaveBeenCalled();
    const accepted = await post(app, "/heartbeat", {});
    expect(accepted.status).toBe(200);
    expect(api.heartbeat).toHaveBeenCalledTimes(1);
  });
  it("runs the monitor on demand only with the token", async () => {
    const api = monitor();
    const app = createApp(vi.fn(), api);
    expect(
      (await app.request("/monitor/run", { method: "POST" }, env)).status,
    ).toBe(401);
    const response = await post(app, "/monitor/run", {});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ heartbeat: "ok" });
    expect(api.run).toHaveBeenCalledTimes(1);
  });
});

describe("silence on pause", () => {
  const silenced = (patch: Record<string, unknown> = {}) =>
    grafanaAlert({
      labels: {
        ...grafanaAlert().labels,
        alert_id: "A01",
        silence_on_pause: "true",
      },
      ...patch,
    });
  const api = (paused: boolean) => ({
    heartbeat: vi.fn(async () => undefined),
    run: vi.fn(),
    pausedRecently: vi.fn(async () => paused),
  });
  const handled = () =>
    vi.fn<HandleIncident>(async (_env, incident) => ({
      alertId: incident.alertId,
      service: incident.service,
      action: "created",
      issueKey: "DEV-1",
    }));

  it("does not open a ticket for a silenced alert while the cluster is paused", async () => {
    const handle = handled();
    const monitor = api(true);
    const response = await post(
      createApp(handle, monitor as never),
      "/grafana",
      grafanaPayload([silenced()]),
    );
    expect(response.status).toBe(200);
    expect(handle).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      results: [{ alertId: "A01", service: "core", action: "skipped_pause" }],
    });
  });
  it("opens the ticket when the cluster is not paused", async () => {
    const handle = handled();
    await post(
      createApp(handle, api(false) as never),
      "/grafana",
      grafanaPayload([silenced()]),
    );
    expect(handle).toHaveBeenCalledTimes(1);
  });
  it("still processes the resolved of a silenced alert while paused", async () => {
    const handle = handled();
    await post(
      createApp(handle, api(true) as never),
      "/grafana",
      grafanaPayload([silenced({ status: "resolved" })]),
    );
    expect(handle).toHaveBeenCalledTimes(1);
  });
  it("never silences an alert without the label and does not even ask", async () => {
    const handle = handled();
    const monitor = api(true);
    await post(
      createApp(handle, monitor as never),
      "/grafana",
      grafanaPayload([grafanaAlert()]),
    );
    expect(handle).toHaveBeenCalledTimes(1);
    expect(monitor.pausedRecently).not.toHaveBeenCalled();
  });
  it("silences only the marked alerts of a mixed group", async () => {
    const handle = handled();
    const response = await post(
      createApp(handle, api(true) as never),
      "/grafana",
      grafanaPayload([silenced(), grafanaAlert()]),
    );
    expect(handle).toHaveBeenCalledTimes(1);
    const body = (await response.json()) as { results: { action: string }[] };
    expect(body.results.map((r) => r.action).sort()).toEqual([
      "created",
      "skipped_pause",
    ]);
  });
});

describe("e-mail after the ticket", () => {
  const emailEnv = {
    ...env,
    EMAIL_API_URL: "https://email.example.test",
    EMAIL_SERVICE_KEY: "key",
    ALERT_EMAIL_TO: "dev@example.com",
  } as Env;
  const created = vi.fn<HandleIncident>(async (_env, incident) => ({
    alertId: incident.alertId,
    service: incident.service,
    action: "created",
    issueKey: "DEV-1",
  }));
  const idle = {
    heartbeat: vi.fn(),
    run: vi.fn(),
    pausedRecently: vi.fn(async () => false),
  };

  it("delivers the e-mail for a new P1 ticket and reports it", async () => {
    const deliver = vi.fn(async () => ({ sent: 1, failed: 0 }));
    const response = await post(
      createApp(created, idle as never, deliver),
      "/grafana",
      grafanaPayload(),
      {},
      emailEnv,
    );
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({
      email: { sent: 1, failed: 0 },
    });
  });
  it("does not deliver when no ticket was created", async () => {
    const deliver = vi.fn(async () => ({ sent: 1, failed: 0 }));
    const skipped = vi.fn<HandleIncident>(async (_env, incident) => ({
      alertId: incident.alertId,
      service: incident.service,
      action: "skipped_interval",
    }));
    await post(
      createApp(skipped, idle as never, deliver),
      "/grafana",
      grafanaPayload(),
      {},
      emailEnv,
    );
    expect(deliver).not.toHaveBeenCalled();
  });
  it("keeps the ticket answer when the e-mail fails", async () => {
    const deliver = vi.fn(async () => {
      throw new Error("boom");
    });
    const response = await post(
      createApp(created, idle as never, deliver),
      "/grafana",
      grafanaPayload(),
      {},
      emailEnv,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      results: [{ action: "created" }],
      email: { sent: 0, failed: 1 },
    });
  });
  it("is silent about e-mail when the channel is not configured", async () => {
    const deliver = vi.fn();
    const response = await post(
      createApp(created, idle as never, deliver),
      "/grafana",
      grafanaPayload(),
    );
    expect(deliver).not.toHaveBeenCalled();
    expect(await response.json()).not.toHaveProperty("email");
  });
});
