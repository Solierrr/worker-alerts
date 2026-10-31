import type { AlertsConfig } from "../config";
import { toIncident, type Incident } from "../ingest/model";
import type { GrafanaAlert, Priority } from "../ingest/schema";
import type { IncidentResult } from "../incident/service";

const MINUTE = 60_000;

// Sem batida do Grafana Cloud por mais tempo que isto, o heartbeat é dado como perdido
export const HEARTBEAT_MAX_AGE_MS = 15 * MINUTE;
// Falhas seguidas da sonda antes de abrir o incidente: uma falha isolada não alerta
export const PROBE_FAILURES_TO_ALERT = 3;
// Depois que o cluster volta, os serviços levam alguns minutos para mandar métrica de novo; nesse
// intervalo os alertas de "serviço sem dados" continuam silenciados
export const PAUSE_GRACE_MS = 30 * MINUTE;

export interface ProbeTarget {
  name: string;
  service: string;
  url: string;
}

export interface MonitorStore {
  lastHeartbeat(): Promise<number | undefined>;
  baseline(now: number): Promise<number>;
  markPaused(at: number): Promise<void>;
  lastPaused(): Promise<number | undefined>;
  countProbe(name: string, ok: boolean): Promise<number>;
  openedAt(key: string): Promise<number | undefined>;
  setOpenedAt(key: string, at: number | undefined): Promise<void>;
}

export interface MonitorDeps {
  config: AlertsConfig;
  store: MonitorStore;
  targets: ProbeTarget[];
  handle: (incident: Incident) => Promise<IncidentResult>;
  fetchFn?: typeof fetch;
  clusterActive: () => Promise<boolean>;
  now?: () => Date;
}

export interface MonitorReport {
  heartbeat: "ok" | "lost";
  // Minutos desde a última batida (ou desde a primeira verificação, se nenhuma chegou)
  heartbeatAgeMin: number;
  clusterActive: boolean;
  probes: { name: string; ok: boolean; failures: number }[];
  opened: string[];
  resolved: string[];
}

interface Spec {
  key: string;
  alertId: string;
  priority: Priority;
  service: string;
  summary: string;
  impact: string;
  steps: string;
}

function incidentFor(
  spec: Spec,
  firing: boolean,
  startedAt: number,
  config: AlertsConfig,
  now: Date,
): Incident {
  const alert = {
    status: firing ? "firing" : "resolved",
    labels: {
      alertname: `${spec.alertId} ${spec.summary}`,
      alert_id: spec.alertId,
      priority: spec.priority,
      category: "monitoramento",
      service_name: spec.service,
      deployment_environment: config.environment,
    },
    annotations: {
      summary: spec.summary,
      impact: spec.impact,
      first_steps: spec.steps,
      dashboard: "/d/services-overview?var-environment=" + config.environment,
    },
    startsAt: new Date(startedAt).toISOString(),
    ...(firing ? {} : { endsAt: now.toISOString() }),
  } as GrafanaAlert;
  return toIncident(alert, config, now);
}

// Mantém aberto ou fecha o incidente de uma condição, só nas transições
async function reconcile(
  deps: MonitorDeps,
  spec: Spec,
  failing: boolean,
  now: Date,
  report: MonitorReport,
) {
  const opened = await deps.store.openedAt(spec.key);
  if (failing && opened === undefined) {
    await deps.handle(incidentFor(spec, true, now.getTime(), deps.config, now));
    await deps.store.setOpenedAt(spec.key, now.getTime());
    report.opened.push(spec.key);
  } else if (!failing && opened !== undefined) {
    await deps.handle(incidentFor(spec, false, opened, deps.config, now));
    await deps.store.setOpenedAt(spec.key, undefined);
    report.resolved.push(spec.key);
  }
}

export async function runMonitor(deps: MonitorDeps): Promise<MonitorReport> {
  const now = (deps.now ?? (() => new Date()))();
  const fetchFn = deps.fetchFn ?? fetch;
  const report: MonitorReport = {
    heartbeat: "ok",
    heartbeatAgeMin: 0,
    clusterActive: true,
    probes: [],
    opened: [],
    resolved: [],
  };

  // Heartbeat: conferido sempre, porque o Grafana Cloud não depende do cluster. Antes da primeira
  // batida conta o horário da primeira execução, para um deploy novo não alertar.
  const baseline = await deps.store.baseline(now.getTime());
  const last = Math.max((await deps.store.lastHeartbeat()) ?? 0, baseline);
  const lost = now.getTime() - last > HEARTBEAT_MAX_AGE_MS;
  report.heartbeat = lost ? "lost" : "ok";
  report.heartbeatAgeMin = Math.floor((now.getTime() - last) / MINUTE);
  await reconcile(
    deps,
    {
      key: "heartbeat",
      alertId: "H01",
      priority: "P1",
      service: "grafana-cloud",
      summary: "grafana-cloud: sem heartbeat há mais de 15 min",
      impact:
        "Os alertas do Grafana Cloud podem não estar chegando: ele ou o caminho até o Worker pararam.",
      steps:
        "1. Abrir o Grafana Cloud e ver se as regras estão avaliando. 2. Ver o último erro do contact point worker-alerts. 3. Conferir o status do Worker e do Grafana Cloud.",
    },
    lost,
    now,
    report,
  );

  // Sonda: só com o cluster ativo. Numa pausa planejada ela fica quieta e fecha o que estava aberto.
  report.clusterActive = await deps.clusterActive();
  if (!report.clusterActive) await deps.store.markPaused(now.getTime());
  for (const target of deps.targets) {
    const key = `probe:${target.name}`;
    const spec: Spec = {
      key,
      alertId: "S01",
      priority: "P1",
      service: target.service,
      summary: `${target.service} (${deps.config.environment}): sem resposta de ${new URL(target.url).hostname} há ${PROBE_FAILURES_TO_ALERT} verificações seguidas`,
      impact:
        "O serviço não responde pelo caminho público; quem usa o aplicativo pode estar sem acesso.",
      steps:
        "1. Abrir o dashboard do serviço. 2. Ver se o pod está de pé no cluster. 3. Ver o Kong e o certificado do host.",
    };
    if (!report.clusterActive) {
      await reconcile(deps, spec, false, now, report);
      continue;
    }
    let ok = false;
    try {
      const response = await fetchFn(target.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: { "user-agent": "worker-alerts-probe" },
      });
      ok = response.ok;
      await response.body?.cancel();
    } catch {
      ok = false;
    }
    const failures = await deps.store.countProbe(target.name, ok);
    report.probes.push({ name: target.name, ok, failures });
    await reconcile(
      deps,
      spec,
      failures >= PROBE_FAILURES_TO_ALERT,
      now,
      report,
    );
  }
  return report;
}

// Lê o estado do cluster no repositório público do infra-platform. Se o arquivo não puder ser lido,
// assume ativo: melhor sondar e alertar a mais do que ficar cego.
export async function readClusterActive(
  fetchFn: typeof fetch = fetch,
  url = "https://raw.githubusercontent.com/Solierrr/infra-platform/main/ephemerality.json",
): Promise<boolean> {
  try {
    const response = await fetchFn(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return true;
    const data = (await response.json()) as { active?: unknown };
    return data.active !== false;
  } catch {
    return true;
  }
}
