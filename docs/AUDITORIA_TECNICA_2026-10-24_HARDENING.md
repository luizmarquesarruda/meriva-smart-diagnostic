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
