import { describe, expect, it } from "vitest";
import routing from "../src/routing/routing.json";
import shared from "../src/routing/routing.shared.json";
import byRepo from "./fixtures/alerts-by-repo.json";
// @ts-expect-error módulo .mjs sem tipos
import { mergeRouting } from "../scripts/routing-merge.mjs";

describe("routing snapshot", () => {
  it("is what the service files and the shared table produce", () => {
    expect(mergeRouting(routing, shared, byRepo)).toEqual(routing);
  });
  it("refuses an alias used by two services", () => {
    const clash = {
      ...byRepo,
      "api-extra": { service: "api-extra", aliases: ["core"], project: "DEV" },
    };
    expect(() => mergeRouting(routing, shared, clash)).toThrow(
      /já está em uso/,
    );
  });
  it("refuses an unknown project", () => {
    const bad = {
      "api-extra": {
        service: "api-extra",
        aliases: ["extra"],
        project: "NOPE",
      },
    };
    expect(() => mergeRouting(routing, shared, bad)).toThrow(/não existe/);
  });
});
