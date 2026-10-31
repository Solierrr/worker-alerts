# Coleção Bruno: generic-template

Abra a pasta `http/` como uma coleção Bruno e selecione o ambiente `local`. Ajuste a URL base em `environments/local.bru` para a porta usada pelo serviço.

Organize as requisições em subpastas com nomes em inglês por domínio ou recurso e use nomes numerados no formato `NNN-verbo-rota.bru`. A coleção inclui exemplos de health, login e operações REST sobre tasks; ajuste rotas, payloads e autenticação ao contrato do serviço. Marque no nome com `[mutates]` as operações que criam, atualizam, removem dados, iniciam fluxos ou chamam rotas internas. Inclua em `docs {}` o efeito relevante da operação para que quem for executá-la possa revisar antes.

Credenciais, tokens e chaves de API devem ficar vazios no ambiente versionado. Preencha-os localmente no Bruno e não faça commit desses valores. Use IDs de exemplo sintaticamente válidos e substitua-os por IDs existentes no banco local quando necessário. Após executar o login, copie localmente o token retornado para `userToken` antes de chamar as rotas autenticadas.

A coleção não executa requisições automaticamente. Confira o efeito de cada chamada antes de enviá-la e mantenha os exemplos alinhados ao contrato real da API. Consulte o template canônico em [`docs-warehouse/templates/http/`](https://github.com/Solierrr/docs-warehouse/tree/main/templates/http).
