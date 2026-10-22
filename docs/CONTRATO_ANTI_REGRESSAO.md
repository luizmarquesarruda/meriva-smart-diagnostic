# Contrato anti-regressão — Smart OBD Diagnostic

## Propósito

Este documento é o contrato de aceitação entre mudanças, testes, diário e CI. O objetivo é impedir que uma correção localizada remova acidentalmente um recurso que já havia sido aprovado. Ele complementa o Diário de Bordo; não substitui testes funcionais nem inspeção física.

## Camadas de proteção

1. **Contrato humano:** o Diário de Bordo mantém o estado vigente e o histórico numerado. A maior entrada `DB-NNN` indica o registro mais recente; o HEAD e a CI devem ser consultados ao vivo.
2. **Contrato testável:** `tests/projectBaseline.test.js` valida os invariantes críticos, os arquivos de teste essenciais, sua presença em `npm test`, versões/lockfile e integração da própria barreira.
3. **Gate explícito de CI:** o workflow executa `npm run gate:baseline` como passo próprio antes de `npm run validate`. Se o gate falhar, o job de validação falha e o build Android dependente não deve ser considerado aprovado.
4. **Suítes comportamentais:** os testes dedicados continuam responsáveis por confirmar a lógica real, por exemplo média de cinco amostras, desconexões, GPS, parser, dados reais e fallback offline.
5. **Aceitação de entrega:** só aceitar código se a CI do HEAD atual tiver `validate` e `android-build` verdes. Teste físico com ELM327/ECU e inspeção visual no aparelho são etapas separadas.

## Invariantes protegidos

| ID | Invariante não negociável | Testes principais |
|---|---|---|
| RG-01 | Cada PID testado exige cinco tentativas sequenciais e cinco valores válidos; a média é calculada apenas com cinco valores válidos. Resposta ausente não é zero nem aprovação. | `sensorTestEngine.test.js`, `knowledgeJson.test.js` |
| RG-02 | Consulta manual de PID continua acessível, valida Mode 01 e preserva a seleção de PIDs descobertos/cacheados, distinguindo cache de suporte confirmado na sessão atual. | `cockpitNavigation.test.js`, `regression.test.js` |
| RG-03 | Bluetooth Classic/ELM327 mantém uma fila serial única e um dono para conexão automática. Link Bluetooth não equivale a ECU responsiva; não pode haver reconexão infinita. | `bluetoothLifecycle.test.js`, `elm327Compatibility.test.js`, `regression.test.js` |
| RG-04 | Diagnóstico local não depende da internet. Cidade/clima são opcionais e nenhuma falha online deve interromper leituras OBD. | `diagnosticEngine.test.js`, `onlineConditions.test.js` |
| RG-05 | Expo SDK 51, versões do `package.json` e `package-lock.json` permanecem coerentes; nenhuma dependência é duplicada sem auditoria e justificativa. | `projectBaseline.test.js`, `backgroundExecution.test.js` |
| RG-06 | GPS e viagens usam os serviços existentes; timestamps inválidos/duplicados não corrompem distância, e consumo insuficientemente sustentado é inválido/N/D. | `gps.test.js`, `backgroundExecution.test.js`, `tripRecorder.test.js` |
| RG-07 | Origem real, simulação e seed CarScanner permanecem separadas. Leituras reais antigas ou ECU desconectada não podem aparecer como dados atuais. | `liveTelemetry.test.js`, `regression.test.js`, `tripRecorder.test.js` |
| RG-08 | Cockpit mantém temperatura, tensão, borboleta e RPM com rotação automática de dez segundos; saúde detalhada não é duplicada na página inicial. | `orientationLayout.test.js`, `cockpitNavigation.test.js` |
| RG-09 | Gráficos reaproveitam telemetria ao vivo e amostras de viagens reais existentes; sem novo logger paralelo nem linha interpolada sobre lacunas. | `liveTelemetry.test.js`, `cockpitNavigation.test.js` |
| RG-10 | Histórico TXT/autosave continua local e separado de simulação; o diagnóstico não depende de exportação ou serviço externo. | `autosaveTxtFormatter.test.js`, `merivaAutosave.test.js` |
| RG-11 | Todas as telas usam fundo, títulos e barras nativas consistentes; o laboratório não pode reintroduzir uma paleta clara isolada. | `screenTheme.test.js`, `projectBaseline.test.js` |
| RG-12 | Estado de Wi-Fi/4G/5G é informativo e orientado a eventos; nunca controla reconexão OBD, polling de PIDs ou decisão diagnóstica. Sem internet, o motor local permanece funcional. | `connectivity.test.js`, `onlineConditions.test.js` |
| RG-13 | Ícones usam vocabulário compartilhado e botões sem rótulo visual mantêm nomes acessíveis e alvos de pelo menos 48 dp. | `cockpitNavigation.test.js`, `screenTheme.test.js` |
| RG-14 | Estado de rede pode ser reconsultado sob comando; valores de sinal fora de 0–100 são descartados e falha da consulta não afeta diagnóstico offline/OBD. | `connectivity.test.js`, `cockpitNavigation.test.js` |
| RG-15 | Cockpit usa uma única navegação inferior de cinco destinos (Painel, Diagnóstico, Dados, Viagens, Mais), sem repetir esses destinos em uma segunda fileira de botões; cada aba tem rótulo visível, nome acessível e alvo de toque de pelo menos 58 dp. Estado da ECU/Bluetooth permanece distinto da disponibilidade da internet e nunca é comunicado como `OFFLINE` genérico. | `cockpitNavigation.test.js`, `connectivity.test.js`, `onlineConditions.test.js` |
| RG-16 | Autonomia atual só aparece com ECU respondendo e nível válido do PID 012F na sessão atual, com timestamp válido de no máximo 30 s; amostra ausente, inválida, futura ou vencida deve ser descartada no estado público do serviço e em todas as telas de tempo real; autonomia histórica persistida nunca deve ser reexibida como atual. O cálculo usa litros restantes × consumo válido, nunca a capacidade total como se o tanque estivesse cheio. Sem evidência atual, apresentar `N/D`; temperatura indisponível deve usar cor neutra, não verde. | `autonomyPresentation.test.js`, `orientationLayout.test.js`, `projectBaseline.test.js` |
| RG-17 | Barra superior e navegação nativa inferior do Android seguem o tema escuro com ícones/botões contrastantes; a configuração do plugin deve estar no app config e o pacote deve permanecer no lockfile compatível com Expo SDK 51. | `screenTheme.test.js`, `projectBaseline.test.js` |
| RG-18 | A splash screen nativa de inicialização não pode ser removida como dependência presumidamente sem uso; `expo-splash-screen` deve estar alinhado entre `package.json` e `package-lock.json`, e `app.json` deve preservar fundo `#07111f` e `resizeMode: contain`. A existência e inclusão de imagem/logotipo são uma verificação separada, não presumida por esses campos. Alterações de identidade visual precisam de revisão explícita e teste de build nativo. | `projectBaseline.test.js`, CI `android-build`, inspeção do APK |
| RG-19 | Mudanças que alterem comportamento, dependências, configuração Expo, identidade visual ou fluxo de navegação devem sincronizar README/documentação técnica, changelog quando aplicável, auditoria histórica (sem apagar o registro), contrato e Diário de Bordo. Toda alegação de teste/CI deve apontar para evidência do SHA correto; configuração de splash não equivale a asset visual confirmado. | `projectBaseline.test.js`, revisão de PR, `docs/DIARIO_DE_BORDO.md` |
| RG-20 | Mudanças de confiabilidade/UX devem manter um plano de aceitação rastreável em `docs/TEST_PLAN.md`, separar o que já existe do que é proposto e distinguir teste automatizado, CI/build Android, inspeção visual em aparelho e teste físico ELM327/ECU. Não declarar recursos futuros como implementados nem validação física a partir de CI verde. | `projectBaseline.test.js`, `docs/TEST_PLAN.md`, CI do SHA final |

