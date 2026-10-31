import {
  adfDoc,
  bulletList,
  heading,
  linkText,
  orderedList,
  panel,
  paragraph,
  strong,
  text,
  type AdfNode,
} from "../channels/jira/adf";
import type { Incident } from "../ingest/model";

export interface IncidentHistory {
  occurrence: number;
  firstAt?: Date;
}

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatDateTime(date: Date) {
  const part = Object.fromEntries(
    dateTime.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${part.day}/${part.month}/${part.year} ${part.hour}:${part.minute}`;
}

export function formatDuration(milliseconds: number) {
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest
    ? `${Math.floor(minutes / 60)} h ${rest} min`
    : `${minutes / 60} h`;
}

const clip = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

export const ticketSummary = (incident: Incident) =>
  clip(
    `${incident.test ? "[TESTE] " : ""}[${incident.priority}] ${incident.summary}`,
    255,
  );

export function splitSteps(value: string) {
  return value
    .split(/(?:^|\s)\d+\.\s+/)
    .map((step) => step.trim())
    .filter(Boolean);
}

function lines(...values: (string | undefined)[]) {
  return values.filter((value): value is string => Boolean(value));
}

export function whenLines(incident: Incident, history?: IncidentHistory) {
  const occurrence = history
    ? lines(
        `Ocorrência nº ${history.occurrence}${
          history.firstAt && history.occurrence > 1
            ? `, a primeira em ${formatDateTime(history.firstAt)}`
            : ""
        }`,
      )
    : [];
  return [
    `Início: ${formatDateTime(incident.startsAt)} (horário de Brasília)`,
    ...(incident.endsAt
      ? [`Fim: ${formatDateTime(incident.endsAt)} (horário de Brasília)`]
      : []),
    ...occurrence,
  ];
}

export function logsWarning(incident: Incident) {
  const minutes = incident.logWindowMin;
  return `Verifique os logs de pelo menos ${minutes} minutos antes e ${minutes} minutos depois do horário do alerta (${formatDateTime(incident.startsAt)}). A causa pode ter começado antes.`;
}

export function ticketDescription(
  incident: Incident,
  history: IncidentHistory,
) {
  const { links } = incident;
  const where: AdfNode[][] = [
    ...(links.dashboard
      ? [
          [
            text("Dashboard do serviço: "),
            linkText(links.dashboard, links.dashboard),
          ],
        ]
      : []),
    ...(links.logs
      ? [[text("Logs de erro: "), linkText("abrir no Grafana", links.logs)]]
      : []),
    ...(links.traces
      ? [
          [
            text("Traces com erro: "),
            linkText("abrir no Grafana", links.traces),
          ],
        ]
      : []),
  ];
  const steps = splitSteps(incident.firstSteps);
  return adfDoc(
    heading(3, "O que aconteceu"),
    paragraph(strong(incident.summary)),
    ...(incident.description ? [paragraph(text(incident.description))] : []),
    ...(incident.impact
      ? [heading(3, "Impacto provável"), paragraph(text(incident.impact))]
      : []),
    heading(3, "Quando"),
    bulletList(whenLines(incident, history).map((line) => [text(line)])),
    ...(where.length ? [heading(3, "Onde olhar"), bulletList(where)] : []),
    panel(
      "warning",
      paragraph(strong("ATENÇÃO: "), text(logsWarning(incident))),
    ),
    ...(steps.length
      ? [
          heading(3, "Primeiros passos"),
          orderedList(steps.map((step) => [text(step)])),
        ]
      : []),
  );
}

export const closingComment = (incident: Incident, endsAt: Date) =>
  adfDoc(
    paragraph(
      text(
        `Alerta voltou ao normal às ${formatDateTime(endsAt)}. Duração: ${formatDuration(endsAt.getTime() - incident.startsAt.getTime())}. O ticket continua aberto até alguém confirmar.`,
      ),
    ),
  );

export const ceilingComment = (incident: Incident, max: number, at: Date) =>
  adfDoc(
    paragraph(
      text(
        `O problema continua (${formatDateTime(at)}). Teto de ${max} tickets em 24 horas atingido para ${incident.alertId} em ${incident.service}; novos tickets só depois desse período.`,
      ),
    ),
  );

export const relatedComment = (note: string) => adfDoc(paragraph(text(note)));
