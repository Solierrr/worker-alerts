export function grafanaAlert(patch: Record<string, unknown> = {}) {
  return {
    status: "firing",
    labels: {
      alert_id: "A03",
      alertname: "A03 Erros 5xx sustentados",
      category: "erros",
      deployment_environment: "prod",
      escalation_group: "erro-5xx",
      grafana_folder: "SOLIER",
      priority: "P1",
      service_name: "core",
      team: "solier",
    },
    annotations: {
      summary: "core (prod): 7.1 % de respostas 5xx há 10 min",
      description: "Taxa de erros 5xx de 5 % ou mais durante 10 minutos.",
      impact: "Pelo menos 1 em cada 20 requisições falha há 10 minutos.",
      first_steps:
        "1. Abrir o dashboard do serviço. 2. Ver os logs de erro. 3. Checar a última publicação.",
      dashboard: "/d/solier-servico-java?var-service=core&var-environment=prod",
    },
    startsAt: "2026-10-30T16:06:30Z",
    endsAt: "0001-01-01T00:00:00Z",
    generatorURL: "http://localhost:3000/alerting/grafana/solier-a03/view",
    fingerprint: "ab12cd34ef56",
    silenceURL: "http://localhost:3000/alerting/silence/new",
    values: { A: 7.06, B: 7.06, C: 1 },
    valueString: "[ var='B' labels={} value=7.06 ]",
    ...patch,
  };
}

export function grafanaPayload(
  alerts: Record<string, unknown>[] = [grafanaAlert()],
  patch: Record<string, unknown> = {},
) {
  return {
    receiver: "api-email-jira",
    status: "firing",
    orgId: 1,
    alerts,
    groupLabels: { alertname: "A03 Erros 5xx sustentados" },
    commonLabels: {},
    commonAnnotations: {},
    externalURL: "http://localhost:3000/",
    version: "1",
    groupKey: '{}/{priority=~".+"}:{alertname="A03"}',
    truncatedAlerts: 0,
    title: "[FIRING:1] A03",
    state: "alerting",
    message: "**Firing**",
    ...patch,
  };
}

export const grafanaLabels = (patch: Record<string, string>) => ({
  ...grafanaAlert().labels,
  ...patch,
});

import { loadConfig } from "../src/config";

// Builds the alerts config the way the Worker does, from its environment variables
export const alertsConfig = (env: Record<string, string> = {}) =>
  loadConfig({
    ...env,
  } as unknown as Env);
