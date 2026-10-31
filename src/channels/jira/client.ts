import { z } from "zod";
import type { JiraConfig } from "../../config";
import type { AdfDoc } from "./adf";

export interface JiraIssue {
  key: string;
  created: Date;
  priority: string;
  summary: string;
}
export interface NewIncident {
  project: string;
  issueType: string;
  summary: string;
  description: AdfDoc;
  priority: string;
  labels: string[];
}
export interface JiraClient {
  search(jql: string, maxResults: number): Promise<JiraIssue[]>;
  create(incident: NewIncident): Promise<{ key: string }>;
  addLabel(key: string, label: string): Promise<void>;
  comment(key: string, body: AdfDoc): Promise<void>;
  link(inwardKey: string, outwardKey: string): Promise<void>;
}

export class JiraRequestError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    reason = "request failed",
  ) {
    super(`Jira ${operation} failed (${status}): ${reason}`);
  }
}

const searchSchema = z.object({
  issues: z.array(
    z.object({
      key: z.string(),
      fields: z.object({
        created: z.string(),
        priority: z.object({ name: z.string() }).nullish(),
        summary: z.string().nullish(),
      }),
    }),
  ),
});
const createdSchema = z.object({ key: z.string().min(1) });

const parseJiraDate = (value: string) =>
  new Date(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));

export function createJiraClient(
  config: JiraConfig,
  fetchFn: typeof fetch = fetch,
): JiraClient {
  const authorization = `Basic ${btoa(`${config.user}:${config.apiToken}`)}`;

  async function request(
    operation: string,
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchFn(`${config.baseUrl}/rest/api/3${path}`, {
        method,
        headers: {
          authorization,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
        redirect: "manual",
      });
    } catch (error) {
      // Só o nome do erro de rede: a mensagem pode trazer a URL, e o corpo e as credenciais nunca saem daqui
      const name = error instanceof Error ? error.name : "unknown";
      throw new JiraRequestError(
        operation,
        0,
        `network error or timeout (${name})`,
      );
    }
    if (!response.ok) throw new JiraRequestError(operation, response.status);
    if (response.status === 204) return undefined;
    return response.json().catch(() => {
      throw new JiraRequestError(
        operation,
        response.status,
        "invalid response",
      );
    });
  }

  return {
    async search(jql, maxResults) {
      const parsed = searchSchema.safeParse(
        await request("search", "POST", "/search/jql", {
          jql,
          maxResults,
          fields: ["created", "priority", "summary"],
        }),
      );
      if (!parsed.success)
        throw new JiraRequestError("search", 200, "invalid response");
      return parsed.data.issues.map((item) => ({
        key: item.key,
        created: parseJiraDate(item.fields.created),
        priority: item.fields.priority?.name ?? "",
        summary: item.fields.summary ?? "",
      }));
    },
    async create(incident) {
      const parsed = createdSchema.safeParse(
        await request("create", "POST", "/issue", {
          fields: {
            project: { key: incident.project },
            issuetype: { name: incident.issueType },
            summary: incident.summary,
            description: incident.description,
            priority: { name: incident.priority },
            labels: incident.labels,
          },
        }),
      );
      if (!parsed.success)
        throw new JiraRequestError("create", 201, "invalid response");
      return { key: parsed.data.key };
    },
    async addLabel(key, label) {
      await request("addLabel", "PUT", `/issue/${encodeURIComponent(key)}`, {
        update: { labels: [{ add: label }] },
      });
    },
    async comment(key, body) {
      await request(
        "comment",
        "POST",
        `/issue/${encodeURIComponent(key)}/comment`,
        { body },
      );
    },
    async link(inwardKey, outwardKey) {
      await request("link", "POST", "/issueLink", {
        type: { name: "Relates" },
        inwardIssue: { key: inwardKey },
        outwardIssue: { key: outwardKey },
      });
    },
  };
}
