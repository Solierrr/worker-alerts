import { describe, expect, it, vi } from "vitest";
import { alertsConfig } from "../../test/support";
import type { Incident } from "../ingest/model";
import {
  HEARTBEAT_MAX_AGE_MS,
  PROBE_FAILURES_TO_ALERT,
  readClusterActive,
  runMonitor,
  type MonitorDeps,
  type MonitorStore,
} from "./monitor";

const MINUTE = 60_000;
const t0 = new Date("2026-10-31T18:00:00Z");

function memoryStore(): MonitorStore & { heartbeat?: number } {
  const state = new Map<string, number>();
  const store = {
    heartbeat: undefined as number | undefined,
    async lastHeartbeat() {
      return store.heartbeat;
    },
    async baseline(now: number) {
      if (!state.has("baseline")) state.set("baseline", now);
      return state.get("baseline")!;
    },
    async countProbe(name: string, ok: boolean) {
      const key = `f:${name}`;
      const failures = ok ? 0 : (state.get(key) ?? 0) + 1;
      state.set(key, failures);
      return failures;
    },
    async openedAt(key: string) {
      return state.get(`o:${key}`);
    },
    async setOpenedAt(key: string, at: number | undefined) {
      if (at === undefined) state.delete(`o:${key}`);
      else state.set(`o:${key}`, at);
    },
  };
  return store;
}

const targets = [
  { name: "core", service: "core", url: "https://core.example.test/health" },
];

function setup(overrides: Partial<MonitorDeps> = {}) {
  const store = memoryStore();
  const handled: Incident[] = [];
  let clock = t0.getTime();
  let responding = true;
  let active = true;
  const deps: MonitorDeps = {
    config: alertsConfig(),
    store,
    targets,
    handle: vi.fn(async (incident: Incident) => {
      handled.push(incident);
      return {
        alertId: incident.alertId,
        service: incident.service,
        action: "created" as const,
      };
    }),
    fetchFn: vi.fn(
      async () => new Response("", { status: responding ? 200 : 503 }),
    ) as unknown as typeof fetch,
    clusterActive: async () => active,
    now: () => new Date(clock),
    ...overrides,
  };
  return {
    store,
    handled,
    deps,
    advance: (ms: number) => {
      clock += ms;
    },
    setResponding: (value: boolean) => {
      responding = value;
    },
    setActive: (value: boolean) => {
      active = value;
    },
    run: () => runMonitor(deps),
  };
}

describe("heartbeat", () => {
  it("stays quiet while the beats keep coming", async () => {
    const m = setup();
    await m.run();
    for (let i = 0; i < 6; i++) {
      m.advance(5 * MINUTE);
      m.store.heartbeat = new Date(
        t0.getTime() + (i + 1) * 5 * MINUTE,
      ).getTime();
      const report = await m.run();
      expect(report.heartbeat).toBe("ok");
      expect(report.heartbeatAgeMin).toBe(0);
    }
    expect(m.handled).toHaveLength(0);
  });
  it("does not alert before the first beat arrives on a fresh deploy", async () => {
    const m = setup();
    await m.run();
    m.advance(HEARTBEAT_MAX_AGE_MS - MINUTE);
    expect((await m.run()).heartbeat).toBe("ok");
    expect(m.handled).toHaveLength(0);
  });
  it("opens a P1 once when the beats stop and resolves when they return", async () => {
    const m = setup();
    await m.run();
    m.advance(HEARTBEAT_MAX_AGE_MS + MINUTE);
    const lost = await m.run();
    expect(lost.heartbeat).toBe("lost");
    expect(lost.opened).toEqual(["heartbeat"]);
    expect(m.handled[0]).toMatchObject({
      alertId: "H01",
      priority: "P1",
      service: "grafana-cloud",
      firing: true,
      jiraProject: "DB",
    });
    m.advance(5 * MINUTE);
    await m.run();
    expect(m.handled).toHaveLength(1);
    m.advance(MINUTE);
    m.store.heartbeat = t0.getTime() + HEARTBEAT_MAX_AGE_MS + 7 * MINUTE;
    const back = await m.run();
    expect(back.resolved).toEqual(["heartbeat"]);
    expect(m.handled[1]).toMatchObject({ alertId: "H01", firing: false });
    expect(m.handled[1]!.startsAt.getTime()).toBe(
      m.handled[0]!.startsAt.getTime(),
    );
    expect(m.handled[1]!.key).toBe(m.handled[0]!.key);
  });
  it("keeps checking the heartbeat while the cluster is paused", async () => {
    const m = setup();
    m.setActive(false);
    await m.run();
    m.advance(HEARTBEAT_MAX_AGE_MS + MINUTE);
    expect((await m.run()).opened).toEqual(["heartbeat"]);
  });
});

