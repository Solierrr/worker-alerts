import { describe, expect, it, vi } from "vitest";
import {
  alertsConfig,
  grafanaAlert,
  grafanaLabels,
  grafanaPayload,
} from "../../../test/support";
import { toIncident } from "../../ingest/model";
import { grafanaWebhookSchema } from "../../ingest/schema";
import { buildEmailRequest, sendAlertEmails, shouldEmail } from "./client";

const config = alertsConfig({
  ALERT_GRAFANA_URL: "https://grafana.example.test",
});
const incident = (alert = grafanaAlert()) =>
  toIncident(
    grafanaWebhookSchema.parse(grafanaPayload([alert])).alerts[0]!,
    config,
    new Date("2026-10-31T18:30:00Z"),
  );
const created = { alertId: "A03", service: "core", action: "created" as const };

describe("when an e-mail goes out", () => {
  it("follows the ticket: new ticket for a firing P1 or P2", () => {
    expect(shouldEmail(incident(), created)).toBe(true);
    expect(
      shouldEmail(incident(), { ...created, action: "skipped_interval" }),
    ).toBe(false);
    expect(
      shouldEmail(incident(), { ...created, action: "ceiling_comment" }),
    ).toBe(false);
  });
  it("sends the end only when the end was recorded", () => {
    const resolved = incident(grafanaAlert({ status: "resolved" }));
    expect(shouldEmail(resolved, { ...created, action: "end_recorded" })).toBe(
      true,
    );
    expect(
      shouldEmail(resolved, { ...created, action: "no_open_ticket" }),
    ).toBe(false);
  });
  it("leaves P3 to P5 and test alerts out", () => {
    const p3 = incident(
      grafanaAlert({ labels: grafanaLabels({ priority: "P3" }) }),
    );
    expect(shouldEmail(p3, created)).toBe(false);
    const test = incident(
      grafanaAlert({ labels: grafanaLabels({ test: "true" }) }),
    );
    expect(shouldEmail(test, created)).toBe(false);
  });
});

describe("request to the api-email", () => {
  it("builds the operational-alert contract with the fields ready", () => {
    const body = buildEmailRequest(incident(), "dev@example.com", undefined)!;
    expect(body).toMatchObject({
      template: "operational-alert",
      locale: "pt-BR",
      to: "dev@example.com",
      data: {
        alertPriority: "P1",
        alertStatus: "firing",
        serviceName: "core",
        environment: "prod",
        startedAt: "2026-10-30T16:06:30.000Z",
      },
    });
    expect(body.data.summary).toContain("respostas 5xx");
    expect(body.data).not.toHaveProperty("firstSteps");
    expect(body.data.serviceUrl).toBe("https://core.solarianetwork.site");
    expect(body.data.actionUrl).toMatch(
      /^https:\/\/grafana\.example\.test\/d\//,
    );
  });
  it("sends the end without the steps", () => {
    const body = buildEmailRequest(
      incident(
        grafanaAlert({ status: "resolved", endsAt: "2026-10-30T16:20:00Z" }),
      ),
      "dev@example.com",
      undefined,
    )!;
    expect(body.data.alertStatus).toBe("resolved");
    expect(body.data.endedAt).toBe("2026-10-30T16:20:00.000Z");
    expect(body.data).not.toHaveProperty("firstSteps");
  });
  it("leaves the link out for an internal service", () => {
    const body = buildEmailRequest(
      incident(
        grafanaAlert({
          labels: grafanaLabels({ service_name: "google-registry" }),
        }),
      ),
      "dev@example.com",
      undefined,
    )!;
    expect(body.data).not.toHaveProperty("serviceUrl");
  });
  it("flattens line breaks and clips long texts", () => {
    const body = buildEmailRequest(
      incident(
        grafanaAlert({
          annotations: {
            summary: `linha\ncom quebra ${"x".repeat(400)}`,
            impact: "a\tb",
          },
        }),
      ),
      "dev@example.com",
      undefined,
    )!;
    expect(body.data.summary).not.toMatch(/[\n\t]/);
    expect(body.data.summary.length).toBeLessThanOrEqual(300);
    expect(body.data.summary.endsWith("...")).toBe(true);
    expect(body.data.summary).not.toContain("…");
    expect(body.data.impact).toBe("a b");
  });
});

describe("sending", () => {
  const email = {
    apiUrl: "https://email.example.test",
    serviceKey: "key-for-the-tests",
    recipients: ["a@example.com", "b@example.com"],
  };
  it("posts one e-mail per recipient with the service key", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 202 }));
    const outcome = await sendAlertEmails(
      email,
      incident(),
      undefined,
      fetchFn as unknown as typeof fetch,
    );
    expect(outcome).toEqual({ sent: 2, failed: 0 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://email.example.test/emails");
    expect((init.headers as Record<string, string>)["x-service-key"]).toBe(
      "key-for-the-tests",
    );
    expect(init.redirect).toBe("manual");
  });
  it("counts failures without throwing", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockRejectedValueOnce(new TypeError("down"));
    const outcome = await sendAlertEmails(
      email,
      incident(),
      undefined,
      fetchFn as unknown as typeof fetch,
    );
    expect(outcome).toEqual({ sent: 0, failed: 2 });
  });
  it("does not leak the key in the logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await sendAlertEmails(
      email,
      incident(),
      undefined,
      vi.fn(
        async () => new Response("{}", { status: 401 }),
      ) as unknown as typeof fetch,
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("key-for-the-tests");
    log.mockRestore();
  });
});
