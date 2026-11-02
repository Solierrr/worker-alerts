<p align="center">
  <img src="./assets/readme/banners/hono.png" alt="Hono" width="100%">
</p>

<p align="center">
  <img src="./assets/readme/stacks/typescript.png" width="100" hspace="8" alt="TypeScript" title="TypeScript">
  <img src="./assets/readme/stacks/zod.png" width="100" hspace="8" alt="Zod" title="Zod">
  <img src="./assets/readme/stacks/cloudflare.png" width="100" hspace="8" alt="Cloudflare" title="Cloudflare">
  <img src="./assets/readme/stacks/jira.png" width="100" hspace="8" alt="Jira" title="Jira">
  <img src="./assets/readme/stacks/telegram.png" width="100" hspace="8" alt="Telegram" title="Telegram">
</p>

# Central de alertas operacionais

[![License](https://img.shields.io/github/license/Solierrr/worker-alerts)](https://github.com/Solierrr/worker-alerts/blob/main/LICENSE)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/Solierrr/worker-alerts)](https://github.com/Solierrr/worker-alerts/commits)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/Solierrr/worker-alerts)](https://github.com/Solierrr/worker-alerts/pulls)
[![Release](https://img.shields.io/github/v/release/Solierrr/worker-alerts)](https://github.com/Solierrr/worker-alerts/releases)

Este serviço transforma os alertas de monitoramento da plataforma em incidentes registrados para a equipe, para que um problema em produção vire uma tarefa com responsável em vez de uma mensagem que ninguém acompanha. Cada alerta chega a um quadro de trabalho conforme o serviço afetado, e a equipe recebe também um e-mail e uma mensagem no Telegram quando o problema é grave. O serviço roda fora do cluster de propósito, para que o aviso continue saindo mesmo quando o próprio cluster cai ou é desligado.

O Grafana Cloud envia os alertas por webhook, autenticado com um token próprio, e o Worker valida cada envio com Zod antes de abrir, comentar ou registrar o fim de um incidente no Jira. Um Durable Object da Cloudflare organiza os avisos de um mesmo incidente em fila, para que dois avisos quase simultâneos não criem dois tickets. Uma tarefa agendada a cada cinco minutos confere se o monitoramento continua mandando sinal e consulta a saúde dos principais serviços, e os avisos dos incidentes graves saem pelo serviço de e-mail da plataforma e por um bot do Telegram.

## Aprofunde-se no Projeto!

- [OVERVIEW.md](./docs/OVERVIEW.md), o que o serviço faz e as regras de cada incidente.
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md), organização do código, integrações e decisões técnicas.
- [RUNNING.md](./docs/RUNNING.md), como executar e testar localmente.
- [API.md](./docs/API.md), como o monitoramento chama o serviço.
- [DEPLOY.md](./docs/DEPLOY.md), domínio, segredos e publicação.
- [STATUS.md](./docs/STATUS.md), o que já funciona e o que falta.
- [DURABLE_OBJECTS.md](./database/DURABLE_OBJECTS.md), o estado guardado pelos monitores e a coordenação de cada incidente.
- [Fluxos](./flows/), o recebimento do alerta, o registro da recuperação, a verificação independente e a sincronização das rotas.

## Contribuindo

- [CONTRIBUTING.md](https://github.com/Solierrr/.github/blob/main/.github/CONTRIBUTING.md), convenções de commit, branch e Pull Request.
- [CODE_OF_CONDUCT.md](https://github.com/Solierrr/.github/blob/main/CODE_OF_CONDUCT.md), código de conduta.
- [SECURITY.md](https://github.com/Solierrr/.github/blob/main/SECURITY.md), como reportar uma vulnerabilidade.