describe("probe", () => {
  const beat = (m: ReturnType<typeof setup>) => {
    m.store.heartbeat = Number.MAX_SAFE_INTEGER;
  };
  it("ignores a single failure and a short blip", async () => {
    const m = setup();
    beat(m);
    m.setResponding(false);
    await m.run();
    await m.run();
    m.setResponding(true);
    await m.run();
    expect(m.handled).toHaveLength(0);
  });
  it("opens a P1 after the configured number of failures in a row, only once", async () => {
    const m = setup();
    beat(m);
    m.setResponding(false);
    for (let i = 0; i < PROBE_FAILURES_TO_ALERT + 2; i++) await m.run();
    expect(m.handled).toHaveLength(1);
    expect(m.handled[0]).toMatchObject({
      alertId: "S01",
      priority: "P1",
      service: "core",
      firing: true,
      jiraProject: "DEV",
    });
  });
  it("resolves the incident when the service answers again", async () => {
    const m = setup();
    beat(m);
    m.setResponding(false);
    for (let i = 0; i < PROBE_FAILURES_TO_ALERT; i++) await m.run();
    m.setResponding(true);
    const report = await m.run();
    expect(report.resolved).toEqual(["probe:core"]);
    expect(m.handled.at(-1)).toMatchObject({ alertId: "S01", firing: false });
  });
  it("treats a network error as a failure", async () => {
    const m = setup({
      fetchFn: vi.fn(async () => {
        throw new TypeError("network");
      }) as unknown as typeof fetch,
    });
    beat(m);
    for (let i = 0; i < PROBE_FAILURES_TO_ALERT; i++) await m.run();
    expect(m.handled).toHaveLength(1);
  });
  it("does not probe while the cluster is paused and closes what was open", async () => {
    const m = setup();
    beat(m);
    m.setResponding(false);
    for (let i = 0; i < PROBE_FAILURES_TO_ALERT; i++) await m.run();
    expect(m.handled).toHaveLength(1);
    m.setActive(false);
    const fetchFn = m.deps.fetchFn as ReturnType<typeof vi.fn>;
    fetchFn.mockClear();
    const report = await m.run();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(report.probes).toEqual([]);
    expect(report.resolved).toEqual(["probe:core"]);
    expect(m.handled.at(-1)).toMatchObject({ firing: false });
  });
});

describe("cluster state file", () => {
  const reply = (body: unknown, status = 200) =>
    vi.fn(
      async () => new Response(JSON.stringify(body), { status }),
    ) as unknown as typeof fetch;
  it("reads active false as paused", async () => {
    expect(await readClusterActive(reply({ active: false }))).toBe(false);
    expect(await readClusterActive(reply({ active: true }))).toBe(true);
  });
  it("assumes active when the file cannot be read", async () => {
    expect(await readClusterActive(reply({}, 404))).toBe(true);
    expect(await readClusterActive(reply({ unexpected: 1 }))).toBe(true);
    expect(
      await readClusterActive(
        vi.fn(async () => {
          throw new Error("down");
        }) as unknown as typeof fetch,
      ),
    ).toBe(true);
  });
});
