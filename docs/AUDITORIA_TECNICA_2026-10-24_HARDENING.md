# Auditoria técnica integral — hardening do repositório

**Data:** 2026-10-24  
**Repositório:** `luizmarquesarruda/meriva-smart-diagnostic`  
**Branch das correções:** `fix/repository-audit-hardening-20261024`  
**Status da entrega:** alterações implementadas; CI deve ser confirmada no HEAD final; nenhuma mesclagem executada.

## Escopo revisto

Inventário de `main` (167 arquivos no snapshot consultado) e leitura focada nos caminhos críticos: parser e fórmulas OBD-II, descoberta de PIDs, transporte Bluetooth/ELM327, DTC, consumo/autonomia, GPS, gravação de viagens, CSV, cota de armazenamento, backup, autosave e CI.

## Defeitos confirmados e correções

| Área | Risco confirmado | Alteração |
|---|---|---|
| Parser K-Line | Envelope `48 6B 10` aceitava byte terminal sem verificar checksum. | Checksum aditivo de 8 bits validado nas respostas PID compactas e espaçadas; fixtures válidas corrigidas e checksum incorreto rejeitado. |
| DTC | Normalização do fluxo inteiro podia combinar linhas de ECUs diferentes e enquadramento CAN era insuficientemente verificado. | Parser por linha; validação de resposta direta, comprimento single-frame CAN e checksum K-Line; deduplicação de códigos. |
| Histórico de viagens | Falha de leitura podia levar a sobrescrever o índice com uma lista vazia. | Gravação temporária validada, cópia anterior, recuperação via backup, erro explícito se não houver índice recuperável e fila por arquivo para evitar atualizações concorrentes perdidas. |
| CSV de viagens | Data de partição era baseada em UTC; novos campos podiam não seguir o cabeçalho existente. | Data local da viagem; migração de cabeçalho com parser CSV que preserva colunas, valores e linhas pré-existentes. |
| Fila CSV | Crescimento sem limite durante falha prolongada de escrita. | Limite de 10.000 linhas; contador de descartes, status de fila e visualização na tela de armazenamento. Falha de escrita continua explícita. |
| Cota | Erros ao calcular tamanho eram convertidos em zero; a meta de limpeza não era efetivamente aplicada. | Erros de tamanho propagados; limpeza por arquivo mais antigo até a meta possível, restrita a LOGS/LEITURAS. A tela apresenta falha de verificação com estado crítico. |
| Backup | Não havia verificação forte, manifesto ou rotação. | Flush antes da cópia, comparação de tamanhos, manifesto validado, remoção da pasta parcial em erro e retenção dos cinco backups mais recentes. |
| Autosave | Validação superficial de subestruturas permitia estados malformados até a hidratação. | Checagens profundas para envelope/schema, timestamp, leituras, DTCs, viagens, autonomia, discovery e configurações; hidratação de defaults seguros para estruturas parciais. Migração de schema antigo é preservada quando existe função registrada. |
| GPS | Coordenadas fora da faixa e precisão ausente podiam ser tratadas como evidência confiável. | Rejeita latitude/longitude inválidas; precisão nula/não finita/negativa não conta como fix válido; Haversine devolve NaN para coordenadas inválidas. |
| Estimativa de combustível | Temperatura absoluta inválida e resultados numéricos não finitos não eram barrados em todas as rotas. | Guarda para temperatura Kelvin, taxa calculada finita/positiva e integração de combustível não finita. |
| Fila de DTC | Referência de promise concluída podia permanecer no mapa por comparação de promises diferentes. | Fila liberada corretamente ao final da gravação. |
| RX Bluetooth | Acúmulo de dados sem limite e chunks grandes nos diagnósticos. | Limite RX 16 KiB, erro e descarte explícitos após overflow, previews de 256 caracteres e recuperação na próxima resposta válida. |
| Descoberta de PIDs | Necessidade de buffer explícito de respostas na sessão. | FIFO volátil limitado (64 por padrão; 1–256 configurável), normalização, cópia defensiva e isolamento entre descobertas. |

## Testes adicionados/alterados

