# Complemento do Diário de Bordo — 2026-10-11

Este arquivo é um complemento cronológico ao `docs/DIARIO_DE_BORDO.md`. Ele registra a continuidade da auditoria GPS/consumo sem reescrever o histórico anterior.

## Correções implementadas nesta etapa

Branch: `fix/gps-distance-consumption-2026-10-11`

- `src/trip/tripRecorder.ts`: rejeita amostras com timestamp inválido, duplicado ou atrasado antes de modificar estado.
- O contador de distância GPS pode reiniciar sem apagar a distância já acumulada; a amostra passa a ser a nova referência para incrementos futuros.
- Distância GPS inválida não substitui a última referência válida.
- O gravador mantém precisão interna completa e arredonda a distância apenas ao expor o estado, evitando perda cumulativa de segmentos pequenos.
- Viagens observadas com distância curta ou telemetria de combustível insuficiente são mantidas como `REAL_OBD` incompletas, com `dataQuality: INCOMPLETE` e motivo explícito. Não é publicada média km/L válida sem distância suficiente, ao menos duas amostras válidas e 0,05 L integrados.
- `tests/tripRecorder.test.js`: regressões para timestamps atrasados/duplicados, reset GPS, distância inválida, timestamp inválido, viagens curtas, ausência de combustível e arredondamento de segmentos submétricos.
- `docs/GPS_DRIFT_AND_DISTANCE.md`: documentação alinhada ao comportamento pretendido e aos limites da validação.

## Referência do veículo

O perfil técnico da Meriva MY12 já usa `tankCapacityL: 56` e `reserveCapacityL: 5`. Os cerca de 5 L de reserva são parte dos 56 L totais, não um volume adicional. O valor de reserva é aproximado e não deve ser usado como limiar exato de leitura do PID 012F.

## Validação e pendências

- **CI não disparada**, conforme a restrição vigente.
- Testes automatizados, TypeScript, Expo Doctor e build Android ainda não foram executados nesta etapa.
- A validação física com Meriva/ELM327 e trajeto GPS permanece pendente.
- O histórico diário de sessões ECU continua sendo mantido separadamente em `VIAGENS/meriva_smart_daily_obd_history.txt`; o TXT diário é resumo de sessões, enquanto CSVs são a trilha amostral.
- Próxima auditoria: confirmar todos os consumidores de `avgFuelConsumptionKml` para garantir que registros incompletos sejam apresentados como N/D em todas as telas/exportações; revisar limites de integração de combustível e lifecycle GPS; depois validar tudo em conjunto antes de abrir/atualizar PR ou disparar CI.

## Commits desta etapa

- `666e988a9f31f5c96d96b54bb8c95df8aa68911c` — proteção de distância GPS e preservação de viagens incompletas.
- `330c0579434ec3be91579b92d8f678168917bf6b` — evitar perda de distância por arredondamento acumulado.
- `4137e50153031886bb724f09c55e8306d5220fe9` — testes para reset GPS, timestamps e viagens incompletas.
- `7d49a62ca9400a0bbd0e6f8811e63b4c41f4e246` — amostras de teste com distâncias fisicamente mais plausíveis.
- `fcc6dbb4d02d4a644b3dee0838e00fec26b26e80` — teste de regressão para segmentos pequenos.
