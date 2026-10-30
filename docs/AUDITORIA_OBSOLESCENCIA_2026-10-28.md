# Auditoria de itens obsoletos — MERIVA SMART

**Data:** 2026-10-28  
**Repositório:** [luizmarquesarruda/meriva-smart-diagnostic](https://github.com/luizmarquesarruda/meriva-smart-diagnostic)  
**Frente:** [PR #96](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/96)  
**Base examinada:** `bd44575d633129ec85e288883e7376cbda2b105f` antes das alterações desta auditoria.

## Resultado executivo

Foram corrigidas divergências documentais sobre o inventário de telas e o framing ELM. A hipótese de que o rótulo nativo deveria mudar para MERIVA SMART foi rejeitada pelo gate: o app precisa continuar genérico para veículos configuráveis. Nenhum componente foi apagado apenas por parecer antigo pelo nome. O maior débito de obsolescência é a plataforma: Expo SDK 51 e a API antiga do FileSystem precisam de um projeto de atualização separado e testável.

## Achados e ações

| ID | Severidade | Achado | Ação |
|---|---|---|---|
| OBS-01 | Verificado — não é obsolescência | Nome nativo `Smart OBD Diagnostic` difere da marca/repositório MERIVA SMART. O baseline contém um contrato explícito para não prender o app a um único veículo. | Mantido o nome genérico em `app.json`; README explica a distinção entre identidade do projeto e label do app. O teste anti-regressão foi preservado. |
| OBS-02 | P1 | README mantinha um bloco datado de gatilho de CI e descrevia delimiter CR, contrariando o transporte atual. | Removida seção/meta obsoleta e duplicada. |
| OBS-03 | P1 | Revisão ELM antiga afirmava delimiter CR, 2 tentativas/infinito e ATI obrigatório. | Corrigida contra o código/catalogação atuais. |
| OBS-04 | P2 | Arquitetura documentava quatro áreas fixas e DTC no cockpit. | Corrigida para as rotas reais e para DTC na tela Saúde. |
| OBS-05 | P1 — dívida, não removida | Expo SDK 51 / React Native 0.74.5 estão muito atrás do SDK 58 anunciado em outubro de 2026. | Registrado plano de modernização isolado; sem upgrade arriscado nesta PR. |
| OBS-06 | P1 — dívida, não removida | Métodos antigos do FileSystem estão cobertos pela API de compatibilidade/legacy das versões atuais. | Migrar junto de upgrade de SDK, com cobertura de persistência/backup/CSV e testes de migração. |
| OBS-07 | P1 — risco controlado | Dependência Bluetooth é `1.73.0-rc.17`, release candidate. A versão coincide com a tag latest listada no npm, mas não é uma release estável. | Manter por ora; trocar apenas com comparação, build nativo e validação física do adaptador. |

## Arquivos suspeitos verificados

- `plugins/withBluetoothLegacyPermissionLimits.js`: **não obsoleto**; referenciado diretamente por `app.json`.
- `src/storage/backup.ts`: **não obsoleto**; usado por Configurações e pela suíte de regressão. Tem manifesto e política de retenção.
- `app/testes-sensores.tsx`: **não obsoleto**; rota de teste operacional existente.
- O teste `tests/elmHealthPresentation.test.js`, removido na rodada anterior, era de fato órfão: importava um módulo `src/obd/elmHealthPresentation.ts` inexistente e testava formato de métricas de fila não fornecido pelo serviço real. Sua remoção e a remoção do comando em `npm test` estão registradas em DB-138; o gate segue exigindo que todos os testes existentes sejam executados.

## Dependências e APIs: decisão de segurança

Não remover dependências só porque não há um import simples no código: Expo Router, fontes/ícones e config plugins podem depender delas no build nativo. Não atualizar o SDK neste commit, pois a camada Bluetooth Classic, permissões, background location, FileSystem e configuração de build são fortemente acopladas e a validação física ainda é pendente.

A modernização deve seguir a ordem: baseline de CI e APK; atualizar um SDK por vez com os pacotes recomendados por `npx expo install --fix`; migrar API FileSystem com compatibilidade explícita e migração dos dados existentes; executar todos os testes; validar APK no Android 16, Bluetooth conectado/sem resposta e ECU respondendo, GPS, viagens, backup/restauração, CSV/TXT e retomada após background.

## Referências de versão consultadas

- [Changelog oficial do Expo](https://expo.dev/changelog) — SDK 58 publicado em 15/10/2026.
- [Tabela oficial de SDKs](https://expo.dev/sdk).
- [Documentação FileSystem Legacy](https://docs.expo.dev/versions/latest/sdk/filesystem-legacy/).
- [Pacote react-native-bluetooth-classic](https://www.npmjs.com/package/react-native-bluetooth-classic).

## Validação pendente

O HEAD base `bd44575d633129ec85e288883e7376cbda2b105f` tinha `validate` verde na execução [CI 40625512427](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40625512427), enquanto `android-build` ainda estava montando o APK. A CI precisa ser repetida no novo SHA; nenhuma aprovação é inferida desse resultado anterior. O teste físico Galaxy A06/Android 16 + ELM327/ECU permanece separado.
