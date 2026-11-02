<p align="center">
  <img src="../assets/readme/banners/hono.png" alt="Hono" width="100%">
</p>

# Situação atual

O levantamento de 2026-11-01 usa a main `4c1b1b2e3a6183e9f5d78ac6fbfa2e698811c218` do repositório de origem. Ele descreve o código versionado, sem inferir disponibilidade dos ambientes.

## Implementado

Os comportamentos estão cobertos pelo código e pelos testes versionados.

- 2026-11-01. Webhook, prévia, autenticação Bearer, validação do corpo, intervalo e teto de criação estão implementados.
- 2026-11-01. Há coordenação serial por chave, marcação de recuperação, vínculos entre tickets e avisos opcionais por e-mail e Telegram para parte dos alertas recebidos do Grafana.
- 2026-11-01. Heartbeat, sondas, cron de cinco minutos e leitura da pausa do cluster estão implementados.
- 2026-11-01. O snapshot de roteamento é gerado dos arquivos dos serviços e da tabela compartilhada. O teste usa fixtures versionadas. O CI e um workflow diário fazem a comparação com os arquivos remotos da main dos serviços.

## Limites

Os limites abaixo fazem parte da implementação analisada.

- 2026-11-01. A recuperação não muda o status do ticket no Jira, e o encerramento é manual, feito pelos desenvolvedores do espaço de destino.
- 2026-11-01. A prévia não consulta o Jira nem aplica intervalo, teto ou pausa. Ela representa o conteúdo previsto.
- 2026-11-01. A consulta de criação usa histórico de trinta dias limitado a cem tickets. A recuperação procura até cinquenta tickets ainda não marcados dentro dessa janela.
- 2026-11-01. Uma falha parcial do lote retorna 503 depois de possíveis escritas no Jira. A nova tentativa usa o histórico para limitar duplicações, mas não é uma transação entre tickets, comentários e e-mail.
- 2026-11-01. O monitor chama a coordenação Jira diretamente e não passa pelo envio de e-mail do webhook. Seus incidentes H01 e S01 não recebem e-mail por esse caminho.
- 2026-11-01. Durante pausa, as sondas não incrementam nem zeram os contadores anteriores. Quando voltam, uma falha pode continuar a contagem anterior. A carência de trinta minutos é aplicada aos alertas do Grafana com `silence_on_pause`, não às sondas.
- 2026-11-01. Não há trava global para sobreposição entre cron e `/monitor/run`. O estado usa leituras e escritas individuais, enquanto a coordenação de cada incidente é serializada separadamente.
- 2026-11-01. O Telegram substitui o WhatsApp como canal de aviso rápido.

## Padrões e operação

As diferenças precisam ser consideradas pelos consumidores.

- 2026-11-01. O health responde `status=ok`, não publica versão e não há `/ready`.
- 2026-11-01. Não há OpenAPI ou Swagger. Os erros usam `code` e `message`, sem os campos obrigatórios completos do padrão comum.
- 2026-11-01. O serviço está em operação em produção, com o contato de heartbeat, as regras, as permissões do Jira e os destinatários de e-mail configurados.