- `tests/pidParserIntegrity.test.js`: checksum K-Line PID válido/inválido.
- `tests/dtcScanner.test.js`: CAN single-frame e comprimento declarado, múltiplas ECUs em linhas distintas, checksum K-Line válido/inválido.
- `tests/regression.test.js`: buffer de descoberta, overflow RX, integração do buffer, concorrência/recuperação do índice de viagens, migração CSV, cota e backup.
- `tests/merivaAutosave.test.js`: validação de envelope e subestruturas malformadas, hidratação parcial e migração do schema antigo.
- `tests/gps.test.js`: coordenadas inválidas e drift com precisão desconhecida.
- `tests/fuelConsumption.test.js`: temperaturas fisicamente impossíveis e overflow de taxa MAF/MAP.
- `tests/projectBaseline.test.js`: contratos que impedem remoção acidental de proteções críticas.
- `docs/TEST_PLAN.md`, `docs/RELATORIO_PIDS_E_FORMULAS.md` e contrato anti-regressão atualizados.

## CI e resultado

A CI é o critério final para o HEAD entregue. Os primeiros ciclos revelaram problemas nos próprios testes/fixtures:
1. O fixture K-Line DTC usava checksum incorreto e foi substituído pelo valor correto.
2. O teste de cota ainda esperava comportamento antigo; foi alterado para validar que a limpeza reduz a ocupação e que erro de leitura de tamanho é propagado.
3. A validação de autosave foi ajustada para não impedir uma migração de schema 0 registrada no sistema de migração.

**Não marcar o lote como concluído até que a CI do HEAD final termine com `validate` e `android-build` verdes.** A URL da execução precisa corresponder ao mesmo SHA consultado na branch.

## Pendências que não podem ser resolvidas por testes sintéticos

