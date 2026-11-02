<p align="center">
  <img src="../assets/readme/banners/hono.png" alt="Hono" width="100%">
</p>

# Sincronização das rotas

Acontece quando alguém muda o destino de um serviço ou cria um serviço novo. O destino é declarado no `alerts.json` da raiz do repositório do serviço, e este repositório guarda uma cópia reunida dessas declarações, conferida no CI e todos os dias, para que o Worker publicado use sempre a tabela revisada.

```mermaid
sequenceDiagram
    participant Pessoa
    participant Servico as Repositório do serviço
    participant Alerts as worker-alerts
    participant CI as GitHub Actions

    Pessoa->>Servico: altera o alerts.json e abre a Pull Request
    Pessoa->>Alerts: npm run routing:sync
    Alerts->>Servico: lê o alerts.json da main de cada repositório (gh)
    Alerts->>Alerts: grava o routing.json com a tabela reunida
    Pessoa->>Alerts: abre a Pull Request com a tabela nova
    CI->>Alerts: npm run routing:check a cada mudança e todo dia às 09:17 UTC
    alt tabela desatualizada ou quadro sem tipo de issue
        CI-->>Pessoa: o check falha
    end
```

Os componentes que não têm repositório próprio, como o banco de grafos, o gateway, o cluster, o monitoramento e a entrega contínua, ficam numa tabela compartilhada mantida aqui.
