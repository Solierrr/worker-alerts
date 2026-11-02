<p align="center">
  <img src="../assets/readme/banners/hono.png" alt="Hono" width="100%">
</p>

# Execução local

O [package.json](https://github.com/Solierrr/worker-alerts/blob/main/package.json) exige Node.js 24 ou superior. Os workflows usam Node.js 24 e instalam as versões do lockfile com npm. O runtime local é fornecido pelo Wrangler. Make e um shell compatível com `sh` são necessários apenas para usar o Makefile.

## Configuração

As variáveis particulares ficam em `.dev.vars`, ignorado pelo git. O [Makefile](https://github.com/Solierrr/worker-alerts/blob/main/Makefile) usa a pasta `/alerts` do Infisical e define esse arquivo como saída de `make vault`.

```bash
infisical login
make vault ENV=local
npm ci
npm run dev
```

Sem acesso ao cofre, use o [modelo de nomes](https://github.com/Solierrr/worker-alerts/blob/main/.dev.vars.example) para preparar a configuração local com credenciais próprias. Não use credenciais de produção nem versione o arquivo resultante. O Worker publicado recebe os segredos pelo Terraform e não consulta o cofre durante a execução.

| Grupo    | Nomes                                                                                      | Efeito                                                                       |
| -------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Entrada  | `WEBHOOK_TOKEN`                                                                            | Habilita o acesso protegido                                                  |
| Jira     | `JIRA_BASE_URL`, `JIRA_USER`, `JIRA_API_TOKEN`                                             | Os três válidos habilitam o canal                                            |
| Links    | `ALERT_GRAFANA_URL`                                                                        | Base dos links de investigação e ação do e-mail                              |
| E-mail   | `EMAIL_API_URL`, `EMAIL_SERVICE_KEY`, `ALERT_EMAIL_TO`                                     | O conjunto válido habilita o envio opcional                                  |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`                                                   | O token do bot e os chats, separados por vírgula, habilitam o aviso opcional |
| Política | `ALERT_ENVIRONMENT`, `ALERT_MIN_INTERVAL_MIN`, `ALERT_MAX_PER_24H`, `ALERT_LOG_WINDOW_MIN` | Seleção do ambiente, repetição e janela de investigação                      |

O parse de destinatários aceita vírgula ou ponto e vírgula e exige de um a vinte endereços válidos. A configuração numérica exige inteiros positivos. Os valores comuns de execução estão no [wrangler.jsonc](https://github.com/Solierrr/worker-alerts/blob/main/wrangler.jsonc), sem depender de um arquivo `.env`.

## Comandos

Os comandos disponíveis não dependem da execução de um serviço Node permanente.

| Comando                         | Uso                                                     |
| ------------------------------- | ------------------------------------------------------- |
| `make install` ou `npm ci`      | Instalar pelo lockfile                                  |
| `make dev` ou `npm run dev`     | Iniciar o Wrangler local                                |
| `make test` ou `npm test`       | Rodar Vitest com o runtime de Workers                   |
| `npm run typecheck`             | Conferir os tipos sem emitir JavaScript                 |
| `make build` ou `npm run check` | Gerar o bundle por deploy em modo dry-run               |
| `npm run format:check`          | Conferir formatação                                     |
| `npm run types`                 | Regerar os tipos dos bindings após mudar o Wrangler     |
| `npm run routing:check`         | Comparar snapshot com os arquivos remotos pela CLI `gh` |
| `npm run routing:sync`          | Atualizar o snapshot no desenvolvimento do serviço      |

`make lint` não executa um linter porque `LINT_CMD` está vazio. `make ci` também não substitui o typecheck e a conferência de formatação. O CI real executa formatação, tipos, conferência remota do snapshot de roteamento e testes, conforme o [workflow CI](https://github.com/Solierrr/worker-alerts/blob/main/.github/workflows/ci.yml). A conferência remota usa a CLI `gh` e o token do GitHub Actions. O [workflow Routing Check](https://github.com/Solierrr/worker-alerts/blob/main/.github/workflows/routing-check.yml) também faz essa comparação diariamente às 09h17 UTC e por execução manual.

## Conferência local

Use o endereço exibido pelo Wrangler, lembrando que o health é público e que a prévia permite conferir a autenticação e o formato sem criar ticket nem enviar e-mail.

```bash
curl "$ALERTS_URL/health"
curl -X POST "$ALERTS_URL/grafana/preview" \
  -H "Authorization: Bearer $WEBHOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @alert.json
```

O arquivo `alert.json` segue o exemplo de [API.md](./API.md). A variável de shell `ALERTS_URL` representa o endereço local exibido, sem ser uma configuração do Worker. A prévia indica o conteúdo previsto, mas não confere a existência de tickets, a pausa ou os limites de repetição.

`/grafana` e `/monitor/run` podem criar ou alterar tickets se o Jira estiver configurado. Os testes existentes substituem as integrações em ambiente de Workers. A documentação comum de publicação está em [Cloudflare Workers](https://github.com/Solierrr/docs-warehouse/blob/main/readme/deploy/CLOUDFLARE_WORKER.md).
