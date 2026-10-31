# worker alerts

Worker do Cloudflare que recebe os alertas do Grafana Cloud e os transforma em incidentes no Jira. Ele cuida só dos alertas operacionais da plataforma; as notificações do marketplace continuam fora deste repositório.

Roda fora do cluster de propósito: se o GKE cair ou for pausado, o aviso continua saindo. A decisão e as alternativas descartadas estão em `decisoes-de-infra.md` (D30), no VersioSpec.

## o que existe nesta versão

- `POST /grafana`: recebe o webhook do Grafana e cria, comenta ou fecha o fim do incidente no Jira.
- `POST /grafana/preview`: mostra o ticket que seria criado, sem contato com o Jira.
- `GET /health`: resposta pública para a sonda.

Ainda não existem: sonda e heartbeat, e-mail pelo `api-email` e WhatsApp. Eles entram nas próximas etapas.

## como funciona

1. O Grafana envia o webhook com `Authorization: Bearer <token>`.
2. O Worker valida o token (comparação em tempo constante), o tamanho (256 KiB) e o formato do payload.
3. Cada alerta vira um incidente com chave estável (SHA-1 de alerta, serviço e ambiente).
4. Um Durable Object por chave serializa os webhooks do mesmo incidente, para duas chamadas quase simultâneas não criarem dois tickets.
5. O Jira é o estado: o Worker consulta por rótulo (`inc-key-…`) antes de criar.

Regras do ticket:

- `firing` cria um ticket novo se o último do mesmo alerta, serviço e ambiente tem pelo menos `ALERT_MIN_INTERVAL_MIN` minutos e se houve menos de `ALERT_MAX_PER_24H` em 24 horas. No teto, só comenta no último.
- `resolved` só grava o campo "Fim do incidente" e comenta. O Worker nunca muda o status nem fecha o ticket.
- Falha ao consultar ou criar no Jira responde 503, e o Grafana tenta de novo.
- Alertas de outro ambiente que não `ALERT_ENVIRONMENT` são ignorados.
- Alerta com o rótulo `test=true` cria o ticket com o label `teste` e o prefixo `[TESTE]`.

O contrato dos alertas exige os rótulos `alert_id`, `priority` (P1 a P5), `service_name` e `deployment_environment`. A cadência dos avisos fica na política de notificação do Grafana.

## estrutura

```text
src/
  index.ts            rotas (Hono) e exportação do Durable Object
  config.ts           variáveis do Worker lidas e validadas com zod
  ingest/             token, schema do webhook e normalização para Incident
  incident/           regras do ticket, textos e o Durable Object
  channels/jira/      cliente do Jira e montagem do corpo em ADF
test/support.ts       dados e configuração de teste
```

## configuração

As variáveis comuns ficam em `wrangler.jsonc`. Os segredos entram no Worker pelo Terraform (`infra-platform`), copiados da pasta `/alerts` do Infisical; o Worker não consulta o Infisical em execução. Para desenvolver, copie `.dev.vars.example` para `.dev.vars`.

| Variável                                                              | Origem     | Uso                                           |
| --------------------------------------------------------------------- | ---------- | --------------------------------------------- |
| `WEBHOOK_TOKEN`                                                       | segredo    | token bearer que o Grafana envia              |
| `JIRA_BASE_URL`, `JIRA_USER`, `JIRA_API_TOKEN`                        | segredo    | site, conta de serviço e token de API do Jira |
| `JIRA_FIELD_START`, `JIRA_FIELD_END`                                  | segredo    | ids dos campos "Início" e "Fim do incidente"  |
| `ALERT_GRAFANA_URL`                                                   | segredo    | base dos links do ticket                      |
| `JIRA_PROJECT`, `JIRA_ISSUE_TYPE`                                     | `wrangler` | `INC` e `Incidente`                           |
| `ALERT_ENVIRONMENT`                                                   | `wrangler` | ambiente que gera ticket, `prod`              |
| `ALERT_MIN_INTERVAL_MIN`, `ALERT_MAX_PER_24H`, `ALERT_LOG_WINDOW_MIN` | `wrangler` | 30, 8 e 30                                    |

O canal do Jira só liga quando todas as suas variáveis são válidas; sem elas, `POST /grafana` responde 503 `CHANNEL_NOT_CONFIGURED`.

## comandos

```bash
npm ci
npm run dev          # wrangler dev
npm test             # vitest dentro do runtime de Workers
npm run typecheck
npm run check        # valida o bundle (wrangler deploy --dry-run)
npm run types        # regera worker-configuration.d.ts depois de mudar o wrangler.jsonc
```

## deploy

O domínio `alerts.solarianetwork.site`, os segredos e o token do webhook são criados pelo Terraform no `infra-platform`. O código vai para a Cloudflare pelo workflow `Deploy` (manual), que usa os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` do repositório.
