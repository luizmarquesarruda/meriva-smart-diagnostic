# Auditoria de buffers e filas — 2026-10-26

## Escopo e referência

- Repositório: `luizmarquesarruda/meriva-smart-diagnostic`.
- HEAD anterior a DB-153: `80fdb6ffe0a32b8cb1d402466b091b5b448fcf47` (DB-152); HEAD DB-153: `b0864f7e7f8005c95a7da85867d68e9be58b9604`.
- A CI [40318919363](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40318919363) validou DB-153. As execuções intermediárias seguintes encontraram e documentaram regressões no gate ELM, no tipo FileInfo, na contagem da fila e na asserção multilinha; DB-155…DB-158 corrigiram esses pontos. A CI [40323823689](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40323823689) passou validate e android-build no HEAD anterior d0437327d02eca1f7443561bf4c5deff14bcc3ac. DB-159 modifica autonomia e exige CI nova no SHA resultante.
- Esta auditoria separa buffers de amostragem (para ruído/mediana), buffers de transporte (para serializar/limitar carga) e buffers de persistência (para lote/recuperação). Não se deve reutilizar a mesma política para todos.

## Resultado por subsistema

| Subsistema | Situação encontrada | Decisão |
|---|---|---|
| Autonomia/combustível | AutonomyBuffer já limitava a dez níveis reais do PID 012F e dez intervalos de fluxo/distância; antes de DB-159 a janela de nível não tinha limite global de idade e lacunas >10 s podiam deixar intervalos anteriores no buffer. O integrador da viagem também não registrava lacunas longas como motivo de invalidação. | **Aprimorado em DB-159.** Nível usa no máximo dez leituras dos últimos 60 s. Amostra de fluxo inválida, origem/timestamp incoerente, lacuna >10 s ou falta de atualização >10 s limpa a janela móvel; ela só retorna após dez novos intervalos. A viagem é marcada como consumo inválido após lacuna >30 s, e o fallback do tanque cheio rejeita viagens pequenas/incoerentes/sobrepostas. Sem alegar calibração física do PID 012F. |
| Descoberta de PIDs | `PidDiscoveryBuffer` é FIFO limitado por execução (padrão 64), normaliza IDs e rejeita comandos não PID. A instância não é reutilizada entre ECUs/sessões. | **Não ampliar.** A separação por sessão e a evidência RAW são mais importantes que reutilizar respostas antigas. Bitmaps continuam sendo anúncio, não prova de suporte. |
| Telemetria ao vivo | Cada PID já tinha um limite de 120 pontos, mas o mapa total de séries não tinha cota e aceitava chaves de PID não validadas. | **Corrigido nesta rodada.** Só IDs Mode 01 `01XX` são aceitos; no máximo 64 séries ficam na memória. A série menos recentemente usada é removida junto com seu índice `latest`. O limite potencial passa a 64 × 120 amostras. |
| Cockpit/alertas | O cockpit já seleciona a leitura real mais recente, rejeita timestamp inválido/futuro e transforma dados vencidos em N/D. Os alertas se baseiam no valor atual válido. | **Não suavizar alertas com média/mediana sem critério físico.** Um buffer de suavização pode atrasar temperatura alta, tensão anormal ou baixa reserva. Histórico de tendência já existe separadamente em `liveTelemetry`. |
| GPS/distância | `GpsTracker` calcula segmentos entre fixes precisos, exige amostras móveis consecutivas e acumula distância pendente até confirmar movimento. Fixes fora de ordem, muito separados ou imprecisos não servem de base. | **Não adicionar janela móvel de coordenadas agora.** Suavização geográfica pode atrasar velocidade, apagar curvas ou somar distância incorretamente. Só adotar com trilhas reais de teste, perfil de precisão e métricas de erro. |
| Consumo/viagem | O consumo da viagem integra amostras válidas e o buffer de autonomia integra velocidade e taxa de combustível. O serviço serializa cada ciclo de polling e limita a idade de leituras de contexto. | **Não criar outro buffer paralelo.** Duplicaria estados e poderia somar de novo combustível/fluxo em cache. |
| Bluetooth/ELM327 | `Elm327Session` serializa comandos por Promises; o monitor de saúde impede ciclos sobrepostos. | **DB-157 corrige a contagem.** A vaga ativa é reservada sincronicamente e a profundidade mede apenas comandos que aguardam. Até 16 comandos ordinários pendentes; excessos recebem `ELM_COMMAND_QUEUE_FULL`. Fechamento e recuperação são reservados. Snapshot fornece profundidade, pico, rejeições e espera. A CI anterior detectou capacidade efetiva abaixo do contrato; o novo SHA precisa repetir o teste. |
| Logs CSV | Já existe fila por arquivo, lotes por tempo/contagem, limite de 10.000 linhas pendentes e restauração do lote em falhas. A API legada do Expo FileSystem reescreve o segmento ativo. | **Corrigido nesta rodada.** Arquivos de alto volume em `LOGS/` rotacionam por volta de 1 MiB em segmentos com cabeçalho próprio. Isso limita o tamanho reescrito por flush e deixa os segmentos anteriores intactos. CSVs de viagens permanecem compatíveis. A saturação da fila continua contabilizada. |
| Autosave/histórico | Leituras recentes já têm limite de 50 por estado; histórico de séries ao vivo tem limite por PID; persistências de aprendizado/histórico usam serialização/deduplicação. | **Sem novo buffer genérico.** Manter cota e consistência na camada dona dos dados; não duplicar os mesmos registros entre buffers paralelos. |

## Alterações aplicadas

1. `src/obd/liveTelemetry.ts` valida `01XX` e mantém no máximo 64 séries PID ativas, com até 120 amostras por série.
2. A fila ELM327 expõe métricas de espera e profundidade e aplica backpressure com limite de 16 comandos ordinários pendentes. Rejeições são explícitas; fechamento e recuperação mantêm acesso reservado à fila.
3. Logs de alto volume em `LOGS/` são particionados em segmentos de aproximadamente 1 MiB, cada um com cabeçalho consistente. A rotação preserva os arquivos anteriores e mantém o caminho não segmentado de CSVs de viagens.
4. `tests/liveTelemetry.test.js` cobre a cota LRU; `tests/regression.test.js` cobre saturação/serialização ELM e rotação CSV em duas fronteiras.
5. `docs/CONTRATO_ANTI_REGRESSAO.md`, `docs/TEST_PLAN.md`, `CHANGELOG.md` e o Diário de Bordo registram as regras e a aceitação.
6. DB-155 atualiza o gate ELM e corrige escapes LF/CR. DB-156 confirma `FileInfo.exists` antes de ler `size`. DB-157 separa a vaga ativa das pendentes. DB-158 atualiza o gate para conferir o bloco `finally` multilinha.
7. DB-159 limita temporalmente a mediana de combustível, invalida janelas móveis após lacunas e protege o balanço por tanque cheio contra viagens com integração incompleta ou inconsistente.

## Critério de encerramento

- node tests/autonomyBuffer.test.js, node tests/fuelConsumption.test.js, node tests/tripRecorder.test.js, node tests/fuelBalance.test.js, node tests/projectBaseline.test.js, TypeScript e a suíte completa precisam passar no SHA final.
- A CI da PR #92 valida o novo SHA, incluindo TypeScript, suíte completa, gate anti-regressão e APK Android standalone.
- Isso não substitui validação física de GPS, Android, ELM327 ou ECU. Não foram feitas medições físicas de precisão neste lote.
