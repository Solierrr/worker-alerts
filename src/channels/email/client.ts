import type { EmailConfig } from "../../config";
import type { IncidentResult } from "../../incident/service";
import type { Incident } from "../../ingest/model";

export interface EmailOutcome {
  sent: number;
  failed: number;
}

const clip = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 3)}...`;
// O contrato do api-email recusa quebras de linha e caracteres de controle nos textos
const oneLine = (value: string, max: number) =>
  clip(
    value
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    max,
  );

// O e-mail acompanha o ticket, não cada repetição do Grafana: sai quando um ticket novo é criado e
// quando o fim de um incidente é registrado, só para P1 e P2 e nunca para alerta de teste.
export function shouldEmail(incident: Incident, result: IncidentResult) {
  if (incident.test || !["P1", "P2"].includes(incident.priority)) return false;
  return incident.firing
    ? result.action === "created"
    : result.action === "end_recorded";
}

export function buildEmailRequest(
  incident: Incident,
  to: string,
  fallbackUrl: string | undefined,
) {
  const actionUrl = incident.links.dashboard ?? fallbackUrl;
  if (!actionUrl) return undefined;
  return {
    template: "operational-alert",
    locale: "pt-BR",
    to,
    data: {
      alertPriority: incident.priority,
      alertStatus: incident.firing ? "firing" : "resolved",
      serviceName: oneLine(incident.service, 120),
      environment: oneLine(incident.environment, 120),
      summary: oneLine(incident.summary || incident.alertName, 300),
      ...(incident.impact ? { impact: oneLine(incident.impact, 400) } : {}),
      ...(incident.serviceUrl ? { serviceUrl: incident.serviceUrl } : {}),
      startedAt: incident.startsAt.toISOString(),
      ...(incident.endsAt ? { endedAt: incident.endsAt.toISOString() } : {}),
      actionUrl,
    },
  };
}

// Um destinatário por chamada (o contrato do api-email). Melhor esforço: o aviso passa pelo cluster,
// então uma falha aqui nunca derruba o webhook nem o ticket, que já foi criado.
export async function sendAlertEmails(
  config: EmailConfig,
  incident: Incident,
  fallbackUrl: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<EmailOutcome> {
  const outcome = { sent: 0, failed: 0 };
  await Promise.all(
    config.recipients.map(async (to) => {
      const body = buildEmailRequest(incident, to, fallbackUrl);
      if (!body) {
        outcome.failed += 1;
        return;
      }
      try {
        const response = await fetchFn(`${config.apiUrl}/emails`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-service-key": config.serviceKey,
          },
          body: JSON.stringify(body),
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
        });
        await response.body?.cancel();
        if (response.ok) outcome.sent += 1;
        else {
          outcome.failed += 1;
          console.error(
            JSON.stringify({
              code: "EMAIL_REQUEST_FAILED",
              status: response.status,
            }),
          );
        }
      } catch (error) {
        outcome.failed += 1;
        console.error(
          JSON.stringify({
            code: "EMAIL_REQUEST_FAILED",
            name: error instanceof Error ? error.name : "unknown",
          }),
        );
      }
    }),
  );
  return outcome;
}
