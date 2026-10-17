# Reengenharia da IA local — Meriva Smart Diagnostic
Data: 2026-10-17

## Objetivo e princípio de segurança
A inteligência diagnóstica é local, determinística e explicável. Ela não escreve na ECU, não limpa DTCs, não envia comandos de atuação e não trata uma hipótese como confirmação de componente defeituoso. A IA generativa não é pré-requisito para o aplicativo funcionar.

## Arquitetura por responsabilidades
1. **Ingestão e proveniência** — recebe leituras e DTCs, preservando origem, PID, timestamp, unidade e estado de validação. REAL_OBD, SIMULACAO, CARSCANNER_BASELINE, USER_REAL_OBSERVATION e IMPORTADO nunca devem ser convertidos silenciosamente uns nos outros.
2. **Qualidade temporal** — rejeita valores nulos, timestamps inválidos, timestamps futuros e leituras reais com mais de 60 segundos para gerar hipóteses atuais. O limite é uma regra de proteção local, não uma especificação OEM; deve ser configurável por família de dados em uma fase futura.
3. **Contextualização operacional** — distingue marcha lenta fria/aquecida, aceleração, cruzeiro, desaceleração e condição desconhecida. Regras que dependem de condição não são aplicadas fora dela.
4. **Motor de regras** — src/diagnostics/diagnosticEngine.ts interpreta src/knowledge/diagnostic_rules.json, sem inventar medições. O DTC isolado cria uma hipótese de investigação, não prova uma peça.
5. **Recomendação de teste** — cruza as regras com src/knowledge/sensor_tests.json para sugerir verificações, mantendo explícitos os PIDs requeridos e as limitações do veículo.
6. **Composição de resposta** — src/diagnostics/diagnosticResponse.ts transforma identificadores internos em português compreensível, explica o alcance da evidência, apresenta a próxima ação e repete a ressalva de que score heurístico não é probabilidade calibrada.
7. **Aprendizado auditável** — só pode promover PID depois de repetição consistente, fórmula validada e evidência RAW da ECU. Dados de baseline podem orientar comparação, nunca gerar falha atual. A ativação de qualquer capacidade nova de IA deve ser protegida por feature flag.

## Contratos obrigatórios
- REAL_OBD ≠ SIMULACAO ≠ CARSCANNER_BASELINE.
- PADRAO_OBD ≠ MERIVA_CONFIRMADO.
- Não apresentar valor antigo como leitura atual.
- Toda hipótese precisa expor evidências e próximos testes.
- Não recomendar troca de peça apenas com base em um DTC.
- Falta de dado é N/D, não zero nem estimativa silenciosa.
- A IA não executa escrita/atuação na ECU; nenhuma regra usa Mode 04 ou serviços KWP de escrita.
- Não usar pontuação heurística como probabilidade estatística calibrada.
- Não recalcular todo o motor em cada tick de 500 ms: executar quando a janela de dados relevantes muda, quando um DTC muda ou quando a condição temporal é satisfeita.

## Implementado nesta etapa
- runLocalDiagnostic não usa leituras REAL_OBD com mais de 60 segundos para criar hipóteses atuais e contabiliza leituras antigas bloqueadas.
- app/saude.tsx preserva a origem de cada leitura; origens desconhecidas viram IMPORTADO, não REAL_OBD. Isso corrige uma promoção silenciosa de qualquer fonte não simulada a leitura real.
- A camada de resposta oferece título, resumo, nível de confiança textual, próxima ação e cautela em português.
- `src/knowledge/ai_policy.json` agora é consumido pelo motor para frescor, allowlist de status DTC e limites do score; guardas de runtime mantêm limites conservadores.
- `src/knowledge/diagnostic_responses.json` agora fornece os textos por ID de hipótese, sem manter cópias em mapas TypeScript.
- Os catálogos têm schemas JSON Schema Draft 2020-12 e um teste de contrato, que verifica a ligação entre regra, resposta e proveniência do PID.
- `keepScreenAwake` é uma preferência persistida (padrão ligado), atualizada em tempo real pelo layout raiz.
- `largeText` é consumido por `src/ui/AdaptiveText.tsx` e foi aplicado às telas Expo Router; a preferência ajusta textos auxiliares e rótulos sem ampliar novamente os valores hero.

## Próximas etapas da reengenharia
- Criar dataQuality.ts independente com regras de validade, frescor, faixa e proveniência compartilhadas entre painel, viagens e diagnóstico.
- Dividir o motor em detectores por domínio (combustível, ignição, emissões, temperatura/elétrica) sem duplicar coleta de dados.
- Implementar correlação temporal com amostras mínimas, persistência do conjunto de evidências e versão da regra que gerou cada hipótese.
- Fazer aprendizado versionado e reversível; não atualizar pesos com leituras sem origem confirmada.
- Adicionar testes de contrato por DTC/PID e replay de traces reais anonimizados.
- Só integrar modelo generativo opcional depois que regras e evidências locais estiverem estáveis; saída generativa nunca substitui o motor determinístico nem a proveniência.

## Referências oficiais
- Expo SDK 51: https://docs.expo.dev/versions/v51.0.0/
- Expo Router layouts e navegação: https://docs.expo.dev/router/basics/navigation-layouts/
- Expo Keep Awake: https://docs.expo.dev/versions/v51.0.0/sdk/keep-awake/
- Android — tipos de serviços em primeiro plano: https://developer.android.com/develop/background-work/services/fgs/service-types
- Android 14 — exigência de tipos de serviço em primeiro plano: https://developer.android.com/about/versions/14/changes/fgs-types-required
- React Native — acessibilidade: https://reactnative.dev/docs/accessibility

## Limitações
A CI pode validar tipos, testes automatizados e compilação, mas não prova a qualidade de todas as hipóteses em um veículo real. É necessário comparar as regras com documentação OEM, dados reais preservados e testes de bancada/veículo. Nenhuma medição nova foi inventada nesta implementação.


## JSON operacional da IA — extensão de 2026-10-17
- `ai_policy.json`: limites de frescor, fontes aceitas, status DTC, score heurístico e obrigações de resposta. O TypeScript consome a política, mas limita valores em runtime e mantém `REAL_OBD` como única fonte de evidência atual.
- `diagnostic_responses.json`: catálogo de textos em português por ID de hipótese.
- `ai_policy.schema.json` e `diagnostic_responses.schema.json`: contratos JSON Schema Draft 2020-12 para validadores compatíveis.
- `tests/aiKnowledgeJson.test.js`: contrato entre regras, política, respostas e evidência. Confirma que somente PID com `RAW_ECU` pode estar confirmado.
- Limite: JSON melhora governança e explicabilidade, mas não cria por si só um modelo generativo nem comprova precisão no carro. O motor continua determinístico; não houve introdução de dado fictício ou escrita na ECU.


## Acessibilidade global — implementação de 2026-10-17
O componente `AdaptiveText` assina a preferência uma única vez por módulo e reutiliza o valor publicado por `subscribeAppSettings`. Com `largeText=true`, escala 12% os textos com `fontSize` base até 32 px; os valores hero acima desse limite mantêm o tamanho original para evitar escala dupla. A suíte verifica que todas as telas com conteúdo textual, exceto o layout-raiz, usam o componente. Deve ser verificada visualmente em aparelho real para identificar possíveis truncamentos.
