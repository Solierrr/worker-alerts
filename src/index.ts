import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { loadConfig, type AlertsConfig } from "./config";
import { hasValidToken } from "./ingest/auth";
import { toIncident, type Incident } from "./ingest/model";
import { grafanaWebhookSchema } from "./ingest/schema";
import { ticketDescription, ticketSummary } from "./incident/content";
import type { IncidentResult } from "./incident/service";

import type { IncidentCoordinator } from "./incident/coordinator";

export { IncidentCoordinator } from "./incident/coordinator";

const BODY_LIMIT = 256 * 1024;

export type HandleIncident = (
  env: Env,
  incident: Incident,
) => Promise<IncidentResult>;

// Each incident key has its own Durable Object, which serializes the work on that incident
const viaCoordinator: HandleIncident = (env, incident) =>
  (env.INCIDENTS as DurableObjectNamespace<IncidentCoordinator>)
    .getByName(incident.key)
    .handle(incident);

function problem(
  status: 401 | 413 | 415 | 422 | 503,
  code: string,
  message: string,
  errors?: unknown,
) {
  return Response.json(
    { code, message, ...(errors ? { errors } : {}) },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

export function createApp(handleIncident: HandleIncident = viaCoordinator) {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/health", (c) => c.json({ status: "ok" }));

  const webhook = new Hono<{ Bindings: Env }>();

  webhook.use(async (c, next) => {
    if (
      !(await hasValidToken(c.req.header("authorization"), c.env.WEBHOOK_TOKEN))
    )
      return problem(401, "UNAUTHENTICATED", "Token ausente ou inválido.");
    await next();
  });
  webhook.use(
    bodyLimit({
      maxSize: BODY_LIMIT,
      onError: () =>
        problem(413, "PAYLOAD_TOO_LARGE", "Corpo maior que 256 KiB."),
    }),
  );

  async function incidents(
    request: Request,
    config: AlertsConfig,
  ): Promise<Incident[] | Response> {
    if (!request.headers.get("content-type")?.includes("application/json"))
      return problem(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "O corpo precisa ser JSON.",
      );
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return problem(422, "MALFORMED_REQUEST", "JSON ilegível.");
    }
    const parsed = grafanaWebhookSchema.safeParse(body);
    if (!parsed.success)
      return problem(
        422,
        "VALIDATION_FAILED",
        "Erro de validação nos campos da requisição.",
        parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          detail: issue.message,
        })),
      );
    const now = new Date();
    return parsed.data.alerts.map((alert) => toIncident(alert, config, now));
  }

  webhook.post("/preview", async (c) => {
    const config = loadConfig(c.env);
    const list = await incidents(c.req.raw, config);
    if (list instanceof Response) return list;
    return c.json({
      tickets: list.map((incident) => {
        const base = { alertId: incident.alertId, service: incident.service };
        if (incident.environment !== config.environment)
          return { ...base, action: "ignored_env" as const };
        if (!incident.firing)
          return { ...base, action: "would_record_end" as const };
        return {
          ...base,
          action: "would_create" as const,
          summary: ticketSummary(incident),
          priority: incident.jiraPriority,
          labels: incident.tags,
          description: ticketDescription(incident, { occurrence: 1 }),
        };
      }),
    });
  });

  webhook.post("/", async (c) => {
    const config = loadConfig(c.env);
    if (!config.jira)
      return problem(
        503,
        "CHANNEL_NOT_CONFIGURED",
        "O canal do Jira não está configurado no serviço.",
      );
    const list = await incidents(c.req.raw, config);
    if (list instanceof Response) return list;
    const settled = await Promise.allSettled(
      list.map((incident) => handleIncident(c.env, incident)),
    );
    const results = settled.flatMap((item) =>
      item.status === "fulfilled" ? [item.value] : [],
    );
    const failed = settled.filter((item) => item.status === "rejected");
    if (failed.length) {
      // A mensagem do erro do Jira só leva a operação, o status HTTP e o motivo; nunca o corpo da
      // resposta nem credenciais. Os custom properties do erro se perdem na chamada ao Durable Object.
      const reasons = failed.map((item) =>
        item.reason instanceof Error
          ? item.reason.message
          : "erro desconhecido",
      );
      for (const message of reasons)
        console.error(JSON.stringify({ code: "JIRA_REQUEST_FAILED", message }));
      // The Grafana retries on 5xx; the interval guard in Jira keeps the retry from duplicating tickets
      return problem(
        503,
        "JIRA_REQUEST_FAILED",
        "O Jira recusou ou não respondeu à requisição.",
        reasons.map((message) => ({ detail: message })),
      );
    }
    console.log(
      JSON.stringify({ actions: results.map((result) => result.action) }),
    );
    return c.json({ results });
  });

  app.route("/grafana", webhook);

  app.onError((error) => {
    console.error(JSON.stringify({ code: "INTERNAL_ERROR", name: error.name }));
    return Response.json(
      { code: "INTERNAL_ERROR", message: "Erro interno inesperado." },
      { status: 500, headers: { "content-type": "application/problem+json" } },
    );
  });

  return app;
}

export default { fetch: createApp().fetch };
