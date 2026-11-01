import type { TelegramConfig } from "../../config";
import type { Incident } from "../../ingest/model";
import { withoutPrefix } from "../email/client";

export interface TelegramOutcome {
  sent: number;
  failed: number;
}

// Texto puro (sem parse_mode), para nenhum caractere do alerta precisar de escape
export function buildTelegramText(
  incident: Incident,
  fallbackUrl: string | undefined,
) {
  const head = incident.firing
    ? `[ALERTA ${incident.priority}] ${incident.serviceFullName} (${incident.environment})`
    : `[RESOLVIDO ${incident.priority}] ${incident.serviceFullName} (${incident.environment})`;
  const dashboard = incident.links.dashboard ?? fallbackUrl;
  const lines = [
    head,
    withoutPrefix(incident),
    incident.impact && `Impacto: ${incident.impact}`,
    `Início: ${incident.startsAt.toISOString()}`,
    incident.endsAt && `Fim: ${incident.endsAt.toISOString()}`,
    incident.serviceUrl && `Serviço: ${incident.serviceUrl}`,
    dashboard && `Painel: ${dashboard}`,
  ].filter(Boolean);
  const text = lines.join("\n");
  // O Telegram recusa mensagens acima de 4096 caracteres
  return text.length <= 4096 ? text : `${text.slice(0, 4093)}...`;
}

// Uma chamada por chat. Melhor esforço, como o e-mail: a falha nunca derruba o webhook. Ao contrário
// do e-mail, não passa pelo cluster, então o aviso sai mesmo com o GKE fora do ar.
export async function sendTelegramAlert(
  config: TelegramConfig,
  incident: Incident,
  fallbackUrl: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<TelegramOutcome> {
  const outcome = { sent: 0, failed: 0 };
  const text = buildTelegramText(incident, fallbackUrl);
  await Promise.all(
    config.chatIds.map(async (chatId) => {
      try {
        const response = await fetchFn(
          `https://api.telegram.org/bot${config.botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              link_preview_options: { is_disabled: true },
            }),
            redirect: "manual",
            signal: AbortSignal.timeout(8000),
          },
        );
        if (response.ok) {
          await response.body?.cancel();
          outcome.sent += 1;
          return;
        }
        outcome.failed += 1;
        // A description do Telegram explica o motivo ("chat not found") e nunca traz o token
        const body = (await response.json().catch(() => ({}))) as {
          description?: string;
        };
        console.error(
          JSON.stringify({
            code: "TELEGRAM_REQUEST_FAILED",
            status: response.status,
            description: body.description,
          }),
        );
      } catch (error) {
        outcome.failed += 1;
        // Só o nome do erro: a URL da chamada leva o token do bot
        console.error(
          JSON.stringify({
            code: "TELEGRAM_REQUEST_FAILED",
            name: error instanceof Error ? error.name : "unknown",
          }),
        );
      }
    }),
  );
  return outcome;
}