## Regras para uma alteração legítima

- Não reduzir ou excluir um teste essencial só para deixar a CI verde.
- Quando um requisito mudar com autorização explícita, alterar em conjunto o código, o teste comportamental, o contrato e o Diário de Bordo; registrar por que a regra anterior foi substituída.
- Testes devem privilegiar comportamento observável, JSON de contrato e funções puras. Não depender somente de comentários, texto narrativo, formatação ou ordem incidental de linhas.
- Antes de adicionar biblioteca, auditar dependências existentes e compatibilidade com Expo SDK 51; atualizar `package.json` e lockfile juntos.
- Não marcar uma funcionalidade “validada” apenas porque compila. Distinguir teste unitário, CI, teste no aparelho e validação física OBD.

## Procedimento de retomada

1. Ler a seção vigente no início de `docs/DIARIO_DE_BORDO.md`.
2. Abrir a atualização com o maior ID `DB-NNN`.
3. Consultar o HEAD da PR e a última execução de CI correspondente a esse SHA; conferir separadamente `validate` e `android-build`.
4. Revisar as suítes dos RGs afetados antes de editar o código.
5. Executar o gate e a suíte completa; corrigir pela evidência do log, sem alterar uma regra funcional para mascarar uma falha de teste.
6. Atualizar o diário e o próximo ID; nunca fazer merge sem autorização explícita.

## Limitações

O gate é uma barreira contra regressões acidentais, não uma prova formal nem uma proteção contra alteração deliberada simultânea do código e de seus testes. Por isso, revisão de diff, CI do HEAD real e testes físicos continuam obrigatórios.