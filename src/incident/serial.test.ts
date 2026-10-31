import { describe, expect, it } from "vitest";
import { serialQueue } from "./serial";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("serial queue", () => {
  it("never overlaps two tasks and keeps the call order", async () => {
    const run = serialQueue();
    const events: string[] = [];
    const task = (name: string, ms: number) => async () => {
      events.push(`start ${name}`);
      await pause(ms);
      events.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([
      run(task("a", 20)),
      run(task("b", 1)),
      run(task("c", 1)),
    ]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(events).toEqual([
      "start a",
      "end a",
      "start b",
      "end b",
      "start c",
      "end c",
    ]);
  });
  it("keeps going after a task fails", async () => {
    const run = serialQueue();
    const failed = run(async () => {
      throw new Error("boom");
    });
    const next = run(async () => "ok");
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });
});
