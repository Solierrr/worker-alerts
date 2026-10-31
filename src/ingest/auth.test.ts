import { describe, expect, it } from "vitest";
import { hasValidToken } from "./auth";

describe("webhook token", () => {
  const token = "a-long-random-token-for-the-tests-0123456789";
  it("accepts the matching bearer token", async () => {
    expect(await hasValidToken(`Bearer ${token}`, token)).toBe(true);
  });
  it("rejects missing, wrong and badly formed credentials", async () => {
    expect(await hasValidToken(null, token)).toBe(false);
    expect(await hasValidToken("Bearer wrong", token)).toBe(false);
    expect(await hasValidToken(token, token)).toBe(false);
    expect(await hasValidToken(`Basic ${token}`, token)).toBe(false);
  });
  it("rejects everything when no token is configured", async () => {
    expect(await hasValidToken("Bearer ", "")).toBe(false);
    expect(await hasValidToken("Bearer x", undefined)).toBe(false);
  });
});
