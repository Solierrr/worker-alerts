import { describe, expect, it } from "vitest";
import { parseRouting, resolveTarget } from "./routing";

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
