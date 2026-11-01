import { describe, expect, it, vi } from "vitest";
import {
  alertsConfig,
  grafanaAlert,
  grafanaPayload,
} from "../../../test/support";
import { toIncident } from "../../ingest/model";
import { grafanaWebhookSchema } from "../../ingest/schema";
import { buildTelegramText, sendTelegramAlert } from "./client";

const config = alertsConfig({
  ALERT_GRAFANA_URL: "https://grafana.example.test",
});
const incident = (alert = grafanaAlert()) =>
  toIncident(
    grafanaWebhookSchema.parse(grafanaPayload([alert])).alerts[0]!,
    config,
    new Date("2026-10-31T18:30:00Z"),
  );
const telegram = {
  botToken: "123456:token-for-the-tests",
  chatIds: ["-1001", "@canal"],
};

describe("telegram text", () => {
  it("opens with priority, service and environment and keeps the links", () => {
    const text = buildTelegramText(incident(), undefined);
    expect(text.split("\n")[0]).toBe("[ALERTA P1] api-core (prod)");
    expect(text).toContain("respostas 5xx");
    expect(text).not.toContain("core (prod): ");
    expect(text).toContain("Serviço: https://core.solarianetwork.site");
    expect(text).toMatch(/Painel: https:\/\/grafana\.example\.test\/d\//);
  });
  it("marks the end", () => {
    const text = buildTelegramText(
      incident(
        grafanaAlert({ status: "resolved", endsAt: "2026-10-30T16:20:00Z" }),
      ),
      undefined,
    );
    expect(text.startsWith("[RESOLVIDO P1]")).toBe(true);
    expect(text).toContain("Fim: 2026-10-30T16:20:00.000Z");
  });
  it("clips to the Telegram limit", () => {
    const text = buildTelegramText(
      incident(
        grafanaAlert({
          annotations: { summary: "x".repeat(4000), impact: "y".repeat(500) },
        }),
      ),
      undefined,
    );
    expect(text.length).toBe(4096);
  });
});

describe("telegram sending", () => {
  it("posts one sendMessage per chat", async () => {
    const fetchFn = vi.fn(async () => new Response('{"ok":true}'));
    const outcome = await sendTelegramAlert(
      telegram,
      incident(),
      undefined,
      fetchFn as unknown as typeof fetch,
    );
    expect(outcome).toEqual({ sent: 2, failed: 0 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://api.telegram.org/bot123456:token-for-the-tests/sendMessage",
    );
    expect(JSON.parse(init.body as string)).toMatchObject({ chat_id: "-1001" });
  });
  it("counts failures without throwing or leaking the token", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { ok: false, description: "Bad Request: chat not found" },
          { status: 400 },
        ),
      )
      .mockRejectedValueOnce(new TypeError("down"));
    const outcome = await sendTelegramAlert(
      telegram,
      incident(),
      undefined,
      fetchFn as unknown as typeof fetch,
    );
    expect(outcome).toEqual({ sent: 0, failed: 2 });
    expect(JSON.stringify(log.mock.calls)).toContain("chat not found");
    expect(JSON.stringify(log.mock.calls)).not.toContain("token-for-the-tests");
    log.mockRestore();
  });
});

describe("telegram config", () => {
  it("switches on only with a valid token and chat list", () => {
    expect(
      alertsConfig({
        TELEGRAM_BOT_TOKEN: "123456:abc_DEF-1",
        TELEGRAM_CHAT_ID: "-1001, @canal",
      }).telegram,
    ).toEqual({ botToken: "123456:abc_DEF-1", chatIds: ["-1001", "@canal"] });
    expect(
      alertsConfig({ TELEGRAM_BOT_TOKEN: "wrong", TELEGRAM_CHAT_ID: "1" })
        .telegram,
    ).toBeUndefined();
    expect(
      alertsConfig({ TELEGRAM_BOT_TOKEN: "1:a", TELEGRAM_CHAT_ID: "abc" })
        .telegram,
    ).toBeUndefined();
  });
});
