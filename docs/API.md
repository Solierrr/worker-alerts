<p align="center">
  <img src="../assets/readme/banners/hono.png" alt="Hono" width="100%">
</p>

# Contrato HTTP de alertas

As rotas são definidas em [src/index.ts](https://github.com/Solierrr/worker-alerts/blob/main/src/index.ts) e o schema do webhook fica em [src/ingest/schema.ts](https://github.com/Solierrr/worker-alerts/blob/main/src/ingest/schema.ts), sem contrato OpenAPI nem Swagger publicado no código.

## Autenticação e rotas

Todas as rotas POST exigem `Authorization: Bearer <token>` com o token compartilhado configurado em `WEBHOOK_TOKEN`, e a autenticação não aceita uma sessão JWT da plataforma, enquanto o health é público.

| Método e caminho        | Resultado                                                                |
| ----------------------- | ------------------------------------------------------------------------ |
| `GET /health`           | HTTP 200 com `{"status":"ok"}`, sem consultar Jira, e-mail ou aplicações |
| `POST /grafana`         | Processa de um a cinquenta alertas e retorna `results`                   |
| `POST /grafana/preview` | Retorna `tickets`, sem chamar Jira ou enviar e-mail                      |
| `POST /heartbeat`       | Grava o instante atual do recebimento e responde `status`                |
| `POST /monitor/run`     | Executa o monitor e retorna heartbeat, idade, pausa, sondas e transições |

O webhook e a prévia exigem `application/json` e limitam o corpo a 256 KiB. O limite não é aplicado às duas rotas de monitoramento, que não precisam do corpo para executar.

## Mensagem de entrada

O envelope contém uma lista não vazia de até cinquenta alertas, e cada item exige `status`, `startsAt` e os labels `alert_id`, `priority`, `service_name` e `deployment_environment`. A prioridade aceita de P1 a P5, e os instantes usam ISO 8601 com offset.

```json
{
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alert_id": "A03",
        "priority": "P1",
        "service_name": "core",
        "deployment_environment": "prod",
        "test": "true"
      },
      "annotations": {
        "summary": "Serviço indisponível",
        "impact": "Acesso às operações interrompido"
      },
      "startsAt": "2026-11-01T12:00:00Z"
    }
  ]
}
```

`test=true` marca o ticket e impede e-mail, mas não impede a criação de ticket se o corpo for enviado ao webhook real. Para uma conferência sem escrita externa, use `/grafana/preview`.

Os labels opcionais `category` e `escalation_group` organizam e relacionam tickets. `silence_on_pause=true` permite silenciar apenas o disparo durante pausa observada do cluster e sua carência posterior. `endsAt` é usado na recuperação. A data de fim sentinela recebida em alertas ainda ativos é descartada.

## Resultados

O webhook responde 200 com uma ação por alerta processado. A ação explica o efeito sem depender do status HTTP do provedor.

| Ação               | Efeito                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| `created`          | Ticket criado, com `issueKey` e possíveis `warnings`                   |
| `skipped_interval` | Ainda não passou o intervalo desde o último ticket                     |
| `ceiling_comment`  | Teto de tickets em 24 horas atingido, com comentário no último         |
| `ignored_env`      | Ambiente diferente do configurado                                      |
| `skipped_pause`    | Disparo marcado para silenciamento durante pausa ou carência           |
| `end_recorded`     | Tickets marcados e comentados com a recuperação, sem mudança de status |
| `no_open_ticket`   | Nenhum ticket não marcado como resolvido no histórico consultado       |

Se o e-mail está configurado, a resposta também contém `email.sent` e `email.failed`, e com o Telegram configurado ela traz `telegram.sent` e `telegram.failed`. O envio elegível ocorre apenas depois que todos os itens do lote terminam sem falha de processamento. Se algum item falha, o webhook responde 503, mesmo que outros itens já tenham alterado o Jira.

A prévia retorna `would_create`, `would_record_end` ou `ignored_env` sem consultar o histórico, o intervalo, o teto diário ou a pausa, por isso um `would_create` não garante que o webhook criará um ticket.

## Erros

O corpo implementado contém `code`, `message` e, quando aplicável, `errors`, com media type `application/problem+json`. Ele difere do [contrato comum](https://github.com/Solierrr/docs-warehouse/blob/main/docs/standards/ERRORS.md), que exige outros campos. Os códigos específicos ainda não estão no [catálogo central](https://github.com/Solierrr/docs-warehouse/blob/main/docs/standards/ERROR_CODES.md).

| HTTP | Código                   | Causa                                                     |
| ---- | ------------------------ | --------------------------------------------------------- |
| 401  | `UNAUTHENTICATED`        | Token ausente, inválido ou não configurado                |
| 413  | `PAYLOAD_TOO_LARGE`      | Corpo do webhook ou da prévia acima do limite             |
| 415  | `UNSUPPORTED_MEDIA_TYPE` | Corpo sem media type JSON                                 |
| 422  | `MALFORMED_REQUEST`      | JSON ilegível                                             |
| 422  | `VALIDATION_FAILED`      | Envelope ou alertas fora do schema                        |
| 503  | `CHANNEL_NOT_CONFIGURED` | Webhook real sem canal Jira válido                        |
| 503  | `JIRA_REQUEST_FAILED`    | Falha de processamento de pelo menos um alerta no Jira    |
| 500  | `INTERNAL_ERROR`         | Exceção não tratada, inclusive configuração base inválida |

As rotas inexistentes usam a resposta padrão do Hono, e o Worker não repete internamente as chamadas ao Jira, deixando a repetição do webhook a cargo do Grafana.
