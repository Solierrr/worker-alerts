import { describe, expect, it } from "vitest";
import { parseRouting, resolveTarget, serviceUrl } from "./routing";

describe("routing", () => {
  const routing = parseRouting();
  it("sends each service to its Jira project", () => {
    expect(resolveTarget(routing, "core")).toEqual({
      project: "DEV",
      issueType: "Critic",
    });
    expect(resolveTarget(routing, "ai-assistant").project).toBe("AI");
    expect(resolveTarget(routing, "feeddb").project).toBe("DB");
  });
  it("puts infrastructure in DB", () => {
    for (const service of ["kong", "cluster", "grafana", "argocd"])
      expect(resolveTarget(routing, service).project).toBe("DB");
  });
  it("has a public address for the services people use and none for the internal ones", () => {
    expect(serviceUrl(routing, "core")).toBe(
      "https://core.solarianetwork.site",
    );
    expect(serviceUrl(routing, "ai-assistant")).toBe(
      "https://assistant.solarianetwork.site",
    );
    expect(serviceUrl(routing, "web-app")).toBe("https://solarianetwork.site");
    expect(serviceUrl(routing, "google-registry")).toBeUndefined();
    expect(serviceUrl(routing, "feeddb")).toBeUndefined();
  });
  it("only accepts https addresses", () => {
    expect(() =>
      parseRouting({
        default: "DEV",
        projects: { DEV: { issueType: "Critic" } },
        services: {},
        hosts: { core: "http://core.example.test" },
      }),
    ).toThrow();
  });
  it("falls back to the default project for an unknown service", () => {
    expect(resolveTarget(routing, "not-mapped").project).toBe(routing.default);
  });
  it("rejects a table that names a project without an issue type", () => {
    expect(() =>
      parseRouting({
        default: "DEV",
        projects: { DEV: { issueType: "Critic" } },
        services: { core: "AI" },
      }),
    ).toThrow();
    expect(() =>
      parseRouting({ default: "QQ", projects: {}, services: {} }),
    ).toThrow();
  });
});
