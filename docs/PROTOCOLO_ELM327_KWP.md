# Protocolo ELM327 / ISO 14230-4 KWP — contrato operacional

Atualizado em 2026-10-16. Este documento descreve o comportamento implementado nesta branch; não é uma certificação do adaptador físico.

## Estados
- Bluetooth desligado/desconectado: não existe socket utilizável.
- Adaptador conectado: RFCOMM existe, mas isso isoladamente não comprova resposta da ECU.
- ECU respondendo: houve resposta válida recente em sessão real.
- Recuperando/sem resposta: a última sonda falhou ou a recuperação está em curso. A UI não deve mostrar a ECU como conectada neste estado.

## Serialização
Todos os comandos ELM devem passar por `Elm327Session.executeCommand` e sua fila única. A recuperação agora entra na mesma fila para evitar intercalar ATZ/ATSP com consultas de telemetria. A identificação do protocolo acontece após liberar a fila, evitando espera circular.

## Monitoramento e recuperação
- Monitor de saúde: tick a cada 2,5 s.
- KWP: TesterPresent `3E00` com timeout de 2,5 s.
- Sonda real de RPM `010C`: timeout de 2,5 s a cada quatro ticks (~10 s).
- Três falhas consecutivas: tentar recuperação.
- Primeira tentativa: `ATWS` (warm start), seguida de `ATE0`, `ATL0`, `ATS0`, `ATH0`, seleção do protocolo, `0100` e `010C`.
- Se o warm start falhar, usar `ATZ`, aguardar 1,2 s e repetir a configuração/sonda.
- Se a recuperação falhar, fechar a sessão e iniciar reconexão com backoff existente de 2 s, 5 s e 15 s.

Comandos AT opcionais não suportados são tolerados durante a configuração; a seleção de protocolo e a resposta real de `010C` continuam obrigatórias.

## Limitações conhecidas
- A seleção KWP FAST persistente e o fallback automático após duas recuperações malsucedidas ainda não estão implementados como estado persistente entre sessões.
- A leitura e a reconexão continuam no processo JS/Expo. O branch principal não versiona um módulo Java Android próprio para executar o polling Bluetooth em foreground service.
- O timeout curto e o uso de `3E00` precisam ser validados no ELM327 real. Adaptadores clonados podem ter implementações distintas de ATWS e TesterPresent.
- A temporização P3 depende do protocolo e da ECU; o intervalo de 2,5 s é uma política do monitor, não uma prova de conformidade ISO.

## Testes obrigatórios antes de aprovar
- Mock: três falhas, ATWS suportado/não suportado, recuperação por ATZ, socket fechado, reconexão concorrente e limpeza de timers/listeners.
- Físico: 10 min parado e 30 min urbano com autosave e logs brutos de TX/RX; registrar adaptador e protocolo negociado.
- TypeScript, testes e build Android: ainda não executados nesta etapa.
