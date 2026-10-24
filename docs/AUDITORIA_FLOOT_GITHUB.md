# Auditoria Floot → GitHub — Meriva Smart Diagnostic

Data: 2026-10-24
Projeto Floot: `d7b3d690-ae63-40ff-a35c-0f5ac5014d81`
Branch: `feat/port-floot-layout-20261024`

## Escopo auditado

- Tela principal `pages/_index.tsx` e estilos `pages/_index.module.css`.
- Navegação icon-only de seis seções.
- Regras de estados de conexão Bluetooth e ECU.
- Fórmulas e testes OBD em `helpers/obdPidFormulas.tsx`.
- Testes UX `helpers/dashboardUx.spec.tsx`.
- Diretrizes de projeto em `static/__dev/system-prompt.md`.
- Cockpit Android `app/index.tsx`, ícones compartilhados e testes de navegação/regressão.

## Melhorias integradas à branch

- Cockpit Android atualizado para a marca visual `MERIVA SMART`.
- Barra inferior operacional expandida de cinco para seis destinos, incluindo Conexões Bluetooth/ECU.
- Ícones inferiores ampliados de 22 para 28 dp, mantendo a navegação sem legendas visíveis.
- Distribuição horizontal uniforme e área de toque existente preservada.
- Rótulos e dicas de acessibilidade mantidos para leitores de tela.
- Teste de navegação atualizado para exigir os seis destinos e ícones ampliados.
- Prévia visual nativa `app/floot-layout.tsx` mantida como referência independente; não substitui os serviços reais do cockpit.
- Dados continuam dependendo de leituras reais; nenhum estado visual simula uma conexão OBD confirmada.

## Achados da auditoria

1. **Risco de regressão se a tela fosse substituída integralmente:** o cockpit Android contém conexão ELM327, atualização de telemetria, validação de frescor das leituras, autonomia, temperatura, DTC e histórico. A integração foi feita de modo incremental para preservar esses fluxos.
2. **Diferença de navegação:** a tela web do Floot já tinha seis botões acessíveis; a tela nativa tinha cinco. Corrigido na branch.
3. **Risco de estado falso:** o protótipo web declara explicitamente que a conexão é demonstrativa. Essa regra foi preservada; a tela Android segue ligada aos serviços reais.
4. **Fórmulas OBD:** fórmulas e limites verificados no protótipo incluem trim de combustível, erro EGR e timing de injeção. Os testes de borda existentes passaram; a integração não alterou fórmulas nem dados.
5. **Limitação de validação visual:** a captura automática do Floot não foi concluída porque não havia janela de preview aberta. É necessária revisão visual no preview e em Android físico antes de mesclar.

## Validação

- Floot TypeScript: passou.
- Floot testes selecionados de UX, fórmulas e tema: 3 arquivos passaram, 0 falharam.
- CI GitHub da branch: pendente no momento da atualização.
- Teste físico com adaptador ELM327: não realizado.
- Merge na `main`: não realizado.

## Critérios antes do merge

1. CI completa aprovada (typecheck, conjunto completo de testes e build Android configurado).
2. Verificar os seis ícones em retrato e paisagem, sem legendas visíveis e sem colisão com safe area.
3. Confirmar que o botão Conexões abre `/bluetooth` e que os demais destinos mantêm o fluxo existente.
4. Confirmar que Bluetooth conectado nunca é apresentado como ECU conectada sem resposta OBD válida.
5. Teste físico de conexão, leitura dos PIDs, autonomia, DTC e gravação de viagem antes da publicação.
