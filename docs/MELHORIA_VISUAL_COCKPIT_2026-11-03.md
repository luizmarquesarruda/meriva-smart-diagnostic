# Melhoria visual do cockpit — 2026-11-03

## Escopo desta fase

Ajustes exclusivamente visuais e de acessibilidade na tela inicial:
- ampliar os alvos da navegação inferior em retrato para 64 dp;
- elevar a legibilidade dos rótulos de métricas e dos quadrantes;
- preservar o tema centralizado em `src/ui/theme.ts` e o layout adaptativo existente.

## Limites de segurança

Esta fase não altera Bluetooth Classic, seleção/inicialização ELM327, validação da ECU, comandos OBD-II, interpretação de PIDs, GPS, viagens, autosave, banco de dados ou histórico TXT.

A autonomia continua vindo de `getCurrentAutonomyRangeKm` e do estado real da viagem/ECU. Nenhum dado demonstrativo do protótipo MagicPath deve ser conectado ao aplicativo como telemetria.

## Testes e validação

- Foram adicionadas asserções ao teste `tests/screenTheme.test.js` para impedir regressão nos tamanhos mínimos de alvos e rótulos.
- Execução local da suíte e CI: **não validados nesta etapa**.
- Inspeção física no Samsung Galaxy A06 / Android 16, com fonte ampliada e retrato/paisagem: **não validada**.

## Próximos critérios

1. Executar `npm run doctor`, `npm run gate:baseline` e `npm run validate`.
2. Conferir legibilidade em escala de fonte ampliada e zoom do sistema.
3. Confirmar áreas de toque e navegação com gestos e três botões no Galaxy A06.
4. Só então ampliar o redesign para os demais módulos, uma fase por PR.
