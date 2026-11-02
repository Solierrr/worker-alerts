<p align="center">
  <img src="../assets/readme/banners/hono.png" alt="Hono" width="100%">
</p>

# Registro de recuperação

Quando chega um alerta `resolved`, a coordenação procura tickets do mesmo projeto e chave que ainda não tenham o rótulo de recuperação. O fim do alerta fica registrado sem alterar o status do atendimento. A implementação está em [service.ts](https://github.com/Solierrr/worker-alerts/blob/main/src/incident/service.ts).

```mermaid
sequenceDiagram
 participant G as Grafana Cloud
 participant W as Worker
 participant D as Coordenação do incidente
 participant J as Jira
 G->>W: HTTPS com Bearer e alerta resolved
 W->>D: Encaminha incidente normalizado
 D->>J: HTTPS com Basic e busca por chave
 alt Nenhum ticket encontrado
 J-->>D: Lista vazia
 D-->>W: no_open_ticket
 else Existem tickets sem marca de recuperação
 J-->>D: Até cinquenta tickets dos últimos trinta dias
 loop Para cada ticket encontrado
 D->>J: Acrescenta rótulo inc-resolvido
 D->>J: Comenta fim e duração
 end
 D-->>W: end_recorded e chaves
 W->>W: Tenta e-mail e Telegram elegíveis
 end
 W-->>G: HTTP 200 com resultados
```

## Casos de erro

A recuperação e o fechamento do atendimento têm efeitos diferentes.

- Se o ambiente diverge, a ação é `ignored_env`.
- Uma falha de busca, marcação ou comentário devolve 503 pelo webhook. Uma escrita anterior pode já ter ocorrido.
- A pausa não bloqueia os sinais de recuperação recebidos do Grafana.
- O status do ticket continua dependente de decisão humana, e o encerramento é feito manualmente pelos desenvolvedores.
