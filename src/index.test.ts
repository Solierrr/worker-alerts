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
