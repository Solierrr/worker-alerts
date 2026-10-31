import { describe, expect, it, vi } from "vitest";
import { alertsConfig } from "../../../test/support";
import { adfDoc, paragraph, text } from "./adf";
import { createJiraClient, JiraRequestError } from "./client";

const { jira } = alertsConfig({
  JIRA_BASE_URL: "https://example.atlassian.net",
  JIRA_USER: "grafana@example.com",
  JIRA_API_TOKEN: "jira-test-token-only",
});
if (!jira) throw new Error("Jira config expected");

const reply = (status: number, body: unknown = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const call = (fetchFn: ReturnType<typeof vi.fn>, index = 0) => {
  const [url, init] = fetchFn.mock.calls[index] as [string, RequestInit];
  return {
    url,
    init,
    body: init.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    headers: init.headers as Record<string, string>,
  };
};

describe("Jira client", () => {
  it("searches with JQL and basic auth, and never follows redirects", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      reply(200, {
        issues: [
          {
            key: "INC-7",
            fields: {
              created: "2026-10-30T13:15:32.751-0300",
              priority: { name: "High" },
              summary: "[P2] core",
            },
          },
        ],
      }),
    );
    const issues = await createJiraClient(jira, fetchFn).search(
      'project = "INC"',
      50,
    );
    const request = call(fetchFn);
    expect(request.url).toBe(
      "https://example.atlassian.net/rest/api/3/search/jql",
    );
    expect(request.init.method).toBe("POST");
    expect(request.init.redirect).toBe("manual");
    expect(request.init.signal).toBeInstanceOf(AbortSignal);
    expect(request.headers.authorization).toBe(
      `Basic ${btoa("grafana@example.com:jira-test-token-only")}`,
    );
    expect(request.body).toMatchObject({
      jql: 'project = "INC"',
      maxResults: 50,
    });
    expect(issues).toEqual([
      {
        key: "INC-7",
        created: new Date("2026-10-30T16:15:32.751Z"),
        priority: "High",
        summary: "[P2] core",
      },
    ]);
  });
  it("treats a redirect as a failure instead of following it", async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply(302));
    await expect(
      createJiraClient(jira, fetchFn).search('project = "INC"', 1),
    ).rejects.toMatchObject({ operation: "search", status: 302 });
  });
  it("creates an incident in the given project and issue type", async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply(201, { key: "INC-8" }));
    const description = adfDoc(paragraph(text("corpo")));
    const result = await createJiraClient(jira, fetchFn).create({
      project: "DEV",
      issueType: "Critic",
      summary: "[P1] core",
      description,
      priority: "Highest",
      labels: ["grafana-alert", "P1"],
    });
    expect(result).toEqual({ key: "INC-8" });
    expect(call(fetchFn).url).toBe(
      "https://example.atlassian.net/rest/api/3/issue",
    );
    expect(call(fetchFn).body).toEqual({
      fields: {
        project: { key: "DEV" },
        issuetype: { name: "Critic" },
        summary: "[P1] core",
        description,
        priority: { name: "Highest" },
        labels: ["grafana-alert", "P1"],
      },
    });
  });
  it("labels the end, comments and links without changing the status", async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply(204));
    const client = createJiraClient(jira, fetchFn);
    await client.addLabel("INC-8", "inc-resolvido");
    await client.comment("INC-8", adfDoc(paragraph(text("ok"))));
    await client.link("INC-9", "INC-8");
    expect(call(fetchFn, 0)).toMatchObject({
      url: "https://example.atlassian.net/rest/api/3/issue/INC-8",
      body: { update: { labels: [{ add: "inc-resolvido" }] } },
    });
    expect(call(fetchFn, 0).init.method).toBe("PUT");
    expect(call(fetchFn, 1).url).toMatch(/\/issue\/INC-8\/comment$/);
    expect(call(fetchFn, 2)).toMatchObject({
      url: "https://example.atlassian.net/rest/api/3/issueLink",
      body: {
        type: { name: "Relates" },
        inwardIssue: { key: "INC-9" },
        outwardIssue: { key: "INC-8" },
      },
    });
    for (const [url] of fetchFn.mock.calls as [string][])
      expect(url).not.toContain("transitions");
  });
  it("reports failures by status without leaking credentials or bodies", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(reply(429, { errorMessages: ["secret detail"] }));
    const failure = await createJiraClient(jira, fetchFn)
      .search("x", 1)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(JiraRequestError);
    expect(failure).toMatchObject({ status: 429, operation: "search" });
    expect(String((failure as Error).message)).not.toMatch(
      /secret|token|grafana@/,
    );
  });
  it("rejects malformed answers", async () => {
    const client = createJiraClient(
      jira,
      vi.fn().mockResolvedValue(reply(201, { nothing: true })),
    );
    await expect(
      client.create({
        project: "DEV",
        issueType: "Critic",
        summary: "x",
        description: adfDoc(paragraph(text("x"))),
        priority: "High",
        labels: [],
      }),
    ).rejects.toBeInstanceOf(JiraRequestError);
  });
});
