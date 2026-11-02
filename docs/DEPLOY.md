<p align="center">
  <img src="../assets/readme/banners/hono.png" alt="Hono" width="100%">
</p>

# Publicação na Cloudflare

O [wrangler.jsonc](https://github.com/Solierrr/worker-alerts/blob/main/wrangler.jsonc) publica o código como `worker-alerts`, usa compatibilidade de Node.js e desliga `workers.dev`. O domínio configurado é [alerts.solarianetwork.site](https://alerts.solarianetwork.site). O arquivo não declara ambientes separados de QA e produção.

## Ambientes e publicação

As definições versionadas descrevem estes destinos, que estão em operação.

| Ambiente   | Acesso e configuração                                                                   |
| ---------- | --------------------------------------------------------------------------------------- |
| Local      | Endereço exibido por `wrangler dev`, com `.dev.vars` e estado local dos Durable Objects |
| Cloudflare | Domínio próprio, variáveis comuns no Wrangler e segredos provisionados externamente     |

O [workflow Deploy](https://github.com/Solierrr/worker-alerts/blob/main/.github/workflows/deploy.yml) é manual, por `workflow_dispatch`. Ele instala com `npm ci --ignore-scripts`, roda os testes e executa `npm run deploy` com `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` dos secrets do repositório. Não há imagem Docker nesse processo.

O Terraform do `infra-platform` é responsável pelo domínio e pelos segredos do Worker. O [módulo de segredos](https://github.com/Solierrr/infra-platform/blob/main/modules/alerts/worker.tf) gera o token do webhook e grava os segredos pela API de segredos do script, sem substituir o bundle publicado pelo Wrangler. Os nomes de configuração e sua validação estão em [RUNNING.md](./RUNNING.md). O runtime não consulta o Infisical.

O [módulo de alertas](https://github.com/Solierrr/infra-platform/blob/main/modules/alerts/grafana.tf) declara os contatos do webhook e do heartbeat, e a política comum agrupa por alerta, serviço e ambiente, espera trinta segundos pelo grupo e repete a notificação a cada 35 minutos. O heartbeat tem uma política separada, com repetição a cada cinco minutos, e as regras incluem ausência de métricas, erros 5xx, latência p95 e memória de JVM.

## Recursos duráveis e agenda

O binding `INCIDENTS` usa o `IncidentCoordinator` e o `MONITOR` usa o `MonitorState`, com as migrations `v1` e `v2` criando essas classes como objetos SQLite. O evento agendado roda a cada cinco minutos, conforme `*/5 * * * *`.

O histórico de tickets permanece no Jira. O estado do monitor permanece no Durable Object de nome `main`, inclusive após novas versões do código. Não há rotina de expiração desse storage. Mudanças nos bindings e migrations precisam preservar o acesso a esse estado.

## Ligações externas

A configuração operacional envolve mais do que publicar o bundle.

- O contato do Grafana precisa apontar para `/grafana` com o Bearer compartilhado e manter o envio de recuperação.
- A regra de heartbeat precisa chamar `/heartbeat`. O intervalo esperado é de cinco minutos.
- A conta de serviço do Jira precisa consultar, criar e alterar os tickets e usar os projetos, prioridades, tipo `Critic` e relação `Relates` do snapshot.
- O canal opcional de e-mail precisa das três variáveis válidas e de uma origem de dashboard aceita pelo `api-email`.
- O canal opcional do Telegram precisa do token do bot e de pelo menos um chat válido, com no máximo vinte.
- Os alvos da sonda e `ephemerality.json` precisam estar acessíveis pela borda.

As permissões do Jira e os contatos do Grafana estão ativos em produção.

A orientação comum está em [Cloudflare Workers](https://github.com/Solierrr/docs-warehouse/blob/main/readme/deploy/CLOUDFLARE_WORKER.md). A integração geral com a plataforma está no [mapa entre repositórios](https://github.com/Solierrr/docs-warehouse/blob/main/docs/flows/INTEGRATIONS.md).