- Teste em Android físico com ELM327 emparelhado à Meriva: conectar, reiniciar protocolo, executar PIDs/DTCs, desconectar/reconectar e confirmar que as respostas não se misturam.
- Comparar quadros K-Line RAW reais com checksum calculado; confirmar o perfil de enquadramento de variantes do adaptador.
- Confirmar na ECU real quais PIDs respondem e validar precisão, sobretudo 012F (nível de combustível), 0110 (MAF), 015E (taxa medida) e candidatos do catálogo.
- Comparar consumo estimado por MAF/MAP com PID 015E medido, quando suportado.
- Inspecionar o APK instalado, rotação, permissões, GPS opcional e comportamento em segundo plano.
- Testar restauração de backup no dispositivo, não apenas criação e manifesto.
- A migração do Expo SDK 51 ficou numa issue separada para evitar misturar risco de plataforma com correções de integridade: [Issue #88](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/issues/88).

## Política de integração

Este trabalho está em branch e PR separados. Não houve merge nem alteração direta de `main`. A integração deve ocorrer apenas após CI final verde, revisão do diff e autorização de merge.

## Continuidade da auditoria de estabilidade — 2026-10-25

### Evidência de integração
- A API informa `protected: false` para `main` e a listagem de rulesets retorna vazia. Checks obrigatórios na branch principal não estão confirmados; a consulta detalhada de proteção retornou 403 para a integração disponível e nenhuma regra foi alterada.
- PR #89 e PR #90 alteravam os mesmos três arquivos de conexão/splash. CIs verdes em SHAs individuais não validavam a combinação. A recuperação de rádio está consolidada na #89 com política pura e teste determinístico.
- PRs #82 e #83 dividem nove arquivos, discordam sobre navegação em paisagem e diferem entre 20 e 25 PIDs; #83 compartilha 17 arquivos com #89. A integração combinada continua pendente.
- PR #81 usa DB-109 para o PID 0144; a branch #89 usa DB-109 para outra entrada. IDs são únicos por branch, mas não globalmente únicos ao combinar históricos independentes.

### Correção Bluetooth
- Criada política pura `src/obd/bluetoothRadioRecovery.ts` para rádio ligado, desligado e indeterminado, reconhecendo mensagens nativas como `mAdapter is not enabled`.
- O transporte consulta o rádio antes de cada socket e depois de falha; fallback só continua se a chamada anterior terminou e o rádio foi confirmado ligado.
- Manager interrompe retries quando o erro indica rádio desligado ou estado não confirmado; os logs reportam tentativas reais e a causa terminal.
- Splash preserva a causa e permite abrir o painel manual.
- Criado `tests/bluetoothRadioRecovery.test.js`; conectado ao `npm test` e ao gate. O gate também protege suítes críticas adicionais e a sequência/índice do diário.

### Pendências
- As execuções anteriores [run 40138131245](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40138131245) e [run 40171897065](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40171897065) foram verdes em SHAs anteriores. O novo SHA precisa da própria CI.
- A proteção de `main` com required checks precisa ser configurada no GitHub; a integração atual não permite alterar branch protection (403).
- Teste físico no Galaxy A06/Android 16 com ELM327 e ECU reais, descoberta de PIDs e autonomia em percurso continuam pendentes. Nenhum merge foi feito.


## CI regressiva, iterações e cobertura de testes — 2026-10-25

- A CI identificou três defeitos introduzidos durante a consolidação e eles foram corrigidos sem remover/relaxar os testes: regex do gate do diário com escape duplo; erro TypeScript por acesso a propriedade de valor `unknown`; e corrida RFCOMM causada por um `await` entre a leitura do bloqueio compartilhado e a criação do socket.
- `tests/regression.test.js` detectou a corrida ao exigir `bluetoothMaxNativeConnections === 1`; a verificação do rádio foi movida antes de `pendingNativeConnections.get(addressKey)`, preservando a região sem `await` antes de registrar a tentativa nativa. A CI de validação passou para o SHA `2a5117a5566a0f993e7a45a20c19d0d92671b9c8`; o build Android desse SHA ainda estava em andamento.
- O gate agora exige que todo `tests/*.test.js`, com exceção do próprio baseline executado em um passo separado, apareça em `npm test`. Também valida sequência completa e índice do diário.
- Como o gate e o diário foram modificados após essa CI, o novo SHA deve passar novamente em `validate` e `android-build`; resultados anteriores não são reutilizados como aprovação.



## Concorrência RFCOMM com múltiplos waiters e IDs de contrato — 2026-10-25

- A sonda assíncrona de rádio não pode ficar entre a leitura de `pendingNativeConnections` e a chamada a `connectToDevice`; a CI identificou a regressão porque duas instâncias abriram sockets simultâneos.
- A primeira correção moveu a sonda para antes do bloqueio compartilhado. Auditoria adicional mostrou que três instâncias podem aguardar a mesma promessa e acordar juntas, portanto o transporte agora revalida rádio/bloqueio em loop depois de cada espera. O teste passa a exercitar três instâncias e exigir no máximo um socket nativo ativo.
- Revisão do contrato identificou IDs RG-34 e RG-35 duplicados introduzidos durante a consolidação. Renumerados para RG-34…RG-37, e o baseline agora reprova se houver IDs RG duplicados, lacunas ou ordem incorreta.
- Nova CI é obrigatória para o SHA resultante; nenhum resultado de um SHA anterior é reutilizado como aprovação.


## Correção adicional de integridade temporal do GPS — 2026-10-25

- A auditoria do diff identificou fallback de `location.timestamp` inválido para `Date.now()`. O fallback fazia dados malformados parecerem atuais e podia tornar inválido o intervalo da próxima amostra.
- O rastreador agora descarta timestamp não finito/não positivo e fixes com tempo menor/igual ao último fix válido, sem alterar o estado. O teste cobre descarte e recuperação.
- Contrato RG-38 e caso GPS-02 foram adicionados; o baseline verifica que o fallback não retorne.
- O HEAD anterior estava com `validate` verde e `android-build` em execução; esta alteração exige CI própria do início ao fim.


## Correção do caminho de gravação CSV — 2026-10-25

- O logger declarava incorretamente que `writeAsStringAsync` da API legada não suportava append. A documentação do FileSystem legado contém `WritingOptions.append`.
- A reescrita integral por lote foi substituída por append quando o esquema não muda. A validação do cabeçalho continua; migração de esquema ainda relê e reserializa todas as linhas para manter colunas alinhadas.
- O teste prova que o caminho comum não lê o histórico inteiro, usa append nativo e mantém o lote após falha de escrita. O novo SHA precisa passar em CI, inclusive build Android.


## Otimização CSV avaliada, mas não aplicada — 2026-10-25

- Foi identificada uma oportunidade de desempenho: no esquema estável, `src/database/csvLogger.ts` lê e reescreve o histórico integral em cada flush.
- A proposta de usar `append: true` foi rejeitada pela CI de TypeScript: `WritingOptions` da versão instalada `expo-file-system` 17 / SDK 51 não expõe essa opção. A documentação consultada foi redirecionada para uma versão posterior e não comprova compatibilidade da versão fixada.
- O patch experimental foi revertido; o código não mascara o erro de tipo. A dívida de desempenho permanece documentada até uma migração compatível ou segmentação do log, incluindo testes de exportação, migração de cabeçalho e recuperação de escrita.
- A CI do SHA final após a reversão precisa concluir `validate` e `android-build`. Nenhuma aprovação de um SHA anterior é reutilizada.
