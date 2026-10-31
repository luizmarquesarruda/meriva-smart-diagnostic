## ESTADO VIGENTE — 2026-10-30 (correções GPS + acompanhamento CI)

> Frente única de trabalho: PR #96, branch `ui/cockpit-instant-consumption-20261027`. Este bloco é a referência operacional; snapshots abaixo são históricos.

- Repositório: [luizmarquesarruda/meriva-smart-diagnostic](https://github.com/luizmarquesarruda/meriva-smart-diagnostic).
- PR #96: [Evita DTC duplicado no cockpit e mostra pressão do coletor](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/96), aberta, fora de rascunho e sem merge. Base `main` observada nesta PR: `7eec3afecb3718020724baf053f8b6d2ca636fab`.
- HEAD/CI: consultar a PR #96 para o SHA atual e o workflow correspondente. A execução no SHA `2441a48131517cf5dda600eb9ab2ec15c69ccfd4` falhou na asserção antiga de timeout; DB-181 atualiza o teste para o contrato novo. DB-178 a DB-181 precisam de validação integral no mesmo SHA final.
- A falha histórica em `tests/orientationLayout.test.js:78` era uma asserção textual obsoleta, corrigida em DB-176. Não há confirmação de CI verde para as correções posteriores.
- Após qualquer alteração, reconsultar o HEAD e a CI correspondentes. Só considerar a PR validada com `validate` e `android-build` verdes no mesmo SHA, diff reconciliado contra `main` e validação física separada.
- A auditoria atual encontrou divergências de documentação e um débito relevante de modernização do SDK. Não houve upgrade de SDK nem remoção de dependências nativas nesta rodada: fazê-los antes de preservar um baseline físico poderia introduzir regressão no Bluetooth Classic.
- Testes com Galaxy A06/Android 16/ELM327 real, confirmação de resposta `010C`, inspeção do APK instalado e validação GPS/autonomia continuam pendentes.
- DB-145 registra a regressão de leitura KWP e classificação de estado ECU/Bluetooth; DB-162/163/164/166 protegem o ciclo RFCOMM; DB-165 limita HTTP de clima; DB-167 expira fixes GPS antigos; DB-168 neutraliza fórmula no CSV; DB-169 torna o start GPS não bloqueante para o polling OBD e aplica cooldown de retry. DB-170 atualiza o gate para aceitar a proteção de timestamp por `state.lastTimestamp`. DB-171 serializa cancelamento da descoberta; DB-172 valida coeficientes/resultados de fórmula; DB-173 corrige documentação cloud; DB-174 centraliza os tokens de cor compartilhados nas telas. DB-175 limita as chamadas de localização opcionais e usa backoff exponencial para o enriquecimento online. DB-177 limita a própria operação nativa de desconexão e mantém o bloqueio RFCOMM se ela expirar; DB-178 bloqueia reconexão quando a sonda do socket fica indeterminada; DB-179 reutiliza a Promise nativa pendente para impedir desconexões concorrentes; DB-180 bloqueia novos comandos após timeout sem prompt para evitar que resposta atrasada seja atribuída ao PID seguinte. DB-182/183 corrigem regressões e cobertura do GPS (timestamp monotônico, ciclo background e movimento urbano); DB-184 mantém o índice do diário alinhado à sequência de IDs. DB-185 registra o refinamento visual da navegação do cockpit em retrato, preservando a composição em paisagem.
- O cockpit deve continuar mostrando N/D até existir leitura OBD real, completa e recente; seed ou histórico não deve ser reapresentado como valor atual.
- DB-146 restaura os quatro quadrantes de telemetria em simultâneo; os PIDs adicionais continuam acessíveis em páginas de quatro métricas. A ausência de ECU não remove a grade, apenas mantém os valores em N/D.
- DB-147 fixa os quatro PIDs principais na primeira página e transforma os restantes PIDs suportados em carrossel completo, com setas anterior/próxima e avanço automático a cada 10 s. Anomalias adicionais são priorizadas sem deslocar os quadrantes principais.
- DB-148 corrige a ocupação vertical em paisagem: cabeçalho/clima na mesma faixa, cockpit + sessão lado a lado, navegação lateral e métricas compactas. O teste físico deve confirmar clipping/overlap no Galaxy A06.
---

## ESTADO HISTÓRICO — 2026-10-25 (snapshot DB-130; superado em 2026-10-28)

> Snapshot histórico consultado no GitHub em 25/10/2026. A lista de PRs e SHAs abaixo descreve apenas aquele momento; não use esse bloco como inventário operacional atual.

### `main` e proteção de integração
- Repositório: [`luizmarquesarruda/meriva-smart-diagnostic`](https://github.com/luizmarquesarruda/meriva-smart-diagnostic).
- SHA de `main` observado antes desta rodada: `701474de2cb3ed8a617a66d87fe3b5e368366acb`.
- A API informa `protected: false` e a listagem de rulesets retorna vazia. Checks obrigatórios na branch principal não estão confirmados. A consulta detalhada de proteção foi negada pela integração (403), portanto não foi alterada.
- PR #80 é a última integração de código confirmada. Nenhuma correção desta rodada foi mesclada em `main`.

### PRs ativas e conflitos de integração
- [#89 — consolidação da auditoria/hardening](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/89): começou esta rodada no SHA `73df16b3c7606595806d67c14c2f95f7fae37e2e`, cuja CI anterior estava verde. As correções encontradas nas iterações estão registradas em DB-126/DB-127; consulte o HEAD atual e a CI do SHA exato antes de aceitar.
- [#90 — recuperação Bluetooth Android 16](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/90): [run 40171897065 — sucesso](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40171897065) no SHA anterior. A lógica está sendo consolidada na #89 para evitar duas propostas nos mesmos três arquivos; a branch é preservada como referência.
- [#81 — PID 0144](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/81): aberta; DB-109 desta branch significa PID 0144, enquanto DB-109 na #89 tem outro conteúdo. Deve ser renumerada/sincronizada sobre a sequência consolidada antes de integrar.
- [#82 — navegação responsiva](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/82), [#83 — layout Floot](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/83) e [#84 — inventário de PIDs](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/84) seguem abertas. #82 e #83 dividem nove arquivos e discordam sobre a navegação em paisagem e a política de 20 versus 25 PIDs; #83 compartilha 17 arquivos com #89. CI verde isolada não resolve esses conflitos.
- PRs #85, #86 e #87 estão fechadas sem merge; o conteúdo dessas branches não se considera integrado apenas porque foram encerradas. Partes das correções foram reconciliadas na #89 conforme o diff.

### Critério de aceitação
- A suíte protege fórmulas, parser, DTC, consumo, combustível, Bluetooth, autonomia, persistência, GPS, navegação e histórico.
- O diário deve manter IDs DB-NNN únicos, contínuos e na mesma ordem do índice. Qualquer combinação de branches deve reconciliar numeração antes de integração.
- Nenhuma PR deve ser mesclada sem diff final contra `main`, CI do SHA exato com `validate` e `android-build` verdes e reconciliação dos arquivos compartilhados.
- Teste físico do Galaxy A06/Android 16 + ELM327 e validação da ECU são etapas separadas.

---

## Portabilidade Floot → aplicativo Expo — 2026-10-23

- A seção de validação matemática criada no protótipo Floot foi portada para a tela nativa `app/laboratorio.tsx`; não foi copiada literalmente a implementação React web, pois o repositório usa Expo/React Native.
- A interface nativa reutiliza `src/obd/formulaEngine.ts` como fonte única para as fórmulas e apresenta os quatro casos de fronteira dos PIDs 0106, 0107, 012D e 015D.
- A tela deixa explícito que os valores de fronteira são casos matemáticos com bytes 0xFF, não leituras reais e não evidência de suporte da ECU.
- Adicionado teste de regressão para verificar a presença da seção e o reuso do motor oficial. A CI precisa executar novamente sobre o novo HEAD; nenhuma compilação nem teste físico deve ser presumido nesta anotação.
- Branch de trabalho: `fix/pid-formula-boundaries-20261023`; na data deste registro, a mudança estava na PR #80 e ainda não havia sido mesclada. O estado posterior está reconciliado no bloco “ESTADO VIGENTE” no início do arquivo.


## Atualização de auditoria — 2026-10-23

- Repositório: `luizmarquesarruda/meriva-smart-diagnostic`; no momento deste registro, o trabalho estava isolado na branch `fix/pid-formula-boundaries-20261023`, com PR #80 aberta contra `main`. A instrução de não mesclar e o status de CI abaixo representam aquele momento; consulte o bloco “ESTADO VIGENTE” para o resultado posterior.
- Problema confirmado: limites arredondados rejeitavam os máximos matemáticos das fórmulas dos PIDs 0106, 0107, 012D e 015D. Para 0106/0107/012D, o máximo de A=255 é 99,21875%; para 015D, A=B=255 produz 301,9921875°.
- Correção: `src/knowledge/ranges.json` atualizado para esses limites exatos. `src/obd/formulaEngine.ts` agora rejeita bytes consumidos que não sejam inteiros no intervalo 0–255.
- Regressão: criado `tests/pidFormulaBoundaries.test.js`, incluído no script `npm test`; cobre os limites e entradas inválidas. Documentação técnica e changelog atualizados.
- CI do SHA final ainda não tem resultado confirmado neste registro; consultar a PR #80 antes de aceitar. Teste físico com ELM327/ECU continua pendente. A captura de 2026-10-23 mostra falha Bluetooth/ECU desconectada, portanto não prova defeito de fórmula nem suporte dos PIDs candidatos.
- Escopo desta rodada: auditoria direcionada de catálogo, fórmulas, parser e faixas; não afirmar que todos os módulos do repositório foram executados ou validados fisicamente.


## ESTADO HISTÓRICO E REGRAS ANTI-REGRESSÃO — 2026-10-21 (SUPERSEDIDO EM 2026-10-24)

> **Snapshot histórico de 2026-10-21 — não é mais a referência operacional atual.** Os estados de branches, SHAs e PRs abaixo registram o que foi observado naquela data. Para o estado atual, use a seção “ESTADO VIGENTE — 2026-10-24” no início do arquivo. Os contratos anti-regressão permanecem como requisitos técnicos até que sejam alterados com evidência e teste.

### Estado atual do trabalho
- Repositório: `luizmarquesarruda/meriva-smart-diagnostic`.
- Branch de auditoria: `audit/anti-regression-ci-20261021`, criada sobre o head da antiga branch de cockpit `bd2e725a45fb2dce633377c1527bb0b389f86d5b`.
- Situação verificada em 2026-10-21: PR #74 e PR #75 estão **fechadas sem merge**; portanto, as correções dessas branches não devem ser presumidas como presentes no `main`.
- Head consultado do `main`: `78b9ca71344ce3d100ad949c09f290b328f01eaa`. O código do `main` ainda tinha o efeito de conexão da tela inicial dependente do objeto `settings` inteiro; a branch auditada restringe as dependências às opções OBD relevantes, reduzindo reinícios causados por recarga de configurações.
- Nenhum merge está autorizado. A CI da nova PR deve validar o conjunto combinado contra `main`; só aceitar se `gate:baseline`, `validate` e `android-build` concluírem com sucesso.

### Contratos que não podem regredir
1. **Testes de sensores:** cinco tentativas sequenciais por PID e cinco respostas válidas para uma avaliação numérica. Calcular a média aritmética das cinco amostras válidas. Resposta ausente, inválida ou timeout não vira zero e não conta como leitura válida; amostragem incompleta = inconclusiva/sem resposta, nunca aprovada.
2. **Consulta manual de PID:** manter a rota/atalho de consulta manual, validação e normalização Mode 01, parser usando o mesmo PID solicitado e lista de PIDs selecionável. Distinguir descoberta na sessão atual de itens vindos do cache. Cache não comprova suporte atual; somente resposta ECU real apropriada é evidência atual.
3. **Bluetooth/ELM327:** manter Bluetooth Classic e uma única fila serial compartilhada; não iniciar polling/conexão em paralelo a partir do layout ou de uma segunda tela. A tela inicial é a proprietária do fluxo automático de conexão inicial. Conexão Bluetooth não equivale a ECU respondendo; validar ECU com resposta OBD real, não apenas nome do adaptador ou estado do socket. Tentativas/reconexões têm limite e nunca podem entrar em laço infinito.
4. **Offline por padrão:** regras locais, diagnóstico básico, leitura de PIDs, execução dos testes e acesso ao histórico salvo precisam funcionar sem internet. Clima/cidade são enriquecimento visual opcional, jamais pré-requisito nem entrada do motor diagnóstico. Falha online deve degradar para N/D sem bloquear nem reiniciar a conexão OBD.
5. **Localização e privacidade:** não solicitar localização automaticamente para mostrar clima. Só usar GPS para esse enriquecimento quando a permissão de primeiro plano já existir. Erro de permissão, localização ou rede não pode interromper o diagnóstico.
6. **Origem dos dados:** manter `REAL`, `REAL_OBD`, `SIMULACAO` e `CARSCANNER_SEED` semanticamente separados. Seeds/simulações nunca podem se tornar evidência real, contaminar consumo real, gráfico operacional ou decisão diagnóstica. Amostras ausentes não são interpoladas nem inventadas; dados antigos/desconectados aparecem como N/D, não como leitura atual.
7. **GPS/viagens:** reutilizar o rastreador e o serviço de viagem existentes; evitar watchers/tarefas nativas duplicadas, amostras com timestamp repetido/fora de ordem e redução indevida da distância. Não salvar consumo como válido quando as amostras de combustível/distância não são suficientes. Parar monitoramento nativo consultando seu estado real, sem depender somente de flag JavaScript.
8. **Expo e dependências:** manter Expo SDK 51 e o lockfile coerente. Antes de adicionar pacote, procurar e reutilizar o módulo já instalado; não trocar bibliotecas de Bluetooth, gráficos ou armazenamento sem necessidade comprovada e teste de compatibilidade.
9. **Testes sem fragilidade textual:** preferir testes de funções puras, saída observável, contratos JSON, fila/estados e comportamento. Não criar teste que dependa apenas de palavras em comentários, mensagens explicativas ou formatação incidental.
10. **CI obrigatória:** a validação de referência é a CI da cabeça mais recente, com `validate` e `android-build` concluídos com sucesso. `validate` inclui TypeScript e a suíte completa; o Android build deve completar prebuild, APK, verificação e artefato. Falha em qualquer etapa não é conclusão. Uma CI verde não substitui teste físico de ELM327/ECU ou inspeção visual em aparelho.
11. **Diário em primeiro lugar:** antes de editar código, ler esta seção e a entrada final mais recente; conferir branch, SHA e CI no GitHub; escrever problema → causa comprovada → alteração → testes → commit → CI → resultado → próximos passos. Atualizar este arquivo com evidências, nunca com resultados presumidos.
12. **Histórico não é fila de tarefas:** entradas anteriores preservam o contexto da época. Não repetir seus “próximos passos” automaticamente nem desfazer correções posteriores; confirmar primeiro se ainda estão pendentes no código e na CI.

## ÍNDICE SEQUENCIAL — ENTRADAS DB

**Regra:** este índice cobre as entradas identificadas por `DB-NNN`; os dois registros de contexto sem ID que aparecem antes dele são notas históricas preservadas separadamente. O maior ID identifica a última entrada documental. A ordem segue a de registro no arquivo, não necessariamente a data estrita do evento. Na retomada, comece pelo maior ID e confira o HEAD e a CI atuais diretamente no GitHub.

- **DB-001** · 2026-10-06 — Correção do carregamento do catálogo de combustível
- **DB-002** · 2026-10-07 — Continuidade do fluxo Bluetooth
- **DB-003** · 2026-10-07 — Primeira camada do motor de raciocínio diagnóstico local
- **DB-004** · 2026-10-07 — Integração e apresentação do diagnóstico local
- **DB-005** · 2026-10-07 — Auditoria da CI #731: falha real no teste, não no motor
- **DB-006** · 2026-10-07 — Reconciliação do lockfile e reprodutibilidade da CI
- **DB-007** · 2026-10-07 — Correção revelada pela validação com `npm ci`
- **DB-008** · 2026-10-07 — Consolidação final no main e CI verde
- **DB-009** · 2026-10-07 — Verificação do package-lock.json
- **DB-010** · 2026-10-07 — Persistência automática de Bluetooth/ECU e histórico TXT rotativo
- **DB-011** · 2026-10-07 — Auditoria e centralização das permissões Android
- **DB-012** · 2026-10-07 — Implementação das fases 1, 2 e 3 da nova experiência de telas
- **DB-013** · 2026-10-07 — Consolidação do Diário após as fases 1, 2 e 3
- **DB-014** · 2026-10-07 — Auditoria da CI #901/#902 + pesquisa de referências OBD
- **DB-015** · 2026-10-07 — Incorporação de funções de referência OBD + auditoria pré-CI
- **DB-016** · 2026-10-07 — Correção revelada pela CI #926 antes do fechamento
- **DB-017** · 2026-10-07 — Correção do harness DTC revelada pela CI #929
- **DB-018** · 2026-10-07 — Correção final do parser DTC revelada pela CI #930
- **DB-019** · 2026-10-07 — Correção final do loader de testes DTC revelada pela CI #931
- **DB-020** · 2026-10-08 — Rotação livre do Android + proteção responsiva do cockpit
- **DB-021** · 2026-10-08 — Auditoria de integridade: Safe Area, JSON e retry Bluetooth
- **DB-022** · 2026-10-08 — Adaptação completa das telas à rotação do celular
- **DB-023** · 2026-10-08 — Auditoria e correção do autosave/persistência
- **DB-024** · 2026-10-08 — Auditoria sênior: identificação de PIDs e DTCs na interface
- **DB-025** · 2026-10-08 — Auditoria sênior documental de PIDs, DTCs e motor diagnóstico
- **DB-026** · 2026-10-08 — Resultado da auditoria documental de PIDs, DTCs e motor diagnóstico
- **DB-027** · 2026-10-08 — Auditoria profunda pré-CI: correção crítica do retry Bluetooth/ELM327
- **DB-028** · 2026-10-08 — CI #1038: falha de TypeScript na camada de permissões
- **DB-029** · 2026-10-08 — CI #1045: regressão de teste de permissões
- **DB-030** · 2026-10-08 — CI #1051: teste apontando arquivo SAF incorreto
- **DB-031** · 2026-10-08 — CI #1057: teste de rotação desatualizado
- **DB-032** · 2026-10-08 — CI #1063 verde e consolidação da auditoria
- **DB-033** · 2026-10-08 — Registro complementar: status confirmado da CI #1063
- **DB-034** · 2026-10-08 — Autosave vinculado à sessão real da ECU
- **DB-035** · 2026-10-08 — Correção: histórico e dados não eram alimentados pela telemetria automática
- **DB-036** · 2026-10-08 — Auditoria: duplicação na telemetria automática
- **DB-037** · 2026-10-08 — CI #1235: regressão estática no teste de ciclo Bluetooth
- **DB-038** · 2026-10-08 — CI #1236: validação verde da correção de telemetria automática
- **DB-039** · 2026-10-08 — Execução em segundo plano com tela apagada
- **DB-040** · 2026-10-08 — Varredura de conhecimento OBD e enriquecimento do banco local
- **DB-041** · 2026-10-08 — TXT de PIDs compactado e descoberta persistente
- **DB-042** · 2026-10-08 — Pacote prioritário: saúde da ECU, DTC, identificação, consumo e persistência
- **DB-043** · 2026-10-08 — Auditoria pós-implementação: correções de integração
- **DB-044** · 2026-10-09 — Trip formula integrity
- **DB-045** · 2026-10-09 — Histórico diário de sessões ECU e tela ativa
- **DB-046** · 2026-10-09 — Plano de auditoria cruzada TXT/viagens (registrado antes do código)
- **DB-047** · 2026-10-10 — Consolidação das correções de viagens e registro de auditoria
- **DB-048** · 2026-10-10 — Auditoria e correção da atualização do consumo em tempo real
- **DB-049** · 2026-10-10 — Otimização do polling do consumo e correção de escopo TypeScript
- **DB-050** · 2026-10-10 — Temperatura do líquido de arrefecimento no cockpit inicial
- **DB-051** · 2026-10-10 — Auditoria consolidada de histórico, consumo e telemetria
- **DB-052** · 2026-10-11 — Recuperação de sessão OBD interrompida
- **DB-053** · 2026-10-10 — Fase 1: relatório detalhado de viagem e telemetria por trajeto
- **DB-054** · 2026-10-11 — Fase 2: correção de tipagem da recuperação do histórico diário
- **DB-055** · 2026-10-11 — Fase 3: correção do DTC no freeze frame
- **DB-056** · 2026-10-11 — Fase 4: integridade da distância em amostras GPS inválidas
- **DB-057** · 2026-10-11 — Fase 5: preservar o TXT diário quando a leitura falha
- **DB-058** · 2026-10-11 — Fase 6: reduzir fragmentação de viagens e crescimento do TXT
- **DB-059** · 2026-10-11 — Regressão no início do histórico diário por concorrência de inicialização
- **DB-060** · 2026-10-11 — Correção da CI #1911: teste de tela ligada desatualizado
- **DB-061** · 2026-10-12 — Auditoria de consumo estimado e disparo de CI
- **DB-062** · 2026-10-12 — Auditoria de desempenho OBD, integridade de PIDs e persistência em lote
- **DB-063** · 2026-10-12 — Ajuste da regressão de rotação do cockpit identificada na CI
- **DB-064** · 2026-10-12 — Correção de asserções antigas da CI #1920
- **DB-065** · 2026-10-12 — CI #1921 verde na validação e redução dos retries AT opcionais
- **DB-066** · 2026-10-12 — Fixture ELM327 do teste de fast-fail corrigida
- **DB-067** · 2026-10-13 — Auditoria de performance, política JSON e fast-fail de inicialização
- **DB-068** · 2026-10-13 — Auditoria cruzada do TXT real, performance OBD, cálculo de combustível e integridade do autosave
- **DB-069** · 2026-10-14 — Central de Testes de Sensores (primeira versão)
- **DB-070** · 2026-10-14 — [HISTÓRICO SUPERSEDIDO EM 2026-10-20] Catálogo JSON, IA de triagem e três leituras por PID
- **DB-071** · 2026-10-16 — Incidente: ciclo repetitivo de conexão OBD
- **DB-072** · 2026-10-16 — Ajuste da validação CI da correção Bluetooth
- **DB-073** · 2026-10-20 — Restaurar cinco leituras do Laboratório e consulta manual de PID
- **DB-074** · 2026-10-20 — Cockpit inicial: indicadores OBD e estado de falhas
- **DB-075** · 2026-10-20 — Gráficos de telemetria ao vivo e histórico por viagem
- **DB-076** · 2026-10-20 — Auditoria P1–P5 e enriquecimento opcional de clima
- **DB-077** · 2026-10-20 — Consolidação do diário e salvaguardas contra regressões
- **DB-078** · 2026-10-20 — Índice enumerado de todas as atualizações e regra de leitura
- **DB-079** · 2026-10-20 — Camada executável anti-regressão
- **DB-080** · 2026-10-20 — Revisão preventiva do próprio gate anti-regressão
- **DB-081** · 2026-10-20 — Correção do pisca-pisca do cockpit e restauração da navegação inferior
- **DB-082** · 2026-10-21 — Auditoria visual, tema comum e proteção de consistência entre telas
- **DB-083** · 2026-10-21 — Navegação inferior somente com ícones e alvos acessíveis
- **DB-084** · 2026-10-21 — Biblioteca visual compartilhada, monitoramento de rede 4G/5G e página de conectividade
- **DB-085** · 2026-10-21 — Atualização manual da rede e validação do sinal informado pelo Android
- **DB-086** · 2026-10-21 — Cockpit: informações de rede/clima legíveis e botões com áreas de toque ampliadas
- **DB-087** · 2026-10-21 — Ajuste adicional de legibilidade da rede e tamanho dos botões principais
- **DB-088** · 2026-10-21 — Auditoria contra regressões, reconciliação das PRs fechadas e CI do conjunto combinado
- **DB-089** · 2026-10-21 — Rotação automática da tela
- **DB-090** · 2026-10-22 — Correção da autonomia, conexão explícita e navegação única
- **DB-091** · 2026-10-22 — Compatibilidade da barra nativa com Expo Doctor
- **DB-092** · 2026-10-22 — Restauração da splash screen e falha de cobertura antirregressão
- **DB-093** · 2026-10-22 — Reconciliação da documentação após regressão da splash
- **DB-094** · 2026-10-22 — Plano de aceitação para o lote de confiabilidade e UX
- **DB-095** · 2026-10-22 — Expiração de nível de combustível antigo na autonomia atual
- **DB-096** · 2026-10-22 — Fechar outros caminhos de exibição da autonomia persistida
- **DB-097** · 2026-10-22 — Rejeitar timestamps inválidos/futuros na telemetria ao vivo
- **DB-098** · 2026-10-22 — DTC: distinguir ausência de códigos de falha de leitura
- **DB-099** · 2026-10-22 — Pendências de splash screen e rodada de estabilização
- **DB-100** · 2026-10-23 — Implementar asset visual e configuração explícita da splash nativa
- **DB-101** · 2026-10-23 — Splash operacional, conexão automática e identidade Smart OBD
- **DB-102** · 2026-10-23 — Desbloquear o acesso ao cockpit quando a ECU está indisponível
- **DB-103** · 2026-10-23 — Permissões de localização deixam de bloquear diagnóstico OBD
- **DB-104** · 2026-10-23 — Prioridade de alerta térmico e localização contextual
- **DB-105** · 2026-10-23 — Sincronizar contrato de teste com callback de prioridade térmica
- **DB-106** · 2026-10-23 — Manutenção preventiva e diário local de abastecimentos
- **DB-107** · 2026-10-23 — Cockpit OBD com até 20 PIDs reais
- **DB-108** · 2026-10-23 — Recuperação Bluetooth/ELM327 e reconciliação de PR
- **DB-109** · 2026-10-24 — Auditoria integral, correção do índice e reconciliação do estado atual
- **DB-110** · 2026-10-24 — Descoberta OBD mais rápida, cache não autoritativo e latência por comando
- **DB-111** · 2026-10-24 — Continuidade da auditoria e reconciliação documental das PRs
- **DB-112** · 2026-10-24 — Validação estrita de bitmaps OBD e reconciliação dos IDs anti-regressão
- **DB-113** · 2026-10-24 — Compatibilidade do parser com envelope K-Line compacto
- **DB-114** · 2026-10-24 — Exibição do ajuste de combustível do segundo byte do PID 0114
- **DB-115** · 2026-10-24 — Buffer limitado para respostas da descoberta de PIDs
- **DB-116** · 2026-10-24 — Buffer RX limitado no transporte Bluetooth
- **DB-117** · 2026-10-24 — Integridade de checksum K-Line e enquadramento de DTC
- **DB-118** · 2026-10-24 — Persistência segura de viagens, CSV, cota e backups
- **DB-119** · 2026-10-24 — Validação profunda do autosave, GPS e estimativas de combustível
- **DB-120** · 2026-10-24 — Descoberta rápida e integridade de quadros OBD
- **DB-121** · 2026-10-24 — Releitura integral do diário e reconciliação das PRs mais recentes
- **DB-122** · 2026-10-24 — Confirmação das CI e revisão das PRs de layout
- **DB-123** · 2026-10-24 — Correção da atribuição de layout após releitura direta da PR #83
- **DB-124** · 2026-10-24 — Delimitação do risco de modelo fixo no layout
- **DB-125** · 2026-10-24 — Auditoria retrospectiva das PRs, CI e diário desde o início
- **DB-126** · 2026-10-25 — Auditoria de estabilidade, rádio Bluetooth e controle de regressões
- **DB-127** · 2026-10-25 — CI como auditoria de regressão e cobertura completa das suítes
- **DB-128** · 2026-10-25 — Revalidar bloqueio RFCOMM após cada espera e corrigir IDs RG duplicados
- **DB-129** · 2026-10-25 — GPS rejeita timestamps inválidos e fora de ordem
- **DB-130** · 2026-10-25 — Otimização CSV avaliada e bloqueada pela versão instalada
- **DB-131** · 2026-10-25 — Atualização periódica de localização/clima baseada em conectividade
- **DB-132** · 2026-10-27 — Cockpit sem duplicação de DTC; cartão substituído por pressão do coletor
- **DB-133** · 2026-10-28 — CI: suíte de apresentação de saúde do ELM reintegrada ao npm test
- **DB-134** · 2026-10-28 — Corrigir contrato de layout obsoleto após remoção do DTC do cockpit
- **DB-135** · 2026-10-28 — Corrigir navegação icon-only no cockpit
- **DB-136** · 2026-10-28 — Sincronizar índice do diário após as novas entradas
- **DB-137** · 2026-10-28 — Fechar lacuna de índice detectada pela segunda execução da CI
- **DB-138** · 2026-10-28 — Remover teste ELM órfão sem implementação correspondente
- **DB-139** · 2026-10-28 — Auditoria de obsolescência: reconciliar marca, arquitetura e framing ELM327
- **DB-140** · 2026-10-28 — Auditoria da rede móvel e dos provedores de localização
- **DB-141** · 2026-10-28 — Auditoria profunda de PIDs, interpretação e integridade da IA local
- **DB-142** · 2026-10-28 — Corrigir polaridade da prontidão no PID 0101
- **DB-143** · 2026-10-28 — Decisão arquitetural: APK independente, sem dependência do Bubble
- **DB-144** · 2026-10-28 — Navegação por categorias, ícones e qualidade dos dados
- **DB-145** · 2026-10-28 — Corrigir leitura KWP, retry e classificação do estado ECU/Bluetooth
- **DB-146** · 2026-10-28 — Restaurar quadrantes 2×2 e paginação de PIDs no cockpit
- **DB-147** · 2026-10-28 — Incluir os PIDs restantes no carrossel principal com navegação por setas
- **DB-148** · 2026-10-28 — Auditoria e correção de cockpit em orientação paisagem
- **DB-149** · 2026-10-28 — Grade 2×2 adaptável e navegação lateral direita em paisagem
- **DB-150** · 2026-10-28 — Auditoria crítica de layout e duplicações de conteúdo
- **DB-151** · 2026-10-28 — Remoção do setter órfão após consolidar o Laboratório
- **DB-152** · 2026-10-28 — Unificar marca visual entre cockpit e tela Viagens
- **DB-153** · 2026-10-28 — Corrigir contrato de altura da tipografia do cockpit em paisagem
- **DB-154** · 2026-10-28 — Mover teste de integridade de viagens para a tela canônica
- **DB-155** · 2026-10-28 — Diferenciar armazenamento de histórico de viagens
- **DB-156** · 2026-10-28 — Remover cópia do perfil do veículo em Configurações
- **DB-157** · 2026-10-28 — Tornar robustas as asserções da navegação do perfil
- **DB-158** · 2026-10-28 — Melhorar legibilidade da tipografia em paisagem
- **DB-159** · 2026-10-28 — Atualizar teste do hub após separar armazenamento e viagens
- **DB-160** · 2026-10-28 — Centralizar hipóteses da IA na tela Saúde
- **DB-161** · 2026-10-28 — Corrigir rótulo obsoleto do atalho de armazenamento em Viagens
- **DB-162** · 2026-10-29 — Limitar sondas nativas Bluetooth e falhar fechado em estado indeterminado
- **DB-163** · 2026-10-29 — Aplicar timeout finito às sondas de disponibilidade e descoberta Bluetooth
- **DB-164** · 2026-10-29 — Limitar sondas nativas na preparação e ativação Bluetooth
- **DB-165** · 2026-10-29 — Limitar a consulta HTTP opcional de clima e cancelar requisição vencida
- **DB-166** · 2026-10-29 — Limitar sonda de rádio no monitor de saúde Bluetooth/ECU
- **DB-167** · 2026-10-29 — Expirar velocidade GPS antiga sem perder distância acumulada
- **DB-168** · 2026-10-29 — Neutralizar fórmulas em campos textuais de exportação CSV
- **DB-169** · 2026-10-29 — Impedir que a inicialização GPS bloqueie polling OBD
- **DB-170** · 2026-10-29 — Atualizar gate GPS para monotonicidade após perda de fix
- **DB-171** · 2026-10-29 — Serializar cancelamento nativo da descoberta Bluetooth
- **DB-172** · 2026-10-29 — Rejeitar coeficientes e resultados de fórmula não finitos
- **DB-173** · 2026-10-29 — Corrigir documentação obsoleta sobre sincronização em nuvem
- **DB-174** · 2026-10-29 — Consumir tokens compartilhados para a paleta base das telas
- **DB-175** · 2026-10-29 — Limitar localização para clima e aplicar backoff exponencial
- **DB-176** · 2026-10-29 — Atualizar contrato visual térmico para o token de tema
- **DB-177** · 2026-10-29 — Limitar timeout da limpeza nativa de socket RFCOMM
- **DB-178** · 2026-10-29 — Preservar bloqueio RFCOMM quando a sonda de estado do socket expira
- **DB-179** · 2026-10-29 — Serializar tentativas nativas de desconexão após timeout
- **DB-180** · 2026-10-29 — Impedir que resposta ELM atrasada contamine o próximo PID
- **DB-181** · 2026-10-29 — Atualizar asserção de timeout após serializar desconexão nativa
- **DB-182** · 2026-10-30 — Corrigir fixture de timestamp GPS e mockar ciclo de vida nativo em segundo plano
- **DB-183** · 2026-10-30 — Confirmar movimento urbano sem exigir 8 m em cada callback GPS
- **DB-184** · 2026-10-30 — Sincronizar índice DB-NNN com as novas entradas de auditoria

---

Este arquivo é o registro operacional das correções, auditorias e decisões técnicas do projeto.

## Regra de trabalho

Antes de qualquer correção de código:
1. Ler este diário.
2. Identificar a última correção, tentativa de CI e estado conhecido.
3. Evitar repetir uma tentativa que já falhou sem analisar a causa.
4. Fazer a correção no código e, quando aplicável, nos testes e dados JSON.
5. Registrar no diário a causa, a alteração, os arquivos afetados, o commit e a CI.
6. Validar a CI antes de considerar a correção concluída.
7. Se a CI falhar, registrar a falha e somente então iniciar a próxima correção.
8. Manter documentação e repositório sincronizados.

## DB-001 · 2026-10-06 - Correção do carregamento do catálogo de combustível

### Problema
A CI #661 falhou no teste `tests/fuelIdentification.test.js`. O teste transpila `src/obd/fuelIdentification.ts` diretamente para CommonJS e o import default de `src/knowledge/fuel_types.json` não foi resolvido como esperado. O catálogo chegou como indefinido e a leitura de `codes` falhou.

### Diagnóstico
O arquivo JSON estava presente e válido. O problema estava na forma de importação usada pelo cenário de teste CommonJS, não no conteúdo do catálogo.

### Correção
Alterado o import em `src/obd/fuelIdentification.ts` de import default para importação compatível com o módulo CommonJS:
```ts
import * as fuelTypeCatalog from '../knowledge/fuel_types.json';
```

### Commit
- `720a75181d9ad2da1fdad4623fe55f1907d7b0a2`
- Mensagem: `fix: load fuel catalog correctly in CommonJS validation`

### CI
- CI anterior: #661, falha no carregamento do catálogo.
- Nova CI: #662, run `37465291527`.
- `validate`: **sucesso**.
- `android-build`: em execução no momento deste registro.

### Impacto
A identificação de combustível pelo catálogo JSON volta a ser carregável no ambiente de validação CommonJS, sem alterar a tabela de códigos nem a lógica de identificação.

### Próximo passo
Aguardar o resultado final do Android build da CI #662. Se houver falha, registrar a causa neste diário antes da próxima correção.

---

## Processo adotado a partir de 2026-10-06

Toda nova correção deverá deixar uma trilha mínima no diário:

**problema → diagnóstico → correção → testes → commit → CI → resultado → próximo passo**

Nenhuma falha de CI será tratada como correção concluída.

## DB-002 · 2026-10-07 — Continuidade do fluxo Bluetooth

- **Diagnóstico:** o fluxo `sharedConnection` podia iniciar uma nova rodada completa de descoberta após esgotar todos os candidatos. Como `maxConnectionAttempts` tinha valor padrão 0, isso podia resultar em reconexão indefinida.
- **Correção:** removida a repetição externa. O controle de tentativas permanece concentrado no fluxo do ELM327: até **20 tentativas por candidato**, intervalo de **8 segundos** e parada imediata no primeiro sucesso.
- **Correção adicional:** o log de timeout do transporte agora captura `bufferedLength` antes de limpar o buffer, evitando registrar sempre zero.
- **Teste:** adicionada regressão estática para impedir o retorno do laço infinito em `sharedConnection`.
- **Regra preservada:** ELM327 Mini é tratado como adaptador genérico; a conexão só vira OBD válido após resposta real `010C` com `41 0C`.

## DB-003 · 2026-10-07 - Primeira camada do motor de raciocínio diagnóstico local

### Objetivo
Transformar a base de PIDs, DTCs e aprendizado em um motor local de hipóteses rastreáveis, sem depender de ChatGPT/OpenAI para funcionar.

### Correção
Criados:
- `src/knowledge/diagnostic_rules.json`
- `src/diagnostics/diagnosticEngine.ts`
- `tests/diagnosticEngine.test.js`

O motor aceita observações OBD e DTCs, separa dados reais de SIMULAÇÃO, gera hipóteses com score e confiança, registra evidências e sugere próximos testes.

Regras iniciais:
- P0301 -> falha de combustão no cilindro 1;
- P0123 -> sinal alto de posição da borboleta;
- STFT + LTFT >= 15% -> mistura pobre;
- STFT + LTFT <= -15% -> mistura rica;
- MAP >= 45 kPa em IDLE_WARM -> vácuo possivelmente anormal.

## DB-004 · 2026-10-07 — Integração e apresentação do diagnóstico local

- LastPidReading preserva REAL/SIMULACAO.
- A tela de laboratório mostra hipóteses, score, confiança, evidências e próximos testes.
- O TXT inclui diagnóstico local e o que o aplicativo aprendeu.
- Evidências estruturadas são renderizadas por `evidence.text`.
- Figma foi criado para as telas secundárias, mas a edição MCP ficou indisponível; a melhoria visual foi aplicada diretamente em `app/configuracoes.tsx` e `app/armazenamento.tsx`.

## DB-005 · 2026-10-07 — Auditoria da CI #731: falha real no teste, não no motor

### Falha encontrada
A CI #731 (run `37641181931`) passou por:
- instalação de dependências;
- `expo-doctor`: **17/17**;
- TypeScript;
- 12 testes de autosave;
- 17 regressões;
- GPS;
- combustível;
- trip recorder;
- compatibilidade ELM327.

A falha ocorreu somente em `tests/diagnosticEngine.test.js`, na linha 63, com:

`AssertionError: 1 !== 0`.

### Diagnóstico
O erro estava no **próprio caso de teste**. O teste chamava o motor com:
- STFT = 10%;
- LTFT = 8%;
- soma = **18%**.

Mas a regra documentada do motor é:
`STFT + LTFT >= 15% -> MISTURA_POBRE`.

Portanto, o motor corretamente gerou uma hipótese. O teste estava pedindo zero hipóteses para um conjunto de dados que, pelas regras atuais, deve gerar uma hipótese.

### Correção
O caso neutro foi corrigido para:
- STFT = 10%;
- LTFT = 4%;
- soma = **14%**.

Assim o teste fica realmente abaixo do limiar de 15%, sem alterar a regra diagnóstica.

### Arquivo afetado
- `tests/diagnosticEngine.test.js`

### Commit
- `82323ef8e5bf62db2666b4923a6802e9bfd1fda2` — `test: correct neutral fuel trim case`

### Próximo passo
O próximo push dispara automaticamente a CI. **Não considerar a correção concluída até a nova CI terminar.** Se houver nova falha, analisar o log antes de alterar novamente o código.


## DB-006 · 2026-10-07 — Reconciliação do lockfile e reprodutibilidade da CI

### Problema
O repositório não continha `package-lock.json`, apesar de a engenharia do projeto já depender de um conjunto declarado de versões no `package.json`. A CI usava `npm install`, deixando a árvore transitiva dependente do estado do registry em cada execução.

### Diagnóstico
A busca no branch e no histórico acessível não encontrou `package-lock.json` nem `npm-shrinkwrap.json`. O `package.json` atual contém as versões declaradas de Expo 51, React Native 0.74.5 e demais dependências. Um lockfile parcial seria incorreto porque não registraria o grafo transitivo completo.

### Correção
Foi criado um `package-lock.json` real, usando Node 20 + npm da própria CI com:
`npm install --package-lock-only --ignore-scripts --no-audit --no-fund`.

Validações estruturais:
- `lockfileVersion: 3`;
- 1.205 entradas no campo `packages`;
- dependências da raiz correspondem ao `package.json`;
- nenhum `npm-shrinkwrap.json` foi introduzido.

O lockfile foi gerado pelo job temporário e gravado pelo commit:
- `1d4c6db714b98498bc50527386ad8158e4077d0f` — `chore: generate package lock`
- blob de `package-lock.json`: `101303c990597eec4f126ce5ee012eda0b5c1c13`

O workflow temporário usado para gerar o arquivo será removido imediatamente após esta consolidação; ele não faz parte da arquitetura definitiva do projeto.

### Mudança de CI
Os dois jobs da CI passam de:
`npm install --no-audit --no-fund`

para:
`npm ci --no-audit --no-fund`

Assim, `validate` e `android-build` usam exatamente o grafo registrado no lockfile.

### Regra preservada
O lockfile não autoriza atualizar versões declaradas do projeto por conta própria. Ele registra a resolução transitiva correspondente ao `package.json` vigente.

### Próximo passo
Executar a nova CI completa com `npm ci`. A correção só será considerada concluída quando `validate` e `android-build` terminarem sem falha. Caso `npm ci` revele divergência de lockfile, corrigir o lockfile a partir do erro observado antes de qualquer outra alteração.


## DB-007 · 2026-10-07 — Correção revelada pela validação com `npm ci`

### Falha encontrada
A validação no ambiente Node 20/npm 10 executou `npm ci` com sucesso e `expo-doctor` com **17/17**. O `npm run validate` encontrou uma regressão em `tests/regression.test.js` relacionada ao seed tardio do perfil de aprendizado.

O cenário criava um perfil, registrava uma amostra real e depois inicializava o seed CarScanner. O código alterava o estado de aprendizado para `SEED_INITIALIZED`, embora já existisse aprendizado real.

### Diagnóstico
A inicialização do seed deve complementar um perfil frio, não reclassificar um perfil que já começou a aprender com dados reais. O estado `COLD_START` continua correto abaixo do limiar mínimo de amostras reais; `LEARNING_ACTIVE` e `CONFIDENT` também devem ser preservados quando atingidos.

### Correção
Em `src/database/learningProfile.ts`, `initializeCarScannerSeed` passou a decidir o estado com a seguinte prioridade:
1. `CONFIDENT` quando as amostras reais atingem o limiar alto;
2. `LEARNING_ACTIVE` quando atingem o limiar mínimo;
3. `COLD_START` quando existe pelo menos uma amostra real, mas ainda não atingiu o limiar;
4. `SEED_INITIALIZED` somente quando ainda não existem amostras reais.

O teste existente de seed tardio foi preservado porque expressa a invariável correta.

### Commit
- `9f65f057355f2cce0eec3cb9fcd3f4d51f18224` — `fix: preserve learning state when seed is initialized late`

### CI
O run intermediário que revelou a falha foi cancelado após a criação de novos commits, mas seu log comprovou:
- `npm ci --no-audit --no-fund`: **sucesso**;
- `npm run doctor`: **17/17**, sucesso;
- `npm run validate`: falhou somente no cenário do seed tardio descrito acima.

### Próximo passo
Aguardar a nova CI no commit da correção. Validar novamente `npm ci`, typecheck, todos os testes e Android build antes de considerar o conjunto concluído.

## DB-008 · 2026-10-07 — Consolidação final no main e CI verde

### Consolidação
O PR #24 foi integrado ao `main` por squash no commit `1e0c8372b33454cc9675f48f18d5cf39b74cd239`.

Foram consolidadas as correções auditadas de:
- fluxo Bluetooth Classic / ELM327;
- prevenção de reconexão indefinida;
- preservação do estado de aprendizado quando o seed CarScanner é inicializado tardiamente;
- `package-lock.json` real e versionado;
- CI com `npm ci --no-audit --no-fund`;
- regressões de Bluetooth e diagnóstico;
- validação do APK Android standalone.

### CI do main
Run: `37684972084`

- `validate`: **sucesso** — `npm ci`, Expo Doctor e suíte completa de validação.
- `android-build`: **sucesso** — APK Release standalone compilado, verificado e publicado como artefato.

### Estado
A consolidação foi concluída com os dois jobs obrigatórios verdes. O repositório está em estado reproduzível de dependências e com a cadeia principal de validação passando.

### Próximo passo
Qualquer nova alteração deve iniciar por nova leitura deste diário e deve preservar a regra: problema → diagnóstico → correção → testes → commit → CI → resultado.

## DB-009 · 2026-10-07 — Verificação do package-lock.json

### Solicitação
Foi solicitada a inclusão do `package-lock.json` no repositório do aplicativo e a atualização deste Diário de Bordo.

### Resultado
O `package-lock.json` **já está presente no `main`**, incorporado pela consolidação anterior. O arquivo está versionado com:
- `lockfileVersion: 3`;
- nome do projeto: `meriva-smart-diagnostic`;
- versão do aplicativo: `1.0.1`;
- blob SHA: `101303c990597eec4f126ce5ee012eda0b5c1c13`.

Não foi criado um segundo lockfile nem substituído o arquivo existente, evitando duplicação ou alteração desnecessária da árvore de dependências.

### Correção de lifecycle após recriação do JavaScript
O encerramento da localização em segundo plano não depende mais apenas do flag em memória. A implementação consulta sempre o TaskManager nativo antes de parar o serviço, evitando manter a notificação/Foreground Service ativo caso o contexto JS seja recriado.

### Validação
A CI do `main` já comprovou a instalação determinística com:
`npm ci --no-audit --no-fund` — **sucesso**.

### Estado
O repositório mantém um único `package-lock.json` versionado. A partir deste ponto, alterações de dependências devem atualizar o `package.json` e o lockfile juntos, e a CI deve continuar usando `npm ci`.



## DB-010 · 2026-10-07 — Persistência automática de Bluetooth/ECU e histórico TXT rotativo

### Solicitação
Após teste longe do ELM327, foi solicitado:
- salvar automaticamente no celular o adaptador Bluetooth validado;
- preservar a informação de ECU após validação real;
- deixar os próximos diagnósticos priorizarem o adaptador salvo;
- substituir a geração de vários TXT por um único histórico TXT alimentado automaticamente;
- manter no máximo 200 salvamentos no mesmo arquivo, removendo os mais antigos quando o limite for ultrapassado.

### Diagnóstico
O endereço Bluetooth selecionado já existia em `AppSettings.selectedAdapterAddress`, mas o fluxo de conexão bem-sucedido não o persistia automaticamente. O estado OBD já possuía `ecuAddress`, porém não registrava explicitamente quando e como a ECU havia sido validada.

A exportação TXT existente criava um arquivo novo a cada ação manual. O autosave principal era JSON e não possuía um histórico TXT rotativo único.

### Correção implementada
- Criado `src/meriva/autosaveHistoryTxt.ts`.
- Cada `saveNow()` concluído atualiza automaticamente `CONFIG/meriva_smart_autosave_history.txt`.
- O histórico mantém exatamente os **200 salvamentos mais recentes**; o mais antigo é descartado quando um novo excede o limite.
- O histórico usa marcadores de entrada para evitar mistura/corrupção entre snapshots.
- A numeração dos salvamentos permanece monotônica mesmo após a rotação.
- O autosave JSON continua sendo a fonte principal de restauração; o TXT é histórico legível, não substituto do JSON.
- Após uma conexão ELM/ECU validada, `sharedConnection` grava automaticamente `selectedAdapterAddress` em `app-settings.json`.
- A conexão validada também grava no autosave: adaptador, protocolo, horário da conexão, horário da validação ECU e fonte da validação.
- Quando existe endereço ECU no perfil do veículo, ele é preservado com `ecuValidationSource=VEHICLE_PROFILE`; quando não existe, a validação real continua registrada como `OBD_RESPONSE` sem inventar um endereço.
- A validação continua condicionada à resposta OBD real `41 0C`.

### Arquivos afetados
- `src/meriva/autosaveHistoryTxt.ts`
- `src/meriva/autosaveManager.ts`
- `src/meriva/autosaveState.ts`
- `src/meriva/autosaveTxtFormatter.ts`
- `src/obd/sharedConnection.ts`
- `tests/merivaAutosave.test.js`
- `tests/bluetoothLifecycle.test.js`

### Testes adicionados
- Limite de 200 snapshots no TXT histórico.
- Remoção dos snapshots antigos após exceder o limite.
- Persistência e restauração dos dados Bluetooth/ECU.
- Regressão estática para impedir perda da persistência após conexão validada.

### Primeira validação da CI
A CI #876 (run `37697048651`) executou `npm ci` e Expo Doctor com sucesso (`17/17`), mas o `npm run validate` falhou somente no novo teste 13. A implementação do histórico manteve os 200 snapshots; a asserção do teste procurava `NÚMERO: 5` como substring e também casava com `50`, `51` etc. O erro foi do teste, não da lógica de rotação.

### Correção da validação
A asserção foi alterada para procurar o marcador exato `NÚMERO: 5` seguido de quebra de linha. Nenhuma lógica de produção foi alterada por causa desta falha.

### Estado da validação
A CI precisa ser executada novamente após esta correção. **Não considerar esta alteração concluída até a CI terminar verde.**

### Próximo passo
Executar CI completa. Se houver falha, registrar a causa neste diário antes de qualquer nova correção.


### CI final da implementação
PR #26 foi integrado ao `main` no commit `41497d757d3df4749427a5df90f27dea6d149aa5`.

A CI do PR, run **#880 / 37697159495**, terminou com:
- `npm ci --no-audit --no-fund`: sucesso;
- Expo Doctor: **17/17**;
- `npm run validate`: **sucesso**, incluindo os 14 testes de autosave;
- `android-build`: **sucesso**;
- APK Android standalone: compilado, verificado e publicado como artefato.

A primeira execução #876 falhou apenas por uma asserção textual imprecisa no teste do limite de 200 registros; a correção foi registrada antes da nova CI #880, que passou integralmente.

### Estado final
A implementação está integrada ao `main` e validada por CI. O próximo teste físico deve ser feito com o ELM327 conectado e próximo ao telefone, verificando principalmente:
1. reutilização automática do MAC Bluetooth salvo;
2. validação real da ECU por `41 0C`;
3. persistência de adaptador/protocolo/validação ECU;
4. crescimento do TXT único até 200 snapshots e rotação do mais antigo.


## DB-011 · 2026-10-07 — Auditoria e centralização das permissões Android

### Análise
O aplicativo já declarava Bluetooth Classic e localização no `app.json`, e o módulo Bluetooth solicitava `BLUETOOTH_CONNECT/SCAN` no Android 12+. O GPS já solicitava localização em primeiro plano por `expo-location`. Porém, a inicialização fazia essas verificações em fluxos separados, e não havia um único ponto de auditoria das permissões necessárias.

Também foi verificado o armazenamento: o aplicativo usa o diretório privado do app para autosaves e, para exportação escolhida pelo usuário, o Storage Access Framework. Portanto, **não é correto pedir READ/WRITE_EXTERNAL_STORAGE indiscriminadamente**, principalmente nos Androids modernos. Essas permissões não são necessárias para o armazenamento interno nem para o seletor de arquivos do sistema.

### Correção
- Criado `src/permissions/permissionManager.ts`.
- A inicialização agora solicita em sequência as permissões realmente necessárias:
  - Bluetooth/Dispositivos próximos;
  - localização/GPS em primeiro plano.
- O módulo retorna estado `GRANTED`, `DENIED`, `BLOCKED` ou `UNAVAILABLE`.
- O armazenamento é explicitamente classificado como `APP_PRIVATE`, sem pedir uma permissão de armazenamento obsoleta/desnecessária.
- Mantidas as declarações Android existentes para Bluetooth e localização.
- Adicionado teste de regressão em `tests/permissions.test.js`.
- O teste foi incorporado ao comando `npm test`.

### Decisão de segurança
Não foi implementado um pedido indiscriminado de “todas as permissões”. O aplicativo deve pedir somente permissões compatíveis com funcionalidades reais. Pedir câmera, microfone, contatos, telefone, SMS, notificações ou armazenamento amplo sem uso correspondente aumentaria o acesso concedido ao aplicativo sem benefício técnico.

### Próximo passo
Executar CI e gerar novo APK Android. No primeiro lançamento, o usuário deverá conceder Bluetooth e localização quando solicitados. Se uma permissão estiver bloqueada com “não perguntar novamente”, o app deve direcionar o usuário para as configurações do aplicativo.

## DB-012 · 2026-10-07 — Implementação das fases 1, 2 e 3 da nova experiência de telas

### Objetivo
Transformar a tela inicial em um cockpit de diagnóstico e distribuir a profundidade técnica em telas secundárias, sem alterar o transporte Bluetooth/ELM327 existente.

### Fase 1 — Cockpit e navegação
- app/index.tsx foi reorganizado para priorizar estado da ECU, RPM/autonomia como métrica hero, saúde do veículo, cadeia Bluetooth → ELM327 → ECU e ações primárias de Diagnóstico e Dados em Tempo Real.
- Criada app/mais.tsx como hub de módulos.
- Mantida a navegação existente para Bluetooth, Laboratório, Armazenamento e Configurações.

### Fase 2 — Telemetria
- Criada app/dados.tsx.
- A tela acompanha o estado persistido em tempo quase real e apresenta velocidade, distância, consumo, autonomia e últimas leituras de PID.
- Leituras continuam diferenciadas entre REAL e SIMULAÇÃO; a tela não fabrica telemetria.
- O acesso ao Laboratório permite consultar/descobrir PIDs reais.

### Fase 3 — Saúde e raciocínio diagnóstico
- Criada app/saude.tsx.
- A Central de Saúde combina DTCs persistidos e runLocalDiagnostic.
- Hipóteses exibem score, confiança, evidências e próximos testes.
- Criada app/aprendizado.tsx para expor amostras reais, seed, total, PIDs aprendidos e contaminação por simulação.
- Criadas app/veiculo.tsx e app/viagens.tsx para separar perfil do veículo/ECU e histórico de ciclos.

### Testes
- Criado tests/cockpitNavigation.test.js.
- O teste verifica a presença das novas rotas, telas e integração básica com lastReadings, runLocalDiagnostic e amostras reais.
- package.json foi atualizado para executar essa regressão junto da suíte existente.

### Regra de arquitetura
Nenhuma alteração foi feita no protocolo Bluetooth/ELM327 ou no motor de evidências para produzir a nova UI. As telas reutilizam o estado e os serviços existentes.

### Estado
Código implementado no main. A conclusão técnica depende da nova CI: typecheck, suíte completa e Android build precisam terminar verdes antes de considerar as três fases encerradas.

## DB-013 · 2026-10-07 — Consolidação do Diário após as fases 1, 2 e 3

### Registro consolidado
A nova arquitetura de experiência do aplicativo foi registrada neste diário após a implementação do cockpit e das telas secundárias. O foco da mudança foi melhorar a hierarquia de informação sem acoplar a UI ao transporte Bluetooth/ELM327.

### Fluxo de navegação atual
- Cockpit: estado imediato do veículo, conexão, saúde e ações principais.
- Diagnóstico: laboratório OBD existente, responsável pelas operações técnicas.
- Dados em Tempo Real: telemetria e últimas leituras de PID.
- Central de Saúde: DTCs, evidências e hipóteses locais.
- Mais Recursos: entrada organizada para módulos secundários.
- Veículo: perfil do Meriva e estado de ECU/adaptador.
- Viagens: ciclos, distância e consumo registrados.
- Aprendizado: amostras reais, seed e contaminação por simulação.
- Bluetooth / Histórico / Configurações: fluxos existentes preservados.

### Arquivos principais envolvidos
- app/index.tsx
- app/dados.tsx
- app/saude.tsx
- app/mais.tsx
- app/veiculo.tsx
- app/viagens.tsx
- app/aprendizado.tsx
- tests/cockpitNavigation.test.js
- package.json

### Correção durante a implementação
A tela de Viagens foi ajustada para usar o schema real de DriveCycle, utilizando startedAt e distanceTotalKm em vez de campos inexistentes. Isso evita uma quebra de integração entre a nova UI e a camada de dados existente.

### Princípios preservados
1. A UI não cria telemetria falsa.
2. Dados de simulação continuam separados de evidência REAL_OBD.
3. O protocolo de comunicação Bluetooth/ELM327 não foi alterado pela remodelação visual.
4. A persistência/autosave existente continua sendo a fonte de estado.
5. O Diário de Bordo deve registrar correções de integração antes de novas mudanças estruturais.

### Validação
Foi adicionada uma regressão estática para as novas rotas e integrações principais. O último commit de documentação ainda não possui status de CI associado disponível no momento deste registro; portanto, não declarar a nova versão como validada por CI até a execução terminar verde.

### Próximas ações
1. Executar/acompanhar CI completa.
2. Corrigir eventuais erros de TypeScript, testes ou Android build antes de novas mudanças visuais.
3. Após CI verde, validar a experiência no aparelho Android físico com ELM327 real.
4. Na validação física, verificar principalmente os estados: offline, conectando, Bluetooth conectado sem ECU validada, ECU conectada, DTC presente e ausência de dados reais.

## DB-014 · 2026-10-07 — Auditoria da CI #901/#902 + pesquisa de referências OBD

### Falha confirmada antes da nova implementação
As CI #901 (run 37705647976) e #902 (run 37705797381) falharam no mesmo ponto:
- `npm ci --no-audit --no-fund`: **sucesso**;
- `npm run doctor`: **17/17**, **sucesso**;
- `npm run validate`: **falha no TypeScript**;
- `android-build`: **não executado**, pois depende de `validate`.

Erro exato:
`app/index.tsx(237,1): error TS1005: '}' expected.`

### Causa raiz
A remodelação do cockpit deixou o escopo de `HomeScreen` sem a chave de fechamento antes dos componentes auxiliares `CockpitMetric`, `ChainStep` e `StatusCard`. A alteração é sintática e está localizada em `app/index.tsx`.

### Pesquisa de referências
Foram analisados projetos open-source de diagnóstico/OBD, incluindo OBDvis, obd2-dashboard e Free_OBD, além de referências de modos de serviço OBD-II. O padrão de funcionalidades mais útil para o Meriva Smart foi:
- telemetria em janela móvel e tendências;
- classificação por contexto de condução;
- leitura separada de DTC armazenado, pendente e permanente;
- freeze frame associado ao DTC;
- histórico pós-viagem e evidências persistidas;
- diagnóstico determinístico com evidências e limites explícitos;
- saúde do adaptador/conexão, mantendo operação robusta em clones ELM327.

A integração será incremental e compatível com a arquitetura local existente. Não serão introduzidos modos bidirecionais, comandos destrutivos ou sensores extras sem necessidade.

### Documentação técnica revisada
Foi coberta a documentação oficial e as referências técnicas relevantes para esta etapa:
- Android Bluetooth permissions para Android 12+;
- Expo permissions e Expo Location;
- npm `ci` e reprodutibilidade por lockfile;
- GitHub Actions workflow/concurrency;
- referências de serviços OBD-II 01/02/03/04/07/09/0A;
- documentação/referências de ELM327 e padrões de PID.

### Critérios para a nova implementação
1. Nenhuma telemetria sintética entra como evidência real.
2. Funções novas devem ser testáveis sem hardware por meio de funções puras/parsers.
3. DTC não suportado ou sem resposta deve ser classificado como **não disponível**, nunca como ausência de falha.
4. O fluxo Bluetooth Classic atual e a validação ECU por `41 0C` permanecem intactos.
5. A CI deve validar TypeScript, testes e APK antes de considerar a etapa concluída.

### Estado
A falha da CI foi diagnosticada antes de qualquer nova alteração. A próxima sequência é: correção sintática → novas funções diagnósticas → testes/regressões → auditoria → CI.

## DB-015 · 2026-10-07 — Incorporação de funções de referência OBD + auditoria pré-CI

### Correção da CI
A falha das CI #901/#902 foi corrigida em `app/index.tsx`: faltava o fechamento do componente principal `IndexScreen` antes das funções auxiliares. A causa era sintática e impedia o TypeScript; o Android-build era corretamente bloqueado pelo `needs: validate`.

### Funções absorvidas da pesquisa
Com base em OBDvis, obd2-dashboard, Free_OBD e referências dos serviços OBD-II, foram incorporadas funções compatíveis com a arquitetura atual:
- **Telemetria móvel por PID**: janela de até 120 amostras por PID, estatística atual/mínima/máxima/média, delta e mini-gráfico textual.
- **Contexto operacional**: classificação determinística em `IDLE_COLD`, `IDLE_WARM`, `ACCELERATION`, `DECELERATION`, `CRUISE` ou `UNKNOWN`.
- **Proteção contra dados envelhecidos**: contexto operacional só usa leituras recentes; dados com mais de 10 s ficam fora da classificação.
- **DTC multiestado**: varredura separada dos serviços `03`, `07` e `0A` para armazenados, pendentes e permanentes.
- **Sem falso negativo por indisponibilidade**: serviço OBD sem resposta utilizável aparece como `N/D`, não como “nenhuma falha”.
- **Persistência semântica de DTC**: códigos armazenados que deixam de aparecer em uma leitura válida do serviço 03 podem passar para `INACTIVE`; o histórico continua preservado.
- **Saúde do ELM327**: a tela Bluetooth passou a exibir comandos bem-sucedidos, média de resposta, timeouts, erros, ausência de dados e indicação de recuperação.

### Arquitetura preservada
- Nada de BLE foi introduzido no lugar do Bluetooth Classic já usado pelo aplicativo.
- Nenhum comando destrutivo foi disparado automaticamente.
- Não foi adicionada dependência externa para gráficos.
- Telemetria da janela móvel aceita somente leituras `REAL`; simulação é explicitamente ignorada.
- O aprendizado existente continua separado da janela de telemetria e das amostras de simulação.

### Arquivos principais adicionados/alterados
- `src/obd/liveTelemetry.ts`
- `src/obd/dtcScanner.ts`
- `src/obd/parser.ts`
- `src/types/sourceTypes.ts`
- `src/database/dtcManager.ts`
- `src/meriva/autosaveIntegration.ts`
- `src/trip/autoTripService.ts`
- `app/index.tsx`
- `app/laboratorio.tsx`
- `app/dados.tsx`
- `app/saude.tsx`
- `app/bluetooth.tsx`
- `tests/liveTelemetry.test.js`
- `tests/dtcScanner.test.js`
- `tests/cockpitNavigation.test.js`
- `package.json`

### Auditoria realizada
- Os **14 arquivos JSON** presentes no repositório foram analisados por parsing estrutural; nenhum apresentou JSON inválido.
- `package-lock.json` mantém `lockfileVersion: 3`, projeto/versão corretos e 1.205 entradas de pacotes. As dependências e devDependencies do root correspondem aos ranges do `package.json`; a diferença de comparação textual foi somente ordem das chaves JSON.
- O lockfile não foi alterado porque esta etapa não adicionou nem removeu dependências.
- A regressão estática de cockpit foi ampliada para cobrir tendências, DTC 03/07/0A e saúde do ELM.
- Foi adicionada cobertura unitária para janela móvel, isolamento de simulação, contexto, dados envelhecidos e parsing/indisponibilidade dos serviços DTC.

### Documentação de referência utilizada
A etapa revisou a documentação oficial relevante de Android Bluetooth, Expo Permissions/Location, npm `ci` e GitHub Actions, além de referências de serviços OBD-II e projetos open-source do mesmo domínio. A pesquisa não significa “toda a documentação existente na internet”; o escopo foi a documentação técnica diretamente aplicável ao aplicativo e às funções implementadas.

### Estado antes da nova CI
As correções e auditorias de código estão registradas. A nova CI deve ser o árbitro final de TypeScript, suíte completa e Android Release. Não considerar a etapa concluída até os dois jobs obrigatórios terminarem verdes.

## DB-016 · 2026-10-07 — Correção revelada pela CI #926 antes do fechamento

### Falha observada
A CI #926 (run 37707128150), executada sobre o commit `e9f3b92c719ebbb579f5770a2c95a683749200bc`, confirmou `npm ci` e Expo Doctor **17/17**. O `npm run validate` falhou no TypeScript com quatro erros:
- `app/bluetooth.tsx(164,66)`: estilo `warning` inexistente;
- `app/dados.tsx(20,46)`: `AutoTripServiceState` não possui `currentSpeedKmh`;
- `app/dados.tsx(22,38)` e `(22,64)`: `consumptionKml` pode ser `null`;
- `app/viagens.tsx(5,32)`: `DriveCycle` importado de módulo que não o exporta.

### Correção
- adicionado o estilo `warning` em Bluetooth;
- velocidade da tela Dados passou a vir do `gpsTracker.getState()`;
- consumo recebeu narrowing explícito para lidar com `null`;
- `DriveCycle` passou a ser importado de `src/data/driveCycles`, que é a origem do tipo.

Nenhuma dependência foi adicionada nem o contrato Bluetooth/ELM327 foi alterado.

### Estado
Os quatro erros do #926 foram corrigidos antes do fechamento da nova execução. A próxima CI é obrigatória para confirmar TypeScript, suíte completa e Android Release.

## DB-017 · 2026-10-07 — Correção do harness DTC revelada pela CI #929

### Falha
A CI #929 (run 37707396660), no commit `38911b8e79b43dcdfcdc18b18cca39c1a138151c`, passou por `npm ci`, Expo Doctor e **typecheck**. A nova suíte `liveTelemetry.test.js` também passou. O primeiro teste DTC falhou por infraestrutura do próprio teste: o loader CommonJS transpila `parser.ts` isoladamente, mas o parser depende em runtime de `pidDefinition.ts` e `formulaEngine.ts`, que continuam como TypeScript e não podem ser resolvidos pelo `require` padrão do harness.

### Correção
A lógica de parsing DTC foi extraída para `src/obd/dtcParser.ts`, que não possui dependências de runtime. `parser.ts` continua exportando `parseDtcResponseForService` para preservar a API existente, enquanto `dtcScanner.ts` e o teste passam a usar o módulo isolado.

### Estado
A falha não alterava a lógica de produção do parser OBD; o problema era a estratégia de carregamento do teste. A nova CI deve confirmar a suíte completa e liberar o Android build.

## DB-018 · 2026-10-07 — Correção final do parser DTC revelada pela CI #930

### Falha
A CI #930 (run 37707510064), no commit `87571e97d68ea993222dbb03b229fdffba17ba20`, confirmou `npm ci` e Expo Doctor **17/17**. O `liveTelemetry.test.js` havia passado e a suíte chegou ao `typecheck`, mas `parser.ts(155,10)` falhou com `TS2304: Cannot find name 'parseDtcResponseForService'`.

### Causa raiz
Ao extrair o parser DTC para `src/obd/dtcParser.ts`, `parser.ts` ficou apenas com o `export { ... }` e perdeu o import local necessário para a função legada `parseDtcResponse()` continuar delegando ao novo módulo.

### Correção
Restaurado o import local de `parseDtcResponseForService` em `src/obd/parser.ts`. A API de export permanece compatível e `dtcScanner.ts` continua usando o módulo isolado para evitar dependências de runtime no harness.

### Estado
A próxima CI deve confirmar TypeScript + testes completos e, em caso de sucesso, liberar o job Android Release.

## DB-019 · 2026-10-07 — Correção final do loader de testes DTC revelada pela CI #931

### Falha
A CI #931 (run 37707607771), no commit `dbada2ded42be53a67a89644c2073bcd6385bbd0`, passou por `npm ci`, Expo Doctor e **typecheck**. A falha ocorreu no primeiro teste DTC, com `MODULE_NOT_FOUND: ./dtcParser`.

### Causa raiz
O novo `dtcParser.ts` está corretamente resolvido pelo bundler TypeScript/Metro, mas o harness JavaScript transpila `dtcScanner.ts` isoladamente e o `require` CommonJS não resolve automaticamente um módulo relativo `.ts` sem extensão.

### Correção
O loader de `tests/dtcScanner.test.js` agora intercepta apenas o import relativo `./dtcParser` quando a origem é `dtcScanner.ts`, transpila esse módulo e restaura o loader global imediatamente após o carregamento. A lógica de produção não foi alterada.

### Estado
A próxima CI deve repetir a suíte a partir do mesmo ponto, agora com o harness capaz de carregar a dependência TypeScript isolada.


## DB-020 · 2026-10-08 — Rotação livre do Android + proteção responsiva do cockpit

### Objetivo
Permitir rotação livre da aplicação Android, sem alterar o protocolo Bluetooth/ELM327, a persistência ou o fluxo diagnóstico, e impedir que a mudança de orientação cause overflow, compressão indevida ou perda de acessibilidade visual na tela principal.

### Configuração nativa/Expo
A auditoria confirmou que o projeto já usa:
- `app.json → expo.orientation: "default"`;
- `npx expo prebuild --clean --platform android` na CI.

A documentação oficial do Expo define `orientation: "default"` como ausência de bloqueio de orientação. Portanto, **não foi adicionado `android:screenOrientation="portrait"` nem uma trava equivalente no `MainActivity`**. Isso é importante porque alterações manuais no Android gerado poderiam ser sobrescritas pelo prebuild.

### Proteção da UI
- `app/index.tsx` continua usando `useWindowDimensions()`, que reage à mudança de largura/altura causada pela rotação.
- O cockpit mantém `ScrollView` vertical com `contentContainerStyle`, largura de conteúdo controlada e `maxContentWidth`.
- Em landscape, ações principais passam para duas colunas.
- Em landscape, os quatro cartões de status usam distribuição horizontal sem largura fixa.
- Cabeçalho, botões e bloco “Mais Recursos” receberam proteção contra compressão/overflow de texto.
- O conteúdo passou a usar `react-native-safe-area-context`.
- `app/_layout.tsx` agora fornece `SafeAreaProvider` para as telas.

### Testes
Criado `tests/orientationLayout.test.js`, cobrindo:
1. `orientation: "default"` no app config;
2. presença de `useWindowDimensions`;
3. estratégia de layout para landscape;
4. `ScrollView` com conteúdo flexível;
5. Safe Area Provider;
6. ausência de locks de orientação no código da tela.

O teste foi incorporado ao comando `npm test`. Nenhuma dependência nova foi adicionada; portanto, `package-lock.json` não precisa ser regenerado.

### Referências técnicas
A implementação foi alinhada à documentação oficial do Expo para `orientation`/Prebuild e à documentação do React Native para `useWindowDimensions` e `ScrollView`. A escolha de `useWindowDimensions` é deliberada porque a API atualiza os valores quando a janela muda de tamanho, inclusive durante rotação.

### Estado
A configuração de rotação está implementada no repositório. A conclusão da etapa depende da CI completa: typecheck, suíte de testes e Android Release devem terminar verdes. Após isso, o APK deve ser validado fisicamente em retrato e paisagem, incluindo rotação durante a tela principal e nas telas de diagnóstico.


## DB-021 · 2026-10-08 — Auditoria de integridade: Safe Area, JSON e retry Bluetooth

### Objetivo
Continuar a auditoria de integridade solicitada após a etapa de rotação livre, sem executar a CI nesta rodada.

### Achados confirmados e correções

#### Interface e rotação
As dez telas do aplicativo passaram a usar `react-native-safe-area-context` com `SafeAreaView` e edges explícitas. Foi criada a função `useMidLayout()` em `src/ui/midLayout.ts` para centralizar a leitura responsiva de largura/altura.

As telas secundárias passaram a aplicar `horizontalPadding` e `maxContentWidth`. Dados, Viagens e Aprendizado receberam distribuição específica para landscape nos cartões métricos. Textos e linhas críticas receberam proteção contra compressão/overflow.

Arquivos principais:
- `src/ui/midLayout.ts`
- `app/mais.tsx`
- `app/dados.tsx`
- `app/saude.tsx`
- `app/veiculo.tsx`
- `app/viagens.tsx`
- `app/aprendizado.tsx`
- `app/bluetooth.tsx`
- `app/armazenamento.tsx`
- `app/configuracoes.tsx`
- `app/laboratorio.tsx`

#### Auditoria cruzada dos JSON
Foi encontrada e corrigida uma inconsistência real no catálogo: o PID `0151` usava `unit: "U8"`, mas essa chave não existia em `units.json`. O metadado passou a usar `unit: "code"` e `units.json` ganhou a definição de código enumerado.

O teste `tests/knowledgeJson.test.js` foi ampliado para validar:
- presença e tipo das versões dos catálogos;
- nomes, bytes, unidade e formulaId de cada PID;
- cruzamento PID ↔ unidade;
- cruzamento PID ↔ fórmula;
- compatibilidade mínima entre bytes e operação da fórmula;
- igualdade dos conjuntos PID ↔ ranges;
- parâmetros das fórmulas e operações realmente implementadas;
- consistência entre PIDs confirmados/candidatos e o catálogo principal;
- confiança e evidência RAW;
- alvos de confirmação;
- estrutura de combustíveis;
- IDs/prioridades dos protocolos;
- contrato do `bluetooth_config.json`;
- estrutura, score, DTCs e condições das regras diagnósticas.

Arquivos:
- `src/knowledge/pids.json`
- `src/knowledge/units.json`
- `tests/knowledgeJson.test.js`

#### Permissões
A implementação de permissões Bluetooth foi centralizada. `bluetoothManager.ts` deixou de manter uma segunda implementação de `PermissionsAndroid.requestMultiple` e passou a delegar ao `permissionManager`.

Foi adicionada regressão para impedir o retorno da implementação duplicada.

Arquivos:
- `src/permissions/permissionManager.ts`
- `src/obd/bluetoothManager.ts`
- `tests/permissions.test.js`

#### Retry Bluetooth/ELM327
A auditoria encontrou uma divergência funcional: `AppSettings.elmMaxConnectionAttempts` era exposto na interface e passado à conexão, mas o loop real usava apenas o limite fixo do catálogo, ignorando essa configuração.

Correção:
- o limite efetivo passou a respeitar `maxConnectionAttempts` quando positivo;
- valor 0 legado/ausente cai para o limite-base finito de 20;
- o default do aplicativo passou a ser 20;
- a interface deixou de oferecer “INFINITO” e passa a oferecer 3, 10 ou 20;
- `elm327Compatibility.ts` passou a refletir o mesmo default seguro;
- comentários e documentação foram sincronizados;
- documentação histórica foi complementada para distinguir o estado antigo do comportamento atual.

Arquivos:
- `src/database/appSettings.ts`
- `src/obd/elm327Compatibility.ts`
- `src/obd/bluetoothManager.ts`
- `src/obd/sharedConnection.ts`
- `app/configuracoes.tsx`
- `tests/bluetoothConfig.test.js`
- `docs/ELM327_ENGINEERING_PLAYBOOK.md`
- `docs/AUDITORIA_DOCUMENTACAO_2026-10-06.md`

### Commits desta rodada
- `8ba1a6f0f5a652a26f0020b7a9aa47821585f203`
- `e15060455e5294d5f16073635be33e12683b3969`
- `89810074e46011f434e6eb42853a4fd0d3cc0c04`
- `01066f517762d5717807848014c5c4fa090d2577`
- `ec3cd07d7c69f18311daa2087492ae1d1e6393d0`
- `563ea877cc47ba3494a28371507feb8424465383`
- `83600e943d4596ddc5031f1eaedac24c06bc5c40`
- `65488d7bcaa29db89d425306327d5a81a86d7e7e`
- `cfc7fdbf2d1a7ab61f439f2cb39a350fe35e7e83`
- `e96d706f0e14538b6710d38af35b769ae6e01670`
- `fa1d8380bec0cc07b0a853e74417d03c919f1f44`
- `a7a72677610a8b3af41fbd5203300e34b609c336`
- `f065d19d86b99098cc470430ee8c1c602de02a87`
- `6bbd8c0105233b583fad9b67340d342ada5a1ba5`
- `808b8ab828e80cb5443b77a52aa6e4247c7d636b`
- `f91f0ea2575e44ee1d333b9ca53f5f7fc85724e7`
- `55f60d75777ecf77c7d0768a2a02c2c4b57bc357`
- `1ccdf37ff1f3dc464dee46051ebdbda5d10da571`
- `01519e9f39fe9c4941abddb632e2634ab0a818ba`
- `d14e0f1ba1cb0ce3939f8be6bed7ec43651971f9`
- `103243b10222f77fc33ec067522addd45671854e`
- `42ff34266390a61f0034c62a226f37a235cb97a7`
- `502e52faad1d81323b3d2cb0617bfa26ccbb2c69`
- `fe0512dfdf901289809bfa238ae4b08bc663ce61`
- `c6c99cb82315f21d62c8edf7041956303b383b41`
- `02f671f142c13ad01f8f0e311f5b4f8e54b19d2a`
- `354f9ec31c7f684fe19e92d4429de5007f621cad`
- `59453ebcb089153280990ccb066141a990ed7fce`

### CI
A CI **não foi executada nesta rodada**, conforme solicitado.

### Estado
As alterações foram gravadas no `main`. Foi feita somente verificação estrutural por leitura do conteúdo do repositório e checagens estáticas; TypeScript, suíte completa e APK ainda precisam ser confirmados pela próxima CI.

### Próximo passo
Executar a CI completa somente na próxima etapa. Se houver falha, registrar primeiro a causa e depois corrigir.

## DB-022 · 2026-10-08 — Adaptação completa das telas à rotação do celular

### Objetivo
Garantir que todas as telas do MERIVA SMART acompanhem a mudança entre portrait e landscape, recalculando dimensões e reorganizando blocos sem travar a orientação nem criar overflow horizontal.

### Correções implementadas
- app/index.tsx passou a consumir useMidLayout() diretamente, eliminando leitura duplicada de useWindowDimensions().
- app/mais.tsx ganhou grade de módulos em duas colunas no landscape.
- app/bluetooth.tsx reorganiza os quatro blocos de conexão em uma grade responsiva no landscape.
- app/saude.tsx organiza conexão e contexto em colunas quando há largura suficiente.
- app/veiculo.tsx coloca perfil do veículo e detalhes da ECU lado a lado no landscape.
- app/armazenamento.tsx coloca uso de espaço e viagens salvas lado a lado no landscape.
- app/configuracoes.tsx passou a permitir quebra dos grupos de opções, evitando compressão dos botões em telas estreitas.
- app/dados.tsx protege a área de tendências contra compressão indevida.
- app/viagens.tsx protege nomes longos e separa o valor da distância sem sobreposição.
- app/aprendizado.tsx estabiliza as linhas de métricas e valores em larguras menores.
- app/laboratorio.tsx torna a barra de conexão quebrável e corrige erro sintático existente em dtcKind.
- Mantido expo.orientation = default e SafeAreaProvider/react-native-safe-area-context; não foi introduzido lock nativo de orientação.

### Regressão
tests/orientationLayout.test.js foi endurecido para exigir, em todas as 10 telas:
- useMidLayout();
- aplicação do padding responsivo;
- maxContentWidth;
- Safe Area moderna com edges explícitas;
- ausência de SafeAreaView legado;
- ausência de lock de orientação.

### Validação
As alterações foram gravadas no main. As execuções automáticas de CI disparadas pelos pushes intermediários foram canceladas quando substituídas por commits seguintes; a execução final deve ser considerada a referência para typecheck, suíte e Android build.

### Estado
A configuração de rotação livre e o layout responsivo estão implementados no código. A validação física continua necessária em Android real, alternando portrait/landscape nas telas principais e secundárias e verificando ausência de clipping, overflow e controles inacessíveis.

### Próximo passo
Concluir a CI do commit final e, em seguida, validar o APK em um dispositivo Android físico nas duas orientações.
### Correção pós-CI
A CI intermediária detectou erro de compilação JSX em app/bluetooth.tsx: o View screenFrame ficou com o fechamento incompleto durante a transformação responsiva.
Correção aplicada: fechamento do componente restaurado e tela Bluetooth mantida com grade responsiva de conexão.
A execução final de CI correspondente ao commit de correção foi disparada automaticamente e ainda está pendente no momento deste registro.

## DB-023 · 2026-10-08 — Auditoria e correção do autosave/persistência

### Objetivo
Corrigir os problemas evidenciados pelo histórico de salvamentos automáticos: tempestade de snapshots críticos, estados redundantes, `Saved At: N/D`, perda da validação ECU ao desconectar, ambiguidade entre conexão atual e último protocolo, semântica incorreta de ocorrências DTC e mistura de estado REAL_OBD/SIMULACAO.

### Plano de correção registrado antes do código
- Coalescer solicitações de salvamento crítico em uma janela curta, preservando salvamento imediato para transições realmente críticas de conexão quando necessário.
- Evitar histórico TXT redundante quando o estado persistido efetivo não mudou.
- Persistir `metadata.savedAt` junto do snapshot e mantê-lo sincronizado com o envelope.
- Preservar `ecuValidatedAt` e `ecuValidationSource` quando o estado de conexão passar para desconectado; a conexão atual e a última validação passam a ser conceitos independentes.
- Representar protocolo atual somente quando conectado e manter o último protocolo conhecido em campo separado.
- Não incrementar `DtcRecord.occurrences` a cada leitura repetida do mesmo DTC; a contagem passa a representar novas detecções após ausência/inatividade, enquanto leituras repetidas atualizam `lastSeen`.
- Manter `REAL_OBD` como única fonte de evidência real e registrar consultas de simulação somente como telemetria/configuração de simulação.
- Preservar limite de 200 snapshots e descarte FIFO dos mais antigos.

### Estado
Esta entrada foi registrada antes das alterações de código. A CI permanece deliberadamente não executada nesta etapa.


### Implementação desta auditoria

#### Alterações efetivamente aplicadas
- src/meriva/autosaveManager.ts: introduzido fingerprint do estado persistível, ignorando apenas metadata.savedAt; snapshots semanticamente idênticos deixam de gerar nova entrada no TXT. metadata.savedAt agora é preenchido no momento da persistência e fica igual ao envelope.savedAt.
- src/meriva/autosaveManager.ts: eventos críticos passaram a usar um coalescedor de 500 ms. A API continua retornando Promise<boolean>, preservando a semântica de await forceSaveOnObdEvent(); múltiplas solicitações próximas compartilham o mesmo flush.
- src/meriva/autosaveState.ts: adicionado lastKnownProtocol, separado de protocol, para distinguir conexão atual de último protocolo conhecido.
- src/obd/sharedConnection.ts: ao desconectar, protocol atual é limpo, lastKnownProtocol é preservado e a validação ECU (ecuValidatedAt/ecuValidationSource) continua persistida. Ao conectar, o protocolo validado atualiza também lastKnownProtocol.
- app/laboratorio.tsx: os dois fluxos locais de desconexão adotam a mesma separação de protocolo e preservação de validação ECU.
- src/meriva/autosaveTxtFormatter.ts: o TXT passa a mostrar Último protocolo conhecido e explicita fonte=REAL ou fonte=SIMULACAO em cada leitura.
- src/database/dtcManager.ts: criada nextDtcOccurrences(). Leituras repetidas de um DTC ainda ativo não inflacionam occurrences; uma nova contagem só começa depois de o código estar inativo/histórico e voltar a ser detectado.
- app/laboratorio.tsx: varredura 03/07/0A e leitura 03 passaram a usar a nova semântica de ocorrências.
- tests/merivaAutosave.test.js: adicionados testes para Saved At, coalescência crítica, deduplicação de snapshot e preservação da ECU/protocolo após desconexão.
- tests/regression.test.js: adicionada regressão para a semântica de ocorrências DTC.

#### Invariantes preservadas
- Histórico TXT continua com limite de 200 salvamentos, removendo os mais antigos.
- Bluetooth Classic/ELM327 permanece inalterado quanto ao transporte.
- A ECU só é considerada validada após a resposta real exigida pelo fluxo existente (010C/41 0C).
- Dados de SIMULACAO continuam fora do aprendizado/banco de evidências reais.
- Nenhuma dependência foi adicionada e package-lock.json não foi alterado.

#### Commits desta implementação
- 3642b6018315948a467d1a9e388b7f383aff5325 — registrar plano de correção antes do código (diário)
- 049952c9cfbc46613a82f140a245f1eed3010141 — separar protocolo atual do último conhecido
- e6bd62eed725a1235a76a4fd80c42d4000048cfe — coalescer/deduplicar autosave
- 853dcc37b107b44e09c5572799677af013474749 — declarar fingerprint no runtime
- 24742c8cda29825b9beb05118d99c06a129f0242 — consolidar eventos críticos OBD
- 06ce75489bcc5e9950fe918f96825b51641ba918 — preservar último protocolo na conexão compartilhada
- 5275acc3fb847abb5ce8f1f50a54d43bc8bd0819 — alinhar desconexão do laboratório
- 5bceb865ec99a7cc0e5a4d6e94899fef82d91f1a — corrigir semântica de ocorrências DTC
- 1f1aea30b4a604ac3b671dc0c701887677870b2e — aplicar semântica DTC no laboratório
- a7cc63e20253205697d7ecff54749420fe3d0061 — explicitar último protocolo no TXT
- 338e4bf43a4b6bf4a569c3126bef4c2830047404 — explicitar fonte REAL/SIMULACAO nas leituras
- 295a7a9990cee1a4c1555664a2015006e4388762 — testes de deduplicação/Saved At/coalescência
- 505bc0f1cfabbd425d295fd02a3b2ac7d5119688 — teste da semântica de ocorrências DTC
- c5733ff0f2e30a0188ce3efd790282b06ce69bee — preservar await no coalescedor crítico
- 36380e7d991bd3807714bb35891018c700786802 — resolver aguardantes do coalescedor
- 846ef5ee3a0a15a4509e07041694ecd42cc0a6ce — resolver aguardantes em qualquer flush efetivo
- ed2c1fbe18f13ed2af1961bdbb290e75d3e9692b — teste de persistência da ECU após desconexão

### Validação desta rodada
Foi feita apenas auditoria por leitura do código e alterações controladas no repositório. CI não foi executada, conforme solicitado. A próxima validação deve verificar TypeScript, suíte completa e Android Release.


### Correção complementar após auditoria cruzada
- app/_layout.tsx: o bootstrap de conexão não pode reconstruir state.obd do zero, pois isso apagava a validação ECU e o último protocolo persistidos pelo sharedConnection. O estado agora é mesclado e lastKnownProtocol é preservado.
- app/index.tsx: mesma correção no cockpit principal; a atualização visual/persistente de conexão agora preserva ECU validada e último protocolo conhecido.
- Commits: 2ecaee6031720dd291a67a6a0003575a34c2ee03 e 17e88015991e9ecf9856e4944a162f6171283dc3.


### Correção final do coalescedor crítico
- src/meriva/autosaveManager.ts: quando um flush já está em andamento, uma nova chamada agora aguarda a persistência atual antes de decidir o resultado, evitando que await forceSaveOnObdEvent() retorne false apenas por concorrência interna.
- Commit: 2264d67edcc43adcbbbf70f3baad341a5bf1caaf.

### Estado final desta rodada
Todas as alterações desta auditoria estão gravadas no main e o Diário de Bordo foi atualizado com os hashes. Não foi executada CI.


## DB-024 · 2026-10-08 — Auditoria sênior: identificação de PIDs e DTCs na interface

### Problema reportado
O aplicativo consegue consultar PIDs e detectar DTCs da ECU, porém a interface expõe principalmente o identificador bruto (PID/código) e não apresenta de forma suficiente **o que aquele identificador representa**, dificultando a leitura técnica do diagnóstico.

### Auditoria planejada antes do código
- Mapear o fluxo real de PID: resposta ELM327 → parser → definição do PID → estado persistido → telas.
- Mapear o fluxo real de DTC: resposta ECU → parser → persistência → Central de Saúde/Laboratório.
- Reutilizar os catálogos existentes em vez de duplicar nomes na UI.
- Para DTCs sem descrição local, exibir explicitamente que a descrição não está catalogada, sem inventar diagnóstico.
- Exibir para cada PID: código, nome, descrição, valor/unidade, status e origem REAL/SIMULAÇÃO quando aplicável.
- Exibir para cada DTC: código, descrição técnica, estado, ocorrência e origem REAL_OBD.
- Manter a distinção entre evidência da ECU e hipótese diagnóstica; descrição de código não deve ser apresentada como causa confirmada.
- Auditar especialmente os códigos já observados no histórico desta sessão, incluindo P0135 e P0420, sem transformar esses exemplos em novos dados da ECU.
- Adicionar regressões para impedir retorno da UI ao estado “somente código”.
- Não executar CI nesta rodada.

### Estado
Plano registrado antes das alterações. Próximo passo: implementar a identificação técnica na camada de conhecimento e nas telas, depois registrar os hashes finais neste diário.


## Implementação — identificação técnica de PIDs e DTCs

### Achados confirmados
- O catálogo src/knowledge/pids.json já possuía nomes, descrições, unidade e classificação para os PIDs conhecidos, e getPidDefinition() já existia; a falha era principalmente de apresentação: a descoberta expunha os identificadores sem uma camada clara de identificação técnica.
- A persistência de DTC já aceitava description, mas os registros gerados no laboratório não preenchiam esse campo.
- A Central de Saúde mostrava código/status/ocorrências, porém não a descrição técnica do código.
- A tela de Dados mostrava o nome armazenado do PID, mas não garantia que o usuário visse o código + definição do catálogo.
- Não havia catálogo local dedicado para os DTCs efetivamente utilizados/observados.

### Correções implementadas
- Criado src/knowledge/dtc_catalog.json com catálogo mínimo rastreável para P0135, P0420, P0123, P0301 e P0133.
- Criado src/obd/dtcDefinition.ts para resolução centralizada de descrição de DTC.
- app/laboratorio.tsx agora identifica os PIDs descobertos com código, nome, descrição, unidade/classificação e sinaliza explicitamente PIDs sem definição local.
- app/laboratorio.tsx agora identifica DTCs por código + nome + descrição, sem transformar a descrição do código em causa confirmada.
- app/laboratorio.tsx passa a persistir a descrição catalogada no DtcRecord.
- app/saude.tsx passa a mostrar código, nome, descrição, estado, ocorrências e fonte do DTC.
- app/dados.tsx passa a mostrar código + nome + descrição do PID nas últimas leituras reais.
- tests/knowledgeJson.test.js passou a auditar estrutura, unicidade e conteúdo mínimo do catálogo DTC.

### Interpretação técnica dos códigos observados
- P0135: circuito do aquecedor do sensor de oxigênio, Banco 1 Sensor 1. Indica uma falha monitorada no circuito do aquecedor; não prova sozinho que o sensor inteiro esteja defeituoso.
- P0420: eficiência do sistema catalisador abaixo do limite monitorado no Banco 1. Indica uma condição de eficiência abaixo do limiar da ECU; não prova sozinho que o catalisador seja a única causa, pois diagnóstico exige correlação com O2, mistura, falhas de combustão e condições de operação.
- Os dois códigos acima foram tratados como exemplos do histórico já fornecido; esta alteração não cria novas evidências da ECU.

### Invariantes
- REAL_OBD continua sendo a fonte de evidência real.
- SIMULAÇÃO continua explicitamente separada e não aumenta confiança diagnóstica.
- Ausência de descrição no catálogo é exibida como ausência de conhecimento local, não como diagnóstico inventado.
- O fluxo de validação ECU 010C → 41 0C não foi alterado.
- Bluetooth Classic/ELM327 e persistência de autosave não foram alterados nesta rodada.
- Nenhuma dependência foi adicionada e package-lock.json permanece inalterado.

### Commits
- 0a785c98101aa0d06b74e0ce98cd7a9a2d0d8321 — plano desta auditoria registrado antes do código.
- 2d1d436e69a0ed079654da088edf8bf2a2c0a059 — catálogo DTC.
- 42cfff516db9a6b2fcfbe3821eb5c289e9e0f8e3 — resolvedor de definição DTC.
- aa8efe60020be1a14a64e096a8c4b4facd62716c — identificação técnica no laboratório.
- 8c5bce5cea03d99f4e50b67b53def2e8f28e9bd0 — persistência da descrição DTC.
- fe9a979c3242969879849b7f7c16ecf4e7148eb0 — identificação DTC na Central de Saúde.
- ec8a435b52cfe79f00394fef500c1d0fd3fe57e9 — identificação PID na tela de Dados.
- 6728543d5cbfc0dc2852305b74967787b508e74f — auditoria do catálogo DTC.

### Validação
Foi feita leitura estática e auditoria cruzada do diff. CI não foi executada, conforme solicitado. A próxima CI deve confirmar TypeScript, testes e Android Release.


## DB-025 · 2026-10-08 — Auditoria sênior documental de PIDs, DTCs e motor diagnóstico

### Solicitação
Pesquisar documentação técnica da Chevrolet Meriva, referências de PIDs OBD-II e DTCs, auditar os catálogos e as fórmulas do aplicativo e corrigir o que estiver tecnicamente inconsistente. O foco é o veículo Meriva 1.4 8V Econo.Flex 2011/2012 já documentado no projeto, sem transformar dados de outras motorizações Meriva em compatibilidade confirmada.

### Evidência documental pesquisada
- Manual oficial Chevrolet Meriva MY12 / Brasil, usado como referência de configuração física e faixa de marcha lenta do veículo do projeto.
- Chevrolet Brasil: página oficial de manuais de anos anteriores confirma disponibilidade dos manuais Meriva 2008–2012.
- SAE J1979 / ISO 15031-5: referência para fórmulas e descoberta de PIDs OBD-II.
- SAE J2012: referência para formato e definições padronizadas de DTC.
- Tabelas de aplicação automotiva foram usadas somente para corroborar família de ECU/protocolo; não serão tratadas como prova de PID individual.

### Plano técnico antes do código
1. Auditar cada PID do catálogo contra bytes e fórmula.
2. Corrigir qualquer inconsistência de bytes/formula, começando pelo PID 0114, que deve transportar dois bytes no padrão OBD-II embora a tensão do primeiro byte seja a grandeza exibida.
3. Manter PIDs padrão separados de PIDs realmente confirmados na Meriva; seed CarScanner continua sendo referência, não evidência atual.
4. Auditar DTCs pelo padrão SAE J2012 e separar definição padronizada de diagnóstico específico da Meriva.
5. Impedir que DTCs históricos/inativos sejam tratados pelo motor como falhas atuais.
6. Aprimorar o motor local para usar contexto operacional e evidência corroborativa, sem transformar limiares heurísticos em limites de fábrica.
7. Usar o Manual Meriva para contextualizar a marcha lenta do veículo documentado, sem aplicar essa faixa a outras motorizações.
8. Adicionar regressões para fórmulas, bytes, DTCs e regras de diagnóstico.
9. Atualizar documentação técnica e Diário de Bordo com fontes e hashes.
10. **Não executar CI nesta rodada.**

### Invariantes
Bluetooth Classic/ELM327, gate ECU 010C → 41 0C, separação REAL_OBD/SIMULACAO, autosave e package-lock não devem ser alterados nesta auditoria.


## DB-026 · 2026-10-08 — Resultado da auditoria documental de PIDs, DTCs e motor diagnóstico

### Pesquisa concluída
Foram consultadas referências oficiais e técnicas antes da correção:
- Chevrolet Brasil — página oficial de manuais de anos anteriores, que lista Meriva 2008–2012.
- Manual do Proprietário Chevrolet Meriva MY12, Brasil, já referenciado pelo projeto.
- SAE J1979_202505 e SAE J1979-DA para serviços OBD-II e registro de identificadores de dados.
- SAE J2012 para definições padronizadas de DTC.
- Referências abertas de implementação OBD-II apenas para conferência cruzada.

### Achado principal em PID
Foi encontrada uma inconsistência real no PID 0114: o catálogo declarava bytes=1, embora a resposta padronizada do PID tenha dois bytes. A tensão usa o byte A; o segundo byte carrega informação adicional de ajuste do sensor.

Correção aplicada:
- src/knowledge/pids.json: 0114.bytes = 2.
- src/knowledge/meriva_confirmed_pids.json: candidato 0114.bytes = 2.
- src/knowledge/formulas.json: documentação explícita de que O2_VOLTS usa o byte A.
- tests/regression.test.js: resposta 41 14 6A 80 deve produzir 0,53 V e preservar os bytes recebidos.

### Auditoria dos demais PIDs
As fórmulas catalogadas para 0104, 0105, 0106, 0107, 010B, 010C, 010D, 010E, 010F, 0110, 0111, 012F, 0131, 0142, 0151, 0152 e 015E foram mantidas após cruzamento com o modelo padrão OBD-II. O PID 0151 permanece enumerado pelo catálogo de combustível e não é tratado como medição da composição do tanque.

### Auditoria dos DTCs
O catálogo src/knowledge/dtc_catalog.json passou a declarar explicitamente SAE J2012 e standardized=true para P0123, P0133, P0135, P0301 e P0420.

A definição de DTC continua separada da causa. Nenhum DTC proprietário da Meriva foi inventado sem fonte documental adequada.

### Aprimoramento do motor diagnóstico
src/diagnostics/diagnosticEngine.ts foi endurecido para:
- aceitar somente DTC REAL_OBD com status ativo (CONFIRMED, PENDING, PERMANENT, CURRENT) como evidência de falha atual;
- bloquear DTC histórico/inativo e fonte não real;
- selecionar a observação REAL_OBD mais recente por PID;
- analisar STFT + LTFT somente em IDLE_WARM ou CRUISE;
- manter ±15% como heurística de triagem, não especificação de fábrica;
- preservar a separação entre evidência e hipótese;
- ampliar regras para P0135, P0420, P0133, P0123 e P0301.

### Contexto específico da Meriva
O alvo documentado continua sendo Meriva Maxx 1.4 8V ECONO.FLEX MY12. O manual registrado informa marcha lenta de 700–800 rpm para essa configuração. Essa faixa não foi transformada em diagnóstico automático de RPM para evitar falso positivo sem contexto de carga, temperatura e acessórios.

### Documentação criada
- docs/OBD_KNOWLEDGE_AUDIT_2026-10-08.md: fontes, fórmulas auditadas, correção do 0114, DTCs e regras do motor.

### Commits desta rodada
- c67dc850e979f935cc80b64dc1432d61601cd749 — plano da auditoria registrado antes do código.
- cfe415e67125ffa0ccb782d0eca0d5c19be1c895 — corrigir largura do payload do PID 0114.
- 715ce24cf6e0aa3190fc95930bdb4c31ea936edc — documentar decodificação do PID O2.
- 67802f6e87ab84fad7d5071f135a0f3050112b52 — alinhar catálogo DTC ao SAE J2012.
- f918dabd341f1f84691d5c1d0bff70fdafb7a446 — ampliar regras diagnósticas.
- 9dd346a7bbd98ad351e2e0592f2be436f5ef0dfc — tornar motor sensível a fonte, status e contexto.
- 405a71f20a6c8e729e7aa7702e80f10bf89ce4f5 — reforçar auditoria de PID O2 e DTC.
- 6f6cc7418a24758877c7b49197d9ee6af8d0a864 — cobrir DTC ativo/histórico e contexto operacional.
- 260be781abb09b8ea39ecc8884fcbe6d27370b8e — alinhar PID 0114 candidato ao payload OBD.
- d1c810935a72a2e2981c5a5868e634934f4d5de1 — validar PID O2 com payload completo.
- 5abc56426df553ddf32f8c8a45938f4124e838fe — documentação da auditoria.
- 7a6db82a525135ddf70a27235e4093cda4ff23dc — atualizar referências SAE na auditoria.

### Invariantes preservadas
- Bluetooth Classic / ELM327 não alterado.
- Gate ECU 010C → 41 0C não alterado.
- REAL_OBD continua sendo a fonte de evidência atual.
- SIMULACAO continua isolada.
- Autosave/persistência não alterados.
- package-lock.json não alterado.
- Nenhuma dependência adicionada.

### Validação
Foi feita auditoria estática, cruzamento documental e inspeção dos diffs. CI não foi executada, conforme solicitado.

O compare do plano c67dc850e979f935cc80b64dc1432d61601cd749 até o estado 7a6db82a525135ddf70a27235e4093cda4ff23dc mostra 10 commits posteriores ao plano e nenhuma divergência para trás.

### Próximo passo
A próxima etapa deve executar a validação completa do repositório e, separadamente, teste físico na Meriva para confirmar quais PIDs a ECU realmente anuncia/responde. A confirmação de compatibilidade Meriva não deve ser inferida apenas da documentação OBD genérica.


## DB-027 · 2026-10-08 — Auditoria profunda pré-CI: correção crítica do retry Bluetooth/ELM327

### Achado crítico
A auditoria estática do estado atual encontrou uma regressão em `src/obd/bluetoothManager.ts`: `createRealElmSessionAttempt()` recebia `maxAttempts` como parâmetro e redeclarava uma constante com o mesmo nome. Além de ser um erro de compilação TypeScript, a intenção funcional era ambígua: o limite configurável de `maxConnectionAttempts` deveria ser calculado uma única vez e propagado de forma explícita.

### Risco
Sem a correção, a CI pode falhar no typecheck antes de validar os testes/Android. O comportamento desejado também é manter o limite configurável por candidato, sem reintroduzir rodada externa infinita.

### Plano antes do código
1. Renomear o limite efetivo para `effectiveMaxAttempts`, eliminando shadowing/duplicidade.
2. Calcular esse limite a partir de `mergeCompatibilityConfig` uma única vez em `createRealElmSession`.
3. Propagar o mesmo limite para `createRealElmSessionAttempt` e usar esse valor apenas para telemetria/protocolo de tentativa, sem criar um segundo contador de retry.
4. Adicionar regressão estática/funcional para garantir que configuração explícita de tentativas seja respeitada.
5. Rodar a CI completa somente depois das correções, conforme autorização atual.
6. Se a CI falhar, registrar a causa e corrigir antes de considerar a rodada concluída.

### Invariantes
- Gate ECU continua sendo resposta real `010C → 41 0C`.
- Bluetooth Classic/RFCOMM permanece inalterado quanto ao transporte.
- REAL_OBD/SIMULACAO continuam separados.
- Autosave, DTC occurrence semantics, catálogos PID/DTC e `package-lock.json` não serão alterados sem evidência específica.

### Estado
Plano registrado antes da correção. CI ainda não executada nesta etapa.


### Correção executada após o plano
- `f628ed748aacba4ba633f84fc2d2a85c3843f992` — registro pré-correção no Diário de Bordo.
- `a2348d22c7cffd40e3118257fd64fc96c793be04` — corrigido o retry do `createRealElmSession`: cálculo único de `effectiveMaxAttempts`, remoção do shadowing/identificador inexistente e propagação explícita do limite configurado.
- `825d6d66d0ff67e91e1915296ef55cbc45785c88` — regressão que protege o limite configurável de retry e impede o retorno do shadowing.

### Validação antes da CI
A correção foi inspecionada diretamente no código e a suíte de regressão foi ampliada. A CI completa foi autorizada pelo usuário nesta rodada e será usada como validação final de TypeScript, testes, Expo Doctor e Android Release.

### Estado
Aguardando resultado da CI. Se houver falha, a causa será registrada e corrigida antes de considerar a auditoria concluída.


## DB-028 · 2026-10-08 — CI #1038: falha de TypeScript na camada de permissões

### CI
PR #27 — run #1038 / `37766512053`.
- `npm ci --no-audit --no-fund`: **sucesso**.
- Expo Doctor: **17/17** — **sucesso**.
- `npm run validate`: **falha no typecheck**.
- `android-build`: não executado porque depende de `validate`.

### Falha observada
O TypeScript reportou:
- `app/_layout.tsx`: `requestAllRequiredPermissions` não exportado por `src/permissions/permissionManager.ts`.
- `src/permissions/permissionManager.ts`: referências a `audit` inexistente/recursiva em `requestBluetoothPermissionsOnly`.

### Diagnóstico
A centralização de permissões registrada anteriormente ficou incompleta: a função agregadora foi removida/omitida enquanto o layout continuou importando-a, e a função Bluetooth recebeu uma implementação recursiva que referencia um objeto de auditoria inexistente. Isso é uma quebra real de compilação, não um falso positivo de teste.

### Regra antes da próxima correção
Corrigir primeiro o contrato da camada de permissões, mantendo somente permissões runtime realmente necessárias: Bluetooth/Dispositivos próximos no Android 12+ e localização em primeiro plano. O armazenamento permanece `APP_PRIVATE`; não adicionar permissões amplas de armazenamento.

**Não considerar a auditoria concluída.** A próxima correção deve atualizar código/testes, disparar nova CI e exigir `validate` + `android-build` verdes antes do merge.


### Correção da camada de permissões após CI #1038
- `58195bf524a22b343f9a017eb3042f687155e71b` — restaurado o contrato completo de `permissionManager.ts`: Bluetooth runtime Android 12+, localização em primeiro plano e auditoria agregada; removida a recursão/variável inexistente.
- `f123be1ac890d3ddc327aa4614785edb4ca7f272` — adicionadas regressões para os exports obrigatórios e para impedir a implementação recursiva defeituosa.

A correção preserva `APP_PRIVATE` para armazenamento e não adiciona permissões amplas de armazenamento.

### Próximo passo
Criar nova execução verificável da CI sobre o estado corrigido. Exigir `npm ci`, Expo Doctor, typecheck/testes e Android Release antes do merge.


## DB-029 · 2026-10-08 — CI #1045: regressão de teste de permissões

### CI
PR #28 — run #1045 / `37766789224`.
- `npm ci`: **sucesso**.
- Expo Doctor: **17/17** — **sucesso**.
- TypeScript: **sucesso**.
- A suíte parou em `tests/permissions.test.js` antes dos demais testes.
- `android-build`: não executado por dependência de `validate`.

### Falha observada
O teste exigia que `src/permissions/permissionManager.ts` contivesse literalmente a expressão `Storage Access Framework`. A implementação corrigida não deve conhecer a camada de exportação via SAF; ela apenas classifica o armazenamento interno como `APP_PRIVATE`.

### Diagnóstico
A falha é do teste, não da implementação de permissões. A asserção mistura duas responsabilidades: permissões runtime e exportação de arquivos. A verificação correta deve validar `APP_PRIVATE` no permission manager e, separadamente, a existência do fluxo SAF no módulo de armazenamento/exportação.

### Regra antes da próxima correção
Ajustar somente a asserção do teste para refletir o limite de responsabilidade da camada, sem adicionar texto artificial ao código de produção apenas para satisfazer o teste.

**Não considerar a auditoria concluída.** Nova CI é obrigatória.


### Correção após CI #1045
- `4ef72f789dbef758919afee76137d7fbb530e25b` — corrigida a regressão do teste de permissões: `APP_PRIVATE` permanece responsabilidade do permission manager e o teste verifica SAF na camada de armazenamento/exportação.

### Próximo passo
Nova execução de CI obrigatória. O código de produção de permissões não foi alterado nesta correção.


## DB-030 · 2026-10-08 — CI #1051: teste apontando arquivo SAF incorreto

### CI
PR #29 — run #1051 / `37766933271`.
- `npm ci`: **sucesso**.
- Expo Doctor: **17/17**.
- TypeScript: **sucesso**.
- Falha em `tests/permissions.test.js` na nova verificação de SAF.
- `android-build`: não executado.

### Diagnóstico
O teste passou a procurar `StorageAccessFramework` apenas em `backup.ts` e `app/armazenamento.tsx`, mas a exportação manual está implementada em `src/meriva/exportAutoSaveTxt.ts` e também em `src/obd/exportBluetoothDiagnosticTxt.ts`. A implementação de produção está correta; a asserção apontou para arquivos que não possuem essa responsabilidade.

### Correção planejada
Alterar o teste para inspecionar explicitamente os módulos de exportação que usam o Storage Access Framework. Nenhuma alteração de produção é necessária.

**Não considerar a auditoria concluída.** Nova CI obrigatória.


### Correção após CI #1051
- `2e5de7369435dbe86347bc10e6ba697cb215a535` — teste de permissões corrigido para verificar SAF nos módulos de exportação reais.

### Próximo passo
Nova execução da CI completa. O código de produção permanece sem alteração nesta etapa.


## DB-031 · 2026-10-08 — CI #1057: teste de rotação desatualizado

### CI
PR #30 — run #1057 / `37767133384`.
- `npm ci`: **sucesso**.
- Expo Doctor: **17/17**.
- TypeScript: **sucesso**.
- Permissões: **sucesso**.
- Falha em `tests/orientationLayout.test.js`.
- `android-build`: não executado.

### Diagnóstico
`app/armazenamento.tsx` usa `useWindowDimensions()` + `getMidLayout(windowSize)`, que é um mecanismo responsivo válido e recalcula o layout quando as dimensões da janela mudam. O teste exigia literalmente `useMidLayout()`, embora o comportamento implementado seja equivalente para rotação.

### Correção planejada
Ajustar o teste para reconhecer tanto o hook central `useMidLayout()` quanto o padrão explícito `useWindowDimensions()` + `getMidLayout()`, sem alterar produção funcionalmente apenas para satisfazer uma regex.

**Não considerar a auditoria concluída.** Nova CI obrigatória.


### Correção após CI #1057
- `21fe1b61ae7890a1ce1d5cba3fa2bfe998191ca1` — teste de rotação ajustado para aceitar `useMidLayout()` ou `useWindowDimensions()` + `getMidLayout(windowSize)`, ambos recalculando o layout conforme as dimensões.

### Próximo passo
Nova CI completa obrigatória, incluindo Android Release.


### 2026-10-08 — Quinta execução da CI da auditoria
Branch `audit-deep-ci-2026-10-08-r5` criada a partir do `main` após a correção do teste responsivo. Validar novamente toda a suíte e Android Release.


## DB-032 · 2026-10-08 — CI #1063 verde e consolidação da auditoria

### Resultado final da CI
PR #31 — run #1063 / `37767314687`:
- `validate`: **sucesso**.
- `npm ci --no-audit --no-fund`: **sucesso**.
- Expo Doctor: **17/17**.
- TypeScript: **sucesso**.
- Suíte completa de testes: **sucesso**.
- `android-build`: **sucesso**.
- `expo prebuild --clean --platform android --non-interactive`: **sucesso**.
- Android Release standalone APK: **compilado, verificado e publicado como artefato**.

### Consolidação
PR #31 foi integrado ao `main` por squash no commit `2a0189cb51b831c18cf962936ac7051d262172b0`.

### Correções efetivamente consolidadas nesta auditoria
1. Retry Bluetooth/ELM327: remoção de shadowing/variável inconsistente e respeito ao limite configurável de tentativas.
2. Permission manager: contrato centralizado restaurado, Bluetooth runtime Android 12+, localização em primeiro plano e armazenamento `APP_PRIVATE`.
3. Testes de permissões: separação correta entre responsabilidade de permissões e exportação SAF.
4. Teste de rotação: alinhamento com as duas implementações responsivas válidas do projeto.
5. PIDs/DTCs e motor diagnóstico: preservadas as correções documentais anteriores, incluindo PID 0114 com payload de 2 bytes, DTC SAE J2012 e bloqueio de evidência não-REAL_OBD/histórica.

### Estado
A auditoria de código desta rodada está **concluída e validada pela CI #1063**. A validação física do ELM327/Meriva continua sendo uma etapa de hardware/veículo, não substituída pela CI.


## DB-033 · 2026-10-08 — Registro complementar: status confirmado da CI #1063

### Verificação pós-consolidação
Foi feita uma nova leitura do estado do repositório para confirmar a situação da última CI e do merge do PR #31.

- PR #31 — `audit: validate full suite after responsive test fix`: **merged** no `main`.
- Run da CI final: **#1063 / 37767314687**.
- Commit validado pela CI: `a8309abf3e28a18935f710bae971110089cb6e2d` (head do PR #31).
- Commit de merge por squash no `main`: `2a0189cb51b831c18cf962936ac7051d262172b0`.
- `validate`: **sucesso**.
- `android-build`: **sucesso**.
- `npm ci --no-audit --no-fund`: **sucesso**.
- Expo Doctor: **17/17**.
- TypeScript e suíte completa de testes: **sucesso**.
- `expo prebuild --clean --platform android --non-interactive`: **sucesso**.
- Android Release standalone APK: **compilado, verificado e publicado**.

### Artefato Android
Artifact: `meriva-smart-diagnostic-standalone-apk`.
- Artifact ID: `11545587294`.
- Estado: **não expirado**.
- Tamanho: 27.373.870 bytes (aprox. 27,4 MB).
- SHA-256: `78331142e41756b9862116967d694553923cc5449dae3738e40f79716d8cee52`.
- Expiração registrada: **2026-10-22 11:08:56 UTC**.

### Observação sobre o commit documental
O commit posterior `5ee79fa3d8648201671914399773f8b6deeeadbe` apenas consolida este resultado na documentação e não possui nova execução de CI associada. Portanto, a evidência de validação efetiva continua sendo a **CI #1063**.

### Estado atual
**AUDITORIA DE CÓDIGO: CONCLUÍDA E VALIDADA.**

A próxima etapa de validação que permanece fora do alcance da CI é o teste físico na Meriva com o ELM327, especialmente conexão Bluetooth, resposta real `010C → 41 0C`, leitura de PIDs anunciados pela ECU e persistência dos dados validados.
## DB-034 · 2026-10-08 — Autosave vinculado à sessão real da ECU

### Problema observado
A análise do histórico `meriva_smart_autosave_history.txt` mostrou que o autosave estava funcionando, porém o ciclo de diagnóstico não tinha uma fronteira explícita: havia múltiplos pontos iniciando/parando checkpoint e a persistência de `obd.connected` era duplicada entre `sharedConnection`, cockpit, layout raiz e laboratório.

Isso permitia snapshots redundantes e aumentava o risco de gravar estado de conexão fora de uma sessão ECU realmente validada.

### Decisão
A sessão de autosave deve ser controlada pelo estado real da ECU:
- ECU validada por resposta OBD real `41 0C` → abrir sessão de autosave.
- ECU/ELM desconectado → fechar sessão de autosave.
- A sessão aberta mantém checkpoint periódico de 45 s.
- Ao abrir e fechar a sessão, deve existir um marco explícito no histórico TXT: `session_start` e `session_end`.
- O fechamento deve persistir `connected=false`, remover o protocolo atual e preservar `lastKnownProtocol`.

Uma ausência isolada de resposta de um PID não é tratada automaticamente como desconexão da ECU; a fronteira de fechamento permanece vinculada ao evento real de perda da sessão Bluetooth/ELM ou à desconexão manual. Isso evita encerrar uma sessão por um único `NO DATA`.

### Correção implementada
No `autosaveManager`:
- `SaveReason` recebeu `session_start` e `session_end`.
- `AutoSaveStatus` passou a expor `obdSessionActive`.
- Criados `startObdAutosaveSession()` e `closeObdAutosaveSession()`.
- `startObdAutosaveSession()` só abre após `obd.connected=true`, inicia o checkpoint e faz salvamento imediato.
- `closeObdAutosaveSession()` interrompe o checkpoint, normaliza o estado para desconectado e faz o salvamento final.
- `startObdSessionCheckpoint()` passou a respeitar a sessão ECU ativa.

Em `sharedConnection`:
- a persistência de adaptador validado, ECU e abertura de sessão foi centralizada em `persistValidatedConnection()`;
- conexão validada pelo gate `41 0C` abre o autosave;
- desconexão inesperada, desconexão manual e `setSharedObdConnection(null)` fecham o autosave;
- `lastKnownProtocol` continua preservado após a desconexão.

Na interface:
- removidos pontos duplicados de persistência no `app/_layout.tsx` e `app/index.tsx`;
- o laboratório deixou de controlar diretamente o checkpoint;
- o cockpit passou a mostrar `GRAVANDO ECU` enquanto a sessão de autosave está ativa e `AGUARDANDO ECU` quando não está.

### Testes
Adicionados:
- teste de abertura da sessão após ECU conectada;
- teste de salvamento final ao fechar a sessão;
- teste de preservação do último protocolo;
- regressões estáticas para garantir a integração do ciclo ECU → autosave.

### Arquivos principais
- `src/meriva/autosaveTypes.ts`
- `src/meriva/autosaveManager.ts`
- `src/obd/sharedConnection.ts`
- `app/_layout.tsx`
- `app/index.tsx`
- `app/laboratorio.tsx`
- `app/configuracoes.tsx`
- `tests/merivaAutosave.test.js`
- `tests/bluetoothLifecycle.test.js`

### Commits
Alteração aplicada diretamente no `main` em uma sequência de commits pequenos e auditáveis, do `c1bc3ff76ebac1aad67e1df69a881153e711ed21` ao `827f4b26c8591f0d6329c9a3b80b13ba7d9ff1c0`.

### Validação
A suíte de CI não foi disparada nesta etapa. Os testes de regressão foram adicionados ao repositório, mas a validação final por CI/Android permanece pendente.

### Estado
A regra de salvamento agora é:
`ECU validada → INICIA AUTOSAVE → checkpoints durante a sessão → ECU desconectada → SALVAMENTO FINAL → FECHA AUTOSAVE`

O estado histórico continua separado do estado atual: a desconexão não apaga `lastKnownProtocol` nem os dados históricos já registrados.
## DB-035 · 2026-10-08 — Correção: histórico e dados não eram alimentados pela telemetria automática

### Problema
Após a centralização do autosave na sessão ECU, o aplicativo passou a conectar/validar a ECU, mas o fluxo automático de PIDs não alimentava o mesmo pipeline usado pelas consultas manuais.

### Causa raiz
`src/trip/autoTripService.ts` executava `queryPid()` para 012F, 015E, 010D e os PIDs de telemetria, porém chamava somente `recordLivePidQuery()`. Esse módulo atualiza as tendências em memória, mas não grava:
- últimas leituras no autosave;
- logs OBD TX/RX;
- banco de PIDs confirmados;
- aprendizado real.

Por isso a tela de Dados podia mostrar pouca ou nenhuma leitura persistida e o histórico não acompanhava as consultas automáticas.

### Correção
O serviço automático passou a enviar cada resultado real para `registerObdQuery(..., 'REAL')`, mantendo também `recordLivePidQuery()` para as tendências em memória.

Agora o fluxo automático é:
`ECU → queryPid → liveTelemetry + registerObdQuery → logs + lastReadings + banco de PIDs + aprendizado + autosave`

Os quatro caminhos automáticos corrigidos são:
- PID 012F — nível de combustível;
- PID 015E — taxa de combustível;
- PID 010D — velocidade da ECU;
- PID 010C/0105/010B/0111 — telemetria móvel.

### Teste
Adicionada regressão estática em `tests/regression.test.js` garantindo que todos os quatro caminhos usem `registerObdQuery` com fonte `REAL`.

### Commit
- `e1113adf75dd26619936ce1ec982a62dc5ade1c7` — `fix: persist automatic OBD readings into history pipeline`
- `4d3b5ac966a6f839dfe7d208b496de51406a82dd` — `test: guard automatic OBD history feeding`

### Estado
A alimentação automática de dados foi religada ao pipeline persistente. O histórico de viagem continua sendo fechado como um ciclo real ao encerrar a sessão, evitando gerar dezenas de viagens parciais.

### Validação
Ainda não há nova CI registrada para esta correção. A validação automática deve confirmar typecheck, suíte completa e Android Release antes de considerar o ajuste definitivamente concluído.
### 2026-10-08 — Validação intermediária e correção de tipagem

A CI #1231 / run `37793417849`, disparada pelo commit documental `e0ef80b84844b958e45b12620b0bd0e57bb1deb6`, executou `npm ci` e Expo Doctor `17/17` com sucesso, mas o typecheck parou em `app/laboratorio.tsx:204` porque `connected.protocol` continuava tipado como `string | null` dentro do callback de `updateAutoSaveState`.

Correção aplicada em `152945f227836c1a7954bb0359c76c6a33dba24b`: o valor foi estreitado para `discoveredProtocol` antes do callback. O `android-build` da CI #1231 foi corretamente pulado por depender de `validate`.

### Reforço dos testes de alimentação de dados
O teste de persistência REAL foi ampliado para verificar também `lastReadings` e a criação do log OBD, enquanto a regressão de `autoTripService` garante que os PIDs automáticos passem pelo `registerObdQuery`.

Commit adicional: `ae1672fd00342891a7272bbd435aedac2e5b73f3`.

## DB-036 · 2026-10-08 — Auditoria: duplicação na telemetria automática

### Problema identificado antes da nova CI
Na revisão da correção que religou a alimentação automática do histórico, foi confirmado um efeito colateral: `src/trip/autoTripService.ts` chamava `recordLivePidQuery()` diretamente e, logo depois, `registerObdQuery()`, que também chama `recordLivePidQuery()`. Assim, uma única resposta real da ECU podia entrar duas vezes na janela de telemetria em memória.

### Risco
A duplicação não corrompe o autosave principal, mas distorce a série temporal, o número aparente de amostras e a análise de tendência/contexto. O histórico persistente recebe o evento uma vez; a telemetria em memória é que fica duplicada.

### Plano antes do código
1. Remover as chamadas diretas redundantes a `recordLivePidQuery()` de `autoTripService.ts`.
2. Manter `registerObdQuery(..., 'REAL')` como único ponto de entrada para logs, lastReadings, banco de PIDs, aprendizado e telemetria ao processar cada consulta automática.
3. Manter uma única gravação de tendência por resposta real da ECU.
4. Adicionar regressão estática garantindo que os caminhos automáticos não voltem a duplicar `recordLivePidQuery()`.
5. Executar a CI completa após a correção e tratar qualquer falha pela causa observada.

### Invariantes
- Gate ECU `010C → 41 0C` permanece intacto.
- Bluetooth Classic/ELM327 permanece intacto.
- `REAL_OBD` continua sendo a única fonte de evidência real.
- Autosave de sessão, histórico TXT de até 200 entradas, aprendizado e package-lock não serão alterados nesta correção.
- Nenhuma dependência nova será adicionada.

### Estado
Plano registrado antes da alteração de código. A CI anterior continua sendo apenas a referência da versão anterior; a nova CI será o árbitro desta correção.

### Preparação da CI de validação
As correções desta auditoria já estão no `main`. Esta branch de verificação preserva exatamente o código corrigido e adiciona somente este registro documental para forçar uma execução verificável do GitHub Actions sobre o estado atual.

## DB-037 · 2026-10-08 — CI #1235: regressão estática no teste de ciclo Bluetooth
### Falha observada
A CI #1235 / run `37795969222` executou `npm ci`, Expo Doctor `17/17` e TypeScript com sucesso. A suíte falhou em `tests/bluetoothLifecycle.test.js:32` porque o teste procurava literalmente `selectedAdapterAddress: device.address.toUpperCase()`.

### Diagnóstico
A implementação atual e correta usa o objeto `connection` já validado: `selectedAdapterAddress: connection.device.address.toUpperCase()`. O teste ficou desatualizado após a centralização da persistência da conexão. Não há evidência de defeito na produção neste ponto.

### Plano antes da correção
1. Atualizar somente a asserção estática para refletir o contrato atual de `persistValidatedConnection()`.
2. Não alterar o fluxo Bluetooth/ELM327 nem a persistência de produção.
3. Rodar novamente a CI completa e exigir `validate` verde antes do Android Release.

### Estado
A correção será limitada ao teste; o fluxo de produção permanece inalterado.

## DB-038 · 2026-10-08 — CI #1236: validação verde da correção de telemetria automática

### Resultado
PR #35 / run #1236 — `37796216776`, executado sobre `e68c0a4fb2a3fc4a126c08327d08581f9f345ff6`:
- `npm ci --no-audit --no-fund`: sucesso.
- Expo Doctor: `17/17`.
- TypeScript: sucesso.
- Suíte completa de testes: sucesso.
- `android-build`: sucesso.
- `expo prebuild --clean --platform android --non-interactive`: sucesso.
- Android Release standalone APK: compilado, verificado e publicado como artefato.

### Correção consolidada
- `src/trip/autoTripService.ts`: removidas as chamadas redundantes a `recordLivePidQuery()`; cada resposta automática passa uma única vez por `registerObdQuery(..., 'REAL')`, evitando duplicação na telemetria em memória.
- `tests/regression.test.js`: adicionada regressão contra retorno da gravação dupla.
- `tests/bluetoothLifecycle.test.js`: corrigida a asserção estática para o contrato atual de `connection.device.address.toUpperCase()`.
- PR #35 foi integrado ao `main` por squash no commit `9d02d4175a108f8d0d19255e3045376509974ce5`.

### Artefato
`meriva-smart-diagnostic-standalone-apk`
Artifact ID: `11559191893`
Tamanho: 27.374.304 bytes (aprox. 27,4 MB)
Não expirado; expira em 2026-10-22 15:03:49 UTC.

### Observação
O run #1235 permaneceu como histórico de falha de teste; a causa foi a asserção desatualizada, não a implementação de produção. O run #1236 é a referência verde da correção final desta etapa.

### Estado
A correção desta etapa está consolidada no `main` e validada por CI. A validação física do ELM327/Meriva continua necessária para confirmar comportamento de hardware e compatibilidade real de PIDs.

## DB-039 · 2026-10-08 — Execução em segundo plano com tela apagada

### Problema
O monitoramento automático usava setTimeout/setInterval no JavaScript e watchPositionAsync. Esses mecanismos não constituem um serviço persistente de Android: com a aplicação em segundo plano ou a tela apagada, a execução poderia ser suspensa e o histórico deixaria de receber telemetria.

### Decisão arquitetural
Em vez de criar um segundo serviço nativo concorrente ao Bluetooth Classic, foi adotado o Foreground Service do próprio expo-location, combinado com expo-task-manager. O serviço é iniciado somente depois da validação real da ECU (010C -> 41 0C) e é encerrado quando a sessão OBD é desconectada.

### Implementação
- adicionado expo-task-manager ~11.8.2, alinhado à árvore Expo SDK 51;
- src/gps/backgroundLocationTask.ts registra uma tarefa global com TaskManager.defineTask;
- GpsTracker ganhou startBackgroundLocation()/stopBackgroundLocation() e mantém o mesmo filtro de precisão, movimento e velocidade;
- Location.startLocationUpdatesAsync() usa foregroundService com notificação persistente;
- app.json habilita ACCESS_BACKGROUND_LOCATION e o config plugin do expo-location para localização em segundo plano + Foreground Service;
- sharedConnection inicia o monitoramento após a sessão OBD/autosave e o interrompe em desconexão;
- app/_layout.tsx registra a tarefa antes do Router;
- testes estáticos cobrem dependência, lockfile, permissões, tarefa headless e vínculo com o ciclo ECU.

### Revisão de concorrência GPS
Na migração do watcher de foreground para a tarefa persistente, o watcher existente é encerrado antes de iniciar o Foreground Service. Isso evita callbacks duplicados e dupla contagem de amostras/distância.

### Limites
Esse modo permite continuidade com a tela apagada enquanto o Foreground Service estiver ativo e as permissões estiverem concedidas. Não equivale a sobrevivência após force-stop/encerramento explícito do aplicativo, e otimizações agressivas de bateria do fabricante podem impor restrições adicionais.

### Validação
A correção aguarda validação pela CI nesta branch antes de ser considerada concluída.

### Correção 2026-10-08 — PID 015E, consumo e aprendizado contextual
- Identificada uma inconsistência entre o catálogo `src/knowledge/pids.json` e o serviço automático: o PID `015E` era decodificado pela fórmula, mas sua unidade vinha como `liters_per_hour`, enquanto `src/trip/autoTripService.ts` aceitava exclusivamente `L/h`. A ECU podia responder validamente e a taxa ainda era descartada para o cálculo de consumo.
- Corrigido o catálogo do `015E` para `L/h`.
- Corrigido o pipeline de aprendizado: `registerObdQuery()` passa a obter automaticamente o contexto operacional real quando a consulta vem da ECU e nenhuma condição é informada.
- Mantida a regra: somente dados `REAL_OBD` válidos alimentam aprendizado; simulação continua bloqueada.
- O autosave continua registrando as leituras reais durante a sessão.
- Limitação mantida: sem uma taxa OBD `015E` válida, o aplicativo não deve fabricar consumo.

## DB-040 · 2026-10-08 — Varredura de conhecimento OBD e enriquecimento do banco local

### Problema
A descoberta de PIDs identificava códigos suportados pela ECU, mas o catálogo local continha poucos PIDs. Quando um PID estava fora de `src/knowledge/pids.json`, o parser retornava `PID DESCONHECIDO` e o aplicativo não conseguia apresentar significado, unidade ou fórmula. Isso também limitava o aprendizado e o banco local de PIDs confirmados.

### Correção aplicada
- Expandido `src/knowledge/pids.json` com PIDs OBD-II adicionais e descrições semânticas, incluindo pressão de combustível, EGR, purga EVAP, pressão barométrica, carga absoluta, posição relativa da borboleta, temperatura ambiente, pressão absoluta do rail, pedal do acelerador, temperatura do óleo, temporização de injeção e torque.
- Expandido `src/knowledge/formulas.json` com operações determinísticas necessárias aos novos PIDs.
- Expandido `src/knowledge/ranges.json` com faixas de plausibilidade correspondentes.
- Atualizado `src/knowledge/meriva_confirmed_pids.json` para ampliar os alvos de confirmação da Meriva sem transformar seed em evidência real.
- O banco local `BANCO/pids_meriva_confirmados.txt` passou a persistir, além da confirmação, unidade, formulaId, quantidade de bytes e descrição do PID.
- `registerObdQuery()` passou a alimentar esses metadados diretamente da definição do PID quando a leitura REAL_OBD é válida.
- Teste de integridade dos JSONs ampliado para reconhecer as novas operações de fórmula.

### Regra de evidência
O catálogo explica o PID; ele não confirma que a ECU da Meriva realmente o suporta. A confirmação continua exigindo resposta RAW_ECU válida, parser, fórmula e plausibilidade. Dados de simulação e seed permanecem fora do aprendizado real.

### Referências técnicas
As fórmulas foram cruzadas com referências públicas de OBD-II/J1979. PID 015E continua definido como Engine Fuel Rate em L/h, com `((A×256)+B)/20`.

### Estado
Conhecimento estático ampliado e banco local preparado para guardar o significado dos PIDs. A confirmação física dos novos PIDs depende da próxima sessão real com a ECU da Meriva.

## DB-041 · 2026-10-08 — TXT de PIDs compactado e descoberta persistente

### Problema
O arquivo `BANCO/pids_meriva_confirmados.txt` havia crescido com metadados extensos por linha e, apesar de o banco evitar duplicação por PID, o formato ficou pesado para leitura/exportação.

### Correção
- Restaurado o formato compacto de **11 campos por PID**, equivalente ao formato inicial do banco.
- Metadados semânticos detalhados continuam no catálogo JSON da aplicação; não são repetidos no TXT.
- A escrita do TXT agora reconstrói uma única linha por PID e ordena pelo código, reduzindo crescimento e facilitando auditoria.
- PIDs anunciados pela bitmap de descoberta OBD agora são gravados automaticamente no TXT com status `DESCOBERTO`.
- `DESCOBERTO` não significa confirmação individual: somente uma consulta REAL_OBD válida pode promover o PID para `RESPONDEU/CONFIRMADO`.
- PIDs já confirmados nunca são rebaixados para `DESCOBERTO` durante uma nova descoberta.
- Adicionada regressão para garantir formato compacto e persistência da descoberta.

### Resultado
O TXT deixa de repetir descrição, unidade, fórmula e bytes em cada linha. Essas informações permanecem na base JSON, enquanto o TXT funciona como **índice histórico compacto dos PIDs observados**.


## DB-042 · 2026-10-08 — Pacote prioritário: saúde da ECU, DTC, identificação, consumo e persistência

### Objetivo
Implementar os problemas observados no histórico real do aplicativo sem tratar perda de resposta da ECU como simples desconexão Bluetooth.

### Implementações
1. **Saúde da ECU separada do Bluetooth**
   - SharedObdStatus agora distingue link Bluetooth, estado da ECU e recuperação.
   - Estados: RESPONDING, NO_RESPONSE e RECOVERING.
   - Probe periódico 010C detecta perda real de resposta.
   - Após o limiar configurado, o polling normal é pausado, o ELM executa ATZ + renegociação ATSP e valida novamente 010C.
   - Falha de recuperação gera desconexão controlada e reconexão automática.
   - Backoff configurado em 2 s / 5 s / 15 s.
   - O diagnóstico do adaptador continua registrando NO DATA, BUS INIT, BUS ERROR, UNABLE TO CONNECT, timeout e outros erros classificados.

2. **KWP FAST**
   - Durante sessão KWP/ISO 14230 é enviado 3E00 como TesterPresent/keep-alive.
   - A documentação de ISO 14230 confirma o TesterPresent como mecanismo de manutenção da sessão diagnóstica.

3. **DTC**
   - Mantidos modos 03, 07 e 0A.
   - Ocorrências continuam sendo contadas por ocorrência confirmada/retorno após ausência, e não por cada leitura repetida.
   - Uma falha de comunicação não transforma um DTC em INACTIVE.
   - Adicionado freeze frame via 020200, 020C00 e 020500, preservando DTC do frame, RPM e temperatura do líquido quando disponíveis.
   - Catálogo DTC recebeu causas prováveis para os códigos já conhecidos.

4. **PID 0101**
   - Adicionado ao catálogo e interpretado como MIL, quantidade de DTCs, tipo de ignição e readiness.
   - O estado do catalisador passou a ser explicitamente reportado como suportado/pronto/não pronto.
   - A interpretação segue o layout de bytes A-D de PID 01; bytes C/D dependem do tipo de ignição.

5. **Identificação do veículo/ECU**
   - Após validação 010C -> 41 0C, são tentados 0902, 0904 e 090A.
   - VIN, identificação de ECU e nome da ECU são persistidos somente quando retornados pela ECU.
   - A validação passa a registrar evidências concretas (010C/41 0C, protocolo, quantidade de PIDs e VIN quando disponível), não apenas horário.

6. **Autosave**
   - Leituras idênticas não rearmam o debounce indefinidamente.
   - A telemetria permanece atualizada em memória, mas a persistência de leitura estável é coalescida em janela de 10 s.
   - Checkpoint da sessão permanece em 45 s.
   - Saved At continua vindo de metadata.savedAt; novos snapshots recebem timestamp sempre que persistidos.

7. **Viagens e consumo**
   - O trajeto real só abre quando RPM > 0 e velocidade > 0.
   - Parada prolongada de 15 s fecha o trajeto atual.
   - PID 015E é marcado como medido.
   - Na ausência de 015E, o aplicativo estima taxa de combustível por MAF; se MAF não estiver disponível, tenta MAP + RPM + IAT com hipóteses explícitas de AFR, densidade e eficiência volumétrica.
   - Viagens registram fuelRateSource como medido, estimado por MAF, estimado por MAP ou misto.
   - Referências CARSCANNER_SEED continuam separadas de REAL_OBD.

8. **Exportação**
   - Criados exportadores JSON completo e CSV de viagens em BACKUP/EXPORTS.
   - A tela de armazenamento recebeu os controles de exportação.

9. **Nomenclatura**
   - PID catalogado continua exibindo seu nome mesmo quando a ECU não responde.
   - PID DESCONHECIDO fica restrito a códigos realmente ausentes do catálogo.

### Correção adicional encontrada durante a implementação
O PID 010D estava catalogado com unidade kmh, enquanto o serviço automático validava km/h; isso fazia uma resposta válida de velocidade ser descartada. O catálogo foi normalizado para km/h.

### Arquivos principais
- src/obd/elm327.ts
- src/obd/elm327Compatibility.ts
- src/obd/sharedConnection.ts
- src/obd/vehicleIdentity.ts
- src/obd/parser.ts
- src/obd/dtcScanner.ts
- src/obd/dtcDefinition.ts
- src/knowledge/pids.json
- src/knowledge/formulas.json
- src/knowledge/dtc_catalog.json
- src/trip/autoTripService.ts
- src/trip/tripRecorder.ts
- src/obd/fuelConsumption.ts
- src/meriva/autosaveManager.ts
- src/meriva/autosaveState.ts
- src/meriva/autosaveTxtFormatter.ts
- src/storage/exportDiagnostics.ts
- app/bluetooth.tsx
- app/armazenamento.tsx
- app/laboratorio.tsx
- tests/ecuHealth.test.js
- tests/fuelConsumption.test.js
- package.json

### CI
**Não disparada nesta etapa.** A alteração ainda precisa passar por typecheck, suíte completa e Android Release antes de ser considerada pronta para hardware.

### Validação física pendente
A confirmação definitiva exige uma sessão real na Meriva com ELM327, principalmente:
- perda de resposta deliberada/real da ECU;
- KWP TesterPresent;
- retorno de 0101;
- suporte real de 0902/0904/090A;
- freeze frame 020x;
- PID 015E, 0110 ou fallback MAP;
- comportamento com tela apagada/segundo plano.


## DB-043 · 2026-10-08 — Auditoria pós-implementação: correções de integração

- Corrigida a validação de respostas de Mode 02 para aceitar o cabeçalho positivo 42; antes, o parser ainda exigia 41 e poderia rejeitar freeze frame válido.
- O cockpit e a tela Bluetooth passaram a usar o estado de resposta da ECU, evitando exibir ECU como conectada quando somente o enlace Bluetooth permanece ativo.
- Defaults de reconexão foram reduzidos para 3 tentativas e limiar de 4 falhas consecutivas; as opções da tela de configurações foram alinhadas.
- Persistência de validação ECU recebeu lista de evidências verificadas.
- Exportação JSON/CSV foi adicionada à tela de armazenamento.
- O relatório TXT passou a incluir descrição, causas prováveis e freeze frame dos DTCs quando disponíveis.
- Nenhuma dependência nova foi adicionada nesta etapa.
- CI continua deliberadamente não disparada até concluir a revisão estática.



## DB-044 · 2026-10-09 — Trip formula integrity

- Ignore duplicate/out-of-order samples before they can rewind trip state.
- Persist a real trip when distance is valid even if integrated fuel is below 0.05 L or fuel samples are unavailable; mark its consumption as unavailable (N/D) and exclude it from consumption averages/autonomy totals. Never fabricate a km/L value.
- Calculate aggregate real-trip average speed from total real distance / total real moving time, not the unweighted mean of each trip's speed.
- Add regression cases for tiny fuel totals and out-of-order timestamps.
- CARSCANNER_SEED remains historical reference data and is excluded from REAL_OBD totals; seed values are never promoted to real measurements.
- The exact cause of 122.819 km/L remains unconfirmed until raw fuel-rate samples, timestamps and distance deltas from that session are available.


## DB-045 · 2026-10-09 — Histórico diário de sessões ECU e tela ativa

### Problema observado
O relatório diário exibia o último estado mutável, o que não preserva por si só todas as partidas/reconexões ocorridas no mesmo dia. O TXT geral de autosave é rotativo (200 snapshots) e não é um diário por data.

### Correções
- Criado `src/meriva/dailyObdHistory.ts`: arquivo compacto `VIAGENS/meriva_smart_daily_obd_history.txt`, com uma única página lógica por data local e eventos separados para cada início/fim de sessão ECU validada.
- Cada evento guarda adaptador/protocolo, PIDs reais mais recentes com timestamps, DTCs registrados e viagens reais recentes. Não promove seed a dado real.
- O histórico diário preserva até 365 datas, para limitar crescimento; as várias sessões do mesmo dia não substituem umas às outras.
- `autosaveManager` acrescenta eventos diários somente nas fronteiras `session_start`/`session_end`, evitando um evento por PID e reduzindo tamanho.
- `expo-keep-awake` já estava presente no lockfile; passou a dependência direta e `useKeepAwake` mantém a tela ligada enquanto o RootLayout está montado.

### Limitações / validação
A sessão é definida por conexão/desconexão validada da ECU, não pela posição física da chave de ignição. O histórico diário é complementar ao JSON de autosave e não o substitui. CI e teste no aparelho ainda são necessários para confirmar persistência e comportamento da tela.


### Ajuste após a primeira CI do PR #49

- A primeira execução de `npm run validate` falhou no typecheck: `getSharedObdStatus()` não retornava todos os campos de `SharedObdStatus`, e `autoTripService.ts` usava `getAutoSaveState` sem importá-lo.
- Corrigido o retorno para refletir `ecuResponseState`, falhas consecutivas, horário da última resposta e último erro; `ecuConnected` agora também exige estado `RESPONDING`.
- Adicionado o import faltante de `getAutoSaveState` no serviço de viagens. A CI deve ser repetida para confirmar o resultado.

- A exportação do diário diário foi adicionada em Configurações como ação separada `EXPORTAR HISTÓRICO DIÁRIO ECU (.TXT)`, preservando a exportação antiga de snapshots de autosave.

## DB-046 · 2026-10-09 — Plano de auditoria cruzada TXT/viagens (registrado antes do código)

### Evidências do histórico TXT recebido
- O arquivo contém 116 blocos completos, numerados de 1 e 4–118; os identificadores 2 e 3 não aparecem no arquivo fornecido. Não renumerar automaticamente dados históricos sem evidência da origem da lacuna.
- Foram contados 52 snapshots `debounce`, 40 `critical`, 10 `checkpoint`, 8 `background`, 3 `session_start`, 2 `session_end` e 1 `manual`.
- Há snapshots com `Status: CONECTADO` e vários PIDs simultaneamente `NÃO RESPONDEU`; o status precisa diferenciar link/sessão ativa de ECU respondendo. A correção do getter `getSharedObdStatus()` já está na branch deste PR e exige `RESPONDING` para declarar ECU conectada.
- O relatório repete viagens `CARSCANNER_SEED` como histórico, enquanto a tela de viagens carrega ciclos sem filtrar essa origem.
- A implementação atual de `RealTripRecorder` ainda aceita amostras com timestamp repetido/anterior como estado novo, pode reduzir a distância acumulada se a amostra GPS recuar e permite salvar viagens com menos de 0,05 L. A média agregada de velocidade usa média aritmética de velocidades por viagem, não a razão distância total/tempo total em movimento.

### Plano antes da implementação
1. Reforçar o gravador para ignorar amostras duplicadas/fora de ordem e manter distância não decrescente quando o contador GPS reiniciar.
2. Preservar viagens reais com distância válida mesmo sem combustível suficiente; mostrar consumo como N/D e excluí-las das médias de consumo/autonomia, sem alterar leituras brutas nem rotular estimativas como medições.
3. Calcular a velocidade média agregada REAL_OBD como distância total dividida pelo tempo total em movimento.
4. Remover `CARSCANNER_SEED` do histórico exibido em Viagens, do relatório TXT e dos valores médios apresentados como consumo real; manter separação/origem no armazenamento e aprendizado.
5. Fazer novas instalações iniciarem com histórico de viagens vazio e filtrar seeds antigos na leitura/migração, sem apagá-los às cegas de arquivos brutos de backup.
6. No histórico diário de sessões, só listar leituras reais cujo timestamp pertença à sessão corrente; preservar timestamps e não converter falhas em valores.
7. Acrescentar regressões direcionadas e executar CI completa (doctor, typecheck/testes e APK Release). Não alterar framing, protocolo KWP/K-Line, fórmulas OBD nem gate ECU `010C → 41 0C` nesta rodada.

### Estado
Plano registrado antes das alterações de produção. A correção só será considerada concluída após a nova CI e leitura dos resultados.



## DB-047 · 2026-10-10 — Consolidação das correções de viagens e registro de auditoria

### Regra aplicada
O diário foi lido antes de alterar o código. Esta entrada segue o fluxo obrigatório: problema → diagnóstico → correção → testes → commit → CI → resultado → próximo passo. Não foi feito merge na `main`.

### Problema e diagnóstico
A regra anterior de rejeitar ciclos com combustível integrado inferior a `0,05 L` evitava publicar médias instáveis, mas também eliminava viagens reais com distância válida. A correção separa a existência da viagem da disponibilidade de cálculo de consumo. A média de velocidade agregada também precisava usar distância real total dividida pelo tempo total em movimento, sem ponderação artificial por quantidade de viagens.

### Modificações registradas
- `src/trip/tripRecorder.ts`: rejeita amostras sem timestamp válido, duplicadas ou fora de ordem antes de modificar o estado; acumula distância sem retrocesso quando o contador GPS reinicia; aceita persistir viagem com distância válida mesmo sem combustível suficiente; marca `fuelDataValid` e deixa consumo numérico em zero interno quando não calculável, para a apresentação/exportação exibir `N/D`.
- `src/data/driveCycles.ts`: adiciona metadado opcional `fuelDataValid`; exclui ciclos sem combustível confiável do cálculo de km/L; calcula velocidade média agregada por distância real total / tempo real total em movimento; remove `CARSCANNER_SEED` da lista operacional visível e mantém a origem de referência separada.
- `src/meriva/autosaveTxtFormatter.ts`: não inclui viagens `CARSCANNER_SEED` na seção operacional do TXT; consumo de viagens sem evidência suficiente aparece como `N/D`.
- `src/meriva/dailyObdHistory.ts`: o evento diário apresenta consumo como `N/D` quando a viagem não tem combustível confiável, mantendo o histórico de sessões separado do snapshot rotativo.
- `src/trip/autoTripService.ts`: viagens sem combustível confiável continuam no histórico de viagens, mas não incrementam distância/combustível acumulados usados para média de consumo e autonomia.
- `src/storage/driveCycleStorage.ts`: valida o campo opcional `fuelDataValid`; instalações novas começam sem viagens artificiais; leitura/migração do índice operacional remove somente ciclos explicitamente marcados `CARSCANNER_SEED`, preservando os demais registros válidos.
- `tests/tripRecorder.test.js`: adiciona regressões para viagens sem combustível, combustível abaixo do limiar, amostras fora de ordem/duplicadas e reinício do contador de distância.
- `tests/regression.test.js`: adiciona regressões para migração/filtro de seeds, instalação nova vazia, velocidade agregada ponderada e viagens reais sem combustível confiável. Durante a auditoria estática, as expectativas de contagem/última viagem foram alinhadas para incluir a viagem real sem combustível.
- `docs/DIARIO_DE_BORDO.md`: atualiza a regra operacional para que o registro de viagens e a disponibilidade do consumo sejam conceitos separados.

### Commits
- `4738f4f8115c2702b925663acd09fcdf4ce4bc84` — alterações iniciais de viagem e fórmulas.
- `357cf3a1d2f0e47d35c34744a6c166d30a6ec7b3` — não contaminar autonomia com viagens sem combustível confiável.
- `d17855b8e1c1cf2ff11644a60ea35c7fac62519f` — validar o metadado opcional na persistência.
- `aa74c73a9cf43da817c385f03ed1a961ec2f9fc5` — regressão para metadado de combustível.
- `d79106abd76575df6f1933a4739cd92820937005` e `4348fbec1b12ee3b6810ca682fc2118d46bfc722` — regressões para médias e viagens reais sem combustível.
- `4a356f47a8aa0b989b4ed3da34d1ed77135621fd` — documentação inicial da regra.
- `b89025537cfd9b3f0111d144f539fe54fec1c8f3` — correção final das expectativas de contagem/última viagem no teste de regressão.
- Branch: `fix/daily-obd-history-keep-screen-awake-main`; PR #49: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/49.

### CI e estado de validação
- CI anteriormente aprovada: run `38016538322`, com jobs `validate` e `android-build` aprovados no commit `7436e408a7ba227c8a738e158afa2e2e869f4d4e`. **Esse resultado é anterior às alterações listadas acima e não as valida.**
- No momento deste registro, não há resultado de CI confirmado para o head atualizado `b89025537cfd9b3f0111d144f539fe54fec1c8f3`. Typecheck, suíte completa, Expo Doctor e APK Android Release permanecem pendentes de confirmação automatizada.
- Teste físico na Meriva/ELM327 permanece pendente; CI verde não comprova compatibilidade real com ECU KWP/K-Line.

### Próximos passos obrigatórios
1. Confirmar a CI do head atual e examinar o resultado de cada job.
2. Se a CI falhar, registrar o erro exato e corrigir sua causa antes de nova tentativa.
3. Revisar a apresentação de consumo `N/D` em todas as telas/exportações e confirmar que nenhuma fórmula transforma o zero interno em medição.
4. Confirmar o comportamento do diário com várias sessões no mesmo dia, falha de gravação e reinício abrupto do app.
5. Não fazer merge nem declarar versão pronta para uso real antes da validação completa e, para comunicação OBD, do teste físico.


## DB-048 · 2026-10-10 — Auditoria e correção da atualização do consumo em tempo real

### Sintoma
O consumo exibido no cockpit podia parecer congelado ou atualizar tarde, mesmo com a conexão OBD ativa.

### Causa encontrada
- O serviço publicava o estado de consumo somente dentro do bloco condicionado à existência de um gravador de viagem ativo.
- O cockpit priorizava a média histórica/persistida em vez da leitura instantânea mais recente.
- O indicador genérico “CONSUMO” não diferenciava explicitamente valor medido pelo PID 015E de estimativa por MAF/MAP.

### Correção
- `src/trip/autoTripService.ts`: o estado de telemetria e consumo instantâneo agora é publicado a cada ciclo OBD válido, inclusive antes de uma viagem começar ou quando não existe gravador ativo. Os dados de distância/combustível da viagem continuam zerados quando não há viagem ativa, sem fabricar acumulados.
- A origem do consumo instantâneo é preservada no estado como `MEASURED_015E`, `ESTIMATED_MAF` ou `ESTIMATED_MAP`.
- `app/index.tsx`: o cockpit prioriza a leitura instantânea; o rótulo informa se é consumo instantâneo OBD medido, instantâneo estimado, média da viagem ou média histórica.
- `tests/regression.test.js`: adicionadas asserções de regressão para a publicação do consumo fora da condição de viagem ativa e preservação da origem.

### Commits
- `e55fc0355264eac295406927960de42312ffd5cf` — publicação do consumo instantâneo fora da viagem ativa.
- `cc4848d006587782a91836a768a8e3079bf06abf` — prioridade do consumo em tempo real no cockpit.
- `6b7e8dd9f8c9158a0c2bc23d9526952f3d716b43` — asserções de regressão.

### Limitações e validação pendente
- A cadência continua limitada pela fila serial do ELM327 e pelo tempo de resposta de cada PID; esta correção remove o bloqueio de atualização da interface, mas não garante por si só uma taxa fixa de atualização.
- A frequência real deve ser medida por `elapsedMs`/`cycleTimeMs` em uso com o adaptador e a ECU reais.
- CI da cabeça atual ainda precisa ser consultada; não declarar a correção validada até `validate` e `android-build` passarem.
- Teste físico na Meriva continua necessário para validar a latência percebida e a plausibilidade dos valores. Consumo estimado deve permanecer identificado como estimativa.



## DB-049 · 2026-10-10 — Otimização do polling do consumo e correção de escopo TypeScript

### Evidência encontrada
Na revisão da atualização anterior, a publicação de estado adicionada ao `runLoop` declarava novamente `gps` e `vehicleSpeedKmh` no mesmo bloco `try`. Isso é uma colisão de identificadores e poderia impedir o typecheck/build. Também havia consultas lentas antes de velocidade/RPM e consultas de fallback a PIDs sem verificar suporte confirmado da ECU.

### Correções aplicadas
- `src/trip/autoTripService.ts`: reorganizado o ciclo para consultar primeiro velocidade `010D`, RPM `010C` e taxa de combustível medida `015E`; o nível do tanque `012F`, que muda lentamente, é consultado a cada quatro ciclos e conserva o último percentual válido entre consultas.
- Corrigida a colisão de identificadores do bloco de publicação de consumo usando nomes locais explícitos para a amostra da viagem (`tripGps`, `tripVehicleSpeedKmh`).
- Os fallbacks por MAF (`0110`) e MAP/IAT (`010B`, `010F`) agora só executam quando os PIDs correspondentes constam como suportados pela ECU. Valores precisam ser finitos antes de entrar na estimativa.
- `tests/regression.test.js`: adicionadas asserções de ordem do caminho crítico, cadência do nível do tanque e gate de suporte para PIDs de estimativa.

### Commits
- `3d47930f559e04fc13179b1a99aa75cd7ddc5351` — priorização do polling e correção das declarações duplicadas.
- `7fc5f3a8d78de59a02ba1093244e8d4ef1e54d10` — consultas de fallback restritas a PIDs suportados.
- `d5d45f52e928c842e8bef98ac4d0411feff9e473` — regressões para ordem e cadência do polling.

### Estado de validação
As alterações foram gravadas na branch `fix/daily-obd-history-keep-screen-awake-main`, PR #49. A CI disparada pelo GitHub precisa ser consultada após este conjunto de commits; nenhum resultado anterior valida estes commits. Não foi feito merge na `main`.

### Limites conhecidos
- O intervalo de 1,5 s é um alvo de cadência, não uma garantia: o transporte serial e o tempo de resposta da ECU continuam determinando a latência real.
- Se `015E` não for suportado, a estimativa depende de MAF ou MAP/RPM/IAT e continua menos confiável; a interface deve identificá-la como estimativa.
- A atualização em tempo real precisa ser medida com ELM327 e ECU reais na Meriva. Testes de código e CI não substituem validação física.

## DB-050 · 2026-10-10 — Temperatura do líquido de arrefecimento no cockpit inicial

### Auditoria
- A página inicial já tinha polling secundário do PID OBD `0105` no serviço de viagens, mas não apresentava a temperatura em um cartão visível no cockpit. Portanto, a telemetria existia no fluxo de consulta, mas faltava a métrica na tela inicial.

### Correção
- `app/index.tsx`: adicionado cartão dinâmico **LÍQUIDO DE ARREFECIMENTO**, alimentado exclusivamente pela leitura `REAL` do PID `0105` (temperatura do líquido de arrefecimento).
- A tela só mostra o valor se a ECU estiver respondendo e a leitura tiver timestamp válido com no máximo 30 segundos; leitura ausente, simulada, desconectada ou obsoleta aparece como `N/D`.
- Indicador visual informa a origem do dado e destaca valores a partir de 110 °C como atenção e 115 °C como temperatura alta. Esses limites são avisos conservadores de interface, não substituem a especificação técnica do veículo nem um diagnóstico mecânico.
- `tests/regression.test.js`: adicionadas regressões estáticas para presença do cartão, origem real, expiração de leitura obsoleta e alerta de temperatura alta.
- O serviço continua consultando `0105` apenas se a ECU anunciar suporte, dentro da rotação de telemetria secundária; a cadência depende do tempo de resposta do ELM327/ECU.

### Commits
- `68ccaec58db85a71cdc495e6d1a188bcb4047508` — cartão dinâmico de temperatura no cockpit.
- `f0da30ef659f80404f26b663b13c8da5531197ef` — regressões para a métrica de temperatura.

### Validação e próximo passo
- Os commits disparam uma nova CI; confirmar `validate` e `android-build` no head atualizado antes de declarar a correção aprovada.
- Teste físico permanece necessário: confirmar que a ECU da Meriva anuncia o PID `0105`, que o valor acompanha o aquecimento real e que os avisos fazem sentido no veículo. Se o PID não for suportado/responder, o app deve manter `N/D`, sem estimar a temperatura.
- Nenhum merge foi realizado.


## DB-051 · 2026-10-10 — Auditoria consolidada de histórico, consumo e telemetria

### Evidências verificadas no repositório
- A exportação do diário diário já está integrada em **Configurações** por `handleDailyHistoryExport()` e `exportDailyObdHistoryTxt()`. A hipótese anterior de que faltava o botão na interface estava incorreta; não duplicar o fluxo.
- O TXT diário registra fronteiras de sessão ECU (`SESSION_START`/`SESSION_END`), não cada amostra individual.
- As amostras são registradas separadamente em `LOGS/obd_raw_YYYY-MM-DD.csv` e `LOGS/obd_interpreted_YYYY-MM-DD.csv`, incluindo timestamp, TX/RX, PID, latência, protocolo, estado e origem. Essa trilha CSV é a fonte adequada para análise temporal e falhas de comunicação; não confundir o TXT de sessões com um logger de cada amostra.
- Já existem catálogo de PIDs, parser, motor de fórmulas, descoberta dos bitmaps de suporte, laboratório OBD, tendências de telemetria em memória e registro CSV. Não criar módulos duplicados; melhorar validação e apresentação em cima desses componentes.
- O suporte OBD depende de resposta válida da ECU. Uma observação bem-sucedida comprova que o PID respondeu, mas não comprova, por si só, que o valor foi validado eletricamente contra um instrumento de referência.

### Correções aplicadas nesta rodada
- `src/meriva/dailyObdHistory.ts`: serializada a operação leitura-modificação-gravação por caminho. Chamadas concorrentes não devem mais sobrescrever silenciosamente o evento de outra sessão.
- `src/database/csvLogger.ts`: corrigida a limpeza da fila de gravação. Antes, o mapa armazenava a promessa derivada de `catch()` e o `finally` comparava outra promessa, impedindo a remoção da entrada concluída. A fila continua serializando escritas por arquivo.
- `app/armazenamento.tsx`: a tela mostra apenas viagens `REAL_OBD`, sem misturar viagens-semente do Car Scanner com viagens registradas pelo aplicativo.
- `app/armazenamento.tsx`: consumo só é mostrado em km/L quando `fuelDataValid` não é falso, combustível acumulado é suficiente e o resultado é finito e positivo; caso contrário, apresenta `Consumo: N/D`, sem transformar sentinela zero em medição.
- `tests/merivaAutosave.test.js`: acrescentado teste comportamental para três eventos de sessão concorrentes, exigindo que todos permaneçam no mesmo arquivo e na mesma data.
- `tests/regression.test.js`: acrescentada regressão para impedir que a tela de histórico volte a apresentar seed como viagem real ou consumo inválido como número.

### Referências de documentação consultadas
- Car Scanner — Custom Sensors/PIDs: https://www.carscanner.info/2019/07/
- Car Scanner — Data Recording: https://www.carscanner.info/records/
- Car Scanner — Optimizing connection speed: https://www.carscanner.info/optimizing-connection-speed/
- Car Scanner — FAQ sobre suporte de PIDs: https://www.carscanner.info/faq/
- OBDLink — Get Started with Logs: https://support.obdlink.com/support/solutions/articles/43000709894
- OBDLink — Dashboards: https://support.obdlink.com/support/solutions/articles/43000678883
- OBDLink — Settings, alerts e user-defined PIDs: https://support.obdlink.com/support/solutions/articles/43000714809
- OBD Auto Doctor — Supported OBD parameters: https://www.obdautodoctor.com/help/articles/supported-obd-parameters/
- OBD Auto Doctor — Manual iOS: https://www.obdautodoctor.com/OBD-Auto-Doctor-User-Manual-iOS.pdf

### Critérios de engenharia preservados
- Priorizar PIDs essenciais e limitar consultas sequenciais: mais PIDs aumentam a latência, especialmente em K-Line; não transportar pressupostos de otimização CAN para a Meriva sem medição.
- Manter resposta bruta, fórmula e valor calculado auditáveis. Separar `DESCOBERTO`, `RESPONDEU` e `VALIDADO NO VEÍCULO`; não promover seed/importação a confirmação da ECU.
- `015E` só pode ser tratado como consumo medido quando a ECU realmente o suportar e responder com dados válidos. MAF/MAP continuam estimativas explicitamente identificadas; sem base confiável, exibir `N/D`.
- O TXT diário permanece um resumo de sessões; para séries temporais, usar os CSVs existentes e os gráficos/tendências, sem prometer que o TXT contém cada leitura.

- `src/meriva/autosaveIntegration.ts`: resposta OBD válida passa a registrar `RESPONDEU`; só preserva `CONFIRMADO` se a evidência anterior estiver explicitamente marcada como `USER_REAL_OBSERVATION`. Confirmação física/validação no veículo exige evidência independente.
- `src/knowledge/ranges.json`: faixa do PID `0143` corrigida para até 25700%, compatível com a fórmula padronizada `((A × 256 + B) × 100) / 255`; regressão adicionada para o limite superior.
- Criado `docs/RELATORIO_PIDS_E_FORMULAS.md`, com inventário dos 34 PIDs, 20 fórmulas, faixas, 1 PID com evidência RAW_ECU, 10 candidatos e alvos de confirmação.

### Validação pendente
- Esta rodada foi gravada na PR #49 e dispara CI automaticamente por causa da política de `push` do repositório. Confirmar os jobs no head final antes de declarar os testes aprovados.
- O teste de sessões concorrentes e a regressão da tela foram adicionados, mas ainda precisam ser executados pela CI.
- Validar no aparelho a persistência após encerramento forçado, a exportação pelo seletor Android e a cadência real do ELM327 na Meriva. Um encerramento inesperado ainda pode impedir o evento explícito `SESSION_END`; os CSVs de telemetria são a trilha complementar, não uma garantia de encerramento físico.
- Não foi feito merge na `main`.


## DB-052 · 2026-10-11 — Recuperação de sessão OBD interrompida

### Problema
O Android pode encerrar o processo sem executar o fechamento normal. O último snapshot poderia manter `obd.connected = true`, levando a uma conexão antiga ser restaurada como se estivesse ativa.

### Correção
- `src/meriva/autosaveManager.ts`: na inicialização, quando o snapshot anterior indicar conexão OBD, limpar conexão/protocolo ativo, preservar `lastKnownProtocol`, persistir o estado seguro e registrar a recuperação.
- `src/meriva/autosaveTypes.ts`: adicionar o motivo de salvamento `session_recovery`.
- `src/meriva/dailyObdHistory.ts`: evento distinto `SESSION_RECOVERED`; o horário é o da detecção na próxima abertura, não uma alegação sobre o instante exato da queda.
- `tests/merivaAutosave.test.js`: regressão comportamental para simular encerramento abrupto e verificar estado desconectado, protocolo preservado e evento no TXT.

### Limites e validação
A recuperação detecta a interrupção na próxima inicialização. Os CSVs continuam sendo a trilha temporal de consultas individuais. Esta alteração dispara nova CI; confirmar `validate` e `android-build` no commit resultante. Teste físico com ELM327/ECU permanece pendente. Não foi feito merge na `main`.


## DB-053 · 2026-10-10 — Fase 1: relatório detalhado de viagem e telemetria por trajeto

### Objetivo
Começar a implementação das melhorias de produto com uma entrega que reaproveita o registro de viagens existente, sem importar dados do Car Scanner e sem aumentar a frequência de consultas OBD.

### Alterações preparadas
- `app/viagens.tsx`: histórico interativo com filtros de período, cartões com data, distância, duração, velocidade média/máxima e consumo apenas quando válido; detalhe individual da viagem; resumo de combustível com origem da taxa; resumo e gráfico compacto de temperatura do arrefecimento; contagem de amostras de RPM/velocidade/ECT; mensagens explícitas para dados ausentes.
- `src/data/driveCycles.ts`: campos opcionais compatíveis com viagens antigas para velocidade máxima e amostras temporais.
- `src/trip/tripRecorder.ts`: persistência de pontos de telemetria esparsos, com intervalo mínimo de 10 segundos e limite de 720 pontos por viagem; preserva timestamp, velocidade, RPM e ECT quando atuais.
- `src/trip/autoTripService.ts`: leitura de tendências existentes de RPM/ECT somente quando a amostra tiver até 10 segundos; nenhuma nova consulta PID foi adicionada por causa do gráfico.
- `src/storage/driveCycleStorage.ts` e `src/database/csvLogger.ts`: validação dos novos campos e exportação de velocidade máxima/contagem de amostras; consumo inválido permanece em branco no CSV.
- `src/meriva/dailyObdHistory.ts`: o resumo das viagens no TXT diário passa a incluir velocidade máxima e número de amostras, sem transformar o TXT em log de cada leitura.
- `tests/tripRecorder.test.js`: regressão para garantir persistência de velocidade máxima e série temporal.

### Limites conhecidos
- Viagens antigas não possuem os novos campos e devem mostrar N/D; não serão preenchidas retroativamente com valores inventados.
- O gráfico mostra apenas amostras reais armazenadas. Não comprova a saúde do sensor e não substitui teste físico com a ECU.
- O armazenamento de pontos é limitado a 720 por viagem, amostrados no máximo a cada 10 segundos, para manter o índice local sob controle.
- Esta alteração foi preparada como objeto Git sem atualizar branch/ref; por isso não dispara CI. Nenhuma CI foi iniciada manualmente e não houve merge.

### Validação pendente
- Executar typecheck, testes de regressão e build Android somente após autorização explícita para publicar a branch e disparar CI.
- Validar no aparelho a persistência de novas viagens, o gráfico ECT e o TXT diário com a Meriva/ELM327 reais.

### Próximas fases de implementação
1. Integridade e exportação do histórico diário; cenários de múltiplas partidas e recuperação.
2. Validação cruzada de sensores, alertas com histerese e painel de saúde.
3. DTC/freeze frame e relatório de diagnóstico com evidências.
4. Diário de manutenção/abastecimento, comparação de viagens, backup/restauração e auditoria de qualidade do adaptador.
5. Revisão visual de todas as telas e navegação integrada, sem duplicar lógica OBD.

## DB-054 · 2026-10-11 — Fase 2: correção de tipagem da recuperação do histórico diário

### Auditoria
- `src/meriva/autosaveManager.ts` registra `SESSION_RECOVERED` quando detecta, na inicialização, que o snapshot anterior deixou a sessão OBD marcada como conectada.
- `src/meriva/dailyObdHistory.ts` já renderizava `SESSION_RECOVERED` e contabilizava esse evento, mas a assinatura pública de `appendDailyObdSessionEvent` aceitava somente `SESSION_START` e `SESSION_END`. Isso criava incompatibilidade de TypeScript no caminho de recuperação, embora o teste que transpila arquivos isoladamente pudesse não detectá-la.

### Correção aplicada
- Ampliado o tipo do evento público para aceitar `SESSION_RECOVERED`, alinhando a API à chamada existente no autosave.
- Nenhuma alteração no protocolo OBD, no formato persistido ou na política de reconexão.
- A exportação TXT diária já possui botão próprio em Configurações; não foi criado um fluxo duplicado.
- `app/_layout.tsx` já usa `expo-keep-awake` para manter a tela ativa enquanto o app está em uso; não foi adicionado outro mecanismo concorrente.

### Validação e limites
- Alteração publicada na branch de trabalho com commit `c19d4607e41e9a636c8d5f166c2ec7898b0b2cd7` (`[skip ci]`); nenhuma CI foi disparada manualmente e não houve merge.
- Typecheck, testes completos e build Android continuam pendentes. Não declarar a branch validada até executar essas verificações com autorização para CI.
- Teste físico com a Meriva e o ELM327 continua obrigatório para validar comunicação, leituras e reconexão.

### Próximas prioridades
1. Executar auditoria estática e regressões do relatório de viagens/telemetria recém-adicionado, corrigindo erros antes de publicar novas mudanças.
2. Validar integridade de gravação e exportação após várias partidas no mesmo dia, incluindo cancelamento do seletor Android e falha de escrita.
3. Revisar limites e histerese dos alertas de temperatura com documentação técnica específica da Meriva; não inferir defeito de sensor apenas por uma leitura.
4. Auditar leitura de DTC e freeze frame para distinguir serviço indisponível, resposta vazia e ausência confirmada de códigos.

## DB-055 · 2026-10-11 — Fase 3: correção do DTC no freeze frame

### Evidência e causa
- `src/obd/dtcScanner.ts` buscava o DTC do serviço Mode 02/PID 02 a partir de `marker + 8`. A resposta positiva contém o cabeçalho `42 02`, um byte de número do frame e só então os dois bytes do DTC. O deslocamento anterior pulava bytes do código e podia fazer um freeze frame válido aparecer sem DTC.
- A tela/relatório não deve interpretar esse resultado como “sem falhas”; a ausência de código parseável significa apenas que não foi extraído um DTC dessa resposta.

### Correção e regressão
- Ajustado o início do DTC para `marker + 6`, mantendo o parser restrito ao payload após o número do frame.
- `tests/dtcScanner.test.js`: adicionado caso com resposta `42 02 00 01 30`, que deve resultar em `P0130` e frame `0`.
- Alteração de produção e teste foram publicadas com commits `450cfc6` e `9057785`, ambos com `[skip ci]`. Nenhuma CI foi iniciada e não houve merge.

### Validação pendente
- O teste foi adicionado, mas não executado neste ambiente; não declarar PASS até executar `npm test`/`npm run validate` com autorização para CI.
- O formato de resposta pode variar entre adaptadores ELM327; confirmar no log bruto da ECU antes de concluir que o frame está disponível. Não limpar DTCs automaticamente.

## DB-056 · 2026-10-11 — Fase 4: integridade da distância em amostras GPS inválidas

### Evidência e risco
- Na auditoria de `src/trip/tripRecorder.ts`, a distância acumulada do GPS era normalizada por uma função que convertia qualquer valor não finito ou negativo em zero.
- Se uma amostra inválida chegasse durante uma viagem, esse zero poderia substituir a última referência absoluta válida. A próxima amostra válida poderia então ser contabilizada como se toda a distância desde zero tivesse sido percorrida, inflando a distância e os indicadores derivados.

### Correção aplicada
- `src/trip/tripRecorder.ts`: distância absoluta inválida agora é tratada como ausência de evidência; não altera a última referência GPS válida. A distância acumulada continua monotônica e o delta seguinte é calculado contra a última referência válida.
- `tests/tripRecorder.test.js`: adicionada regressão com `NaN` entre duas leituras válidas, exigindo que o incremento seja somente o delta real entre a referência anterior e a próxima leitura válida.

### Limites e validação
- Commits: `6fc36c5` (correção) e `256834a` (teste), publicados na branch `fix/daily-obd-history-keep-screen-awake-main`, com `[skip ci]`.
- Nenhuma CI foi disparada manualmente; testes, typecheck e build Android não foram executados nesta etapa. Não declarar o teste como aprovado até executá-lo em ambiente autorizado.
- O teste de código não substitui a validação de distância GPS/velocidade em viagem real na Meriva.
- Nenhum merge foi realizado.

### Próxima etapa
- Continuar a auditoria da persistência de viagens e do histórico diário, priorizando falhas de leitura/escrita, concorrência e recuperação segura sem apagar silenciosamente registros existentes.

## DB-057 · 2026-10-11 — Fase 5: preservar o TXT diário quando a leitura falha

### Evidência e risco
- `src/meriva/dailyObdHistory.ts` capturava qualquer erro ao consultar/ler o arquivo e continuava como se o histórico estivesse vazio.
- Se o arquivo existisse, mas a leitura falhasse temporariamente, o próximo evento poderia ser escrito sobre um conteúdo vazio, apagando silenciosamente sessões anteriores. Isso contrariava o requisito de manter várias partidas no mesmo dia.

### Correção aplicada
- A rotina agora cria o diretório pai explicitamente e diferencia arquivo inexistente de arquivo existente.
- Se o caminho existente for um diretório ou a leitura do arquivo falhar, a operação é interrompida e o erro é propagado. O arquivo anterior não é substituído por um histórico recém-criado.
- `tests/merivaAutosave.test.js`: regressão com falha de leitura simulada; exige rejeição da operação e preservação byte a byte do conteúdo anterior.

### Commits
- `01faaff` — correção para não sobrescrever histórico diário ilegível.
- `09a7aa1` — teste de regressão para falha de leitura.
- `1f66b0c` — registro da proteção de distância GPS na fase anterior.
- Todas as mensagens de commit usam `[skip ci]`; nenhuma CI foi disparada manualmente e nenhum merge foi feito.

### Validação pendente
- Os testes foram adicionados, mas não executados nesta etapa. Typecheck, suíte completa e build Android continuam pendentes.
- A proteção evita sobrescrita causada por erro de leitura. Falhas de gravação ainda precisam ser verificadas em dispositivo e tratadas conforme o comportamento real da API de arquivos do Expo.
- Testar exportação no Android: cancelar o seletor deve deixar o arquivo local intacto; falha de permissão/escrita deve retornar erro explícito sem alegar exportação concluída.


## DB-058 · 2026-10-11 — Fase 6: reduzir fragmentação de viagens e crescimento do TXT

### Evidência
- O TXT de autosave continha até 200 snapshots completos, cada um repetindo quase todo o histórico de viagens. Isso ampliava o arquivo sem acrescentar eventos de viagem únicos.
- O histórico de campo mostrou trajetos de poucos segundos e poucos metros, compatíveis com o fechamento do recorder após apenas 15 segundos parado.
- A rotina de append do histórico de autosave convertia falha de leitura em arquivo vazio e poderia substituir um TXT existente ilegível.
- O estimador MAP ainda usava cilindrada fallback de 1598 cm³, incompatível com a especificação manual confirmada da Meriva de 1389 cm³.

### Correções aplicadas na branch de trabalho
- `src/trip/tripRecorder.ts`: centraliza a regra de encerramento por parada; usa 60 s quando há evidência explícita de RPM zero e 300 s quando o RPM está positivo ou indisponível.
- `src/trip/autoTripService.ts`: não fecha a viagem após 15 s parado; permite reconhecer movimento pela velocidade válida quando RPM está temporariamente indisponível; ajusta a cilindrada fallback do cálculo MAP para 1389 cm³.
- `src/meriva/autosaveTxtFormatter.ts` e `src/meriva/autosaveHistoryTxt.ts`: os snapshots do TXT de autosave mostram no máximo as 10 viagens REAL_OBD mais recentes. O autosave JSON e a exportação TXT completa continuam preservando o histórico integral; seeds CARSCANNER_SEED continuam excluídos.
- `src/meriva/autosaveHistoryTxt.ts`: a operação de append agora propaga falha de leitura e preserva o arquivo existente; a leitura para a interface continua podendo apresentar o cabeçalho de estado vazio sem escrever sobre o arquivo.
- Testes adicionados/atualizados para os limiares de parada, compactação dos snapshots e proteção contra sobrescrita após falha de leitura. `package.json` inclui o teste do formatador no script de validação.

### Validação e CI
- A CI #1879 (run `38133297852`) foi iniciada automaticamente pelo GitHub após um commit sem `[skip ci]`; não foi disparada manualmente.
- `npm ci` e Expo Doctor (17/17) passaram. TypeScript passou. A suíte falhou no novo teste do formatador por um matcher incorreto das linhas de viagem; a asserção foi corrigida depois desse run.
- A CI #1879 executou um commit anterior ao conjunto final de correções. A versão final desta branch ainda não foi validada por TypeScript, suíte completa ou build Android.
- Nenhum merge foi realizado. Validação física com a Meriva/ELM327 continua pendente.

## DB-059 · 2026-10-11 — Regressão no início do histórico diário por concorrência de inicialização

### Sintoma
O diário por data podia deixar de registrar a abertura de uma sessão ECU validada, especialmente na primeira conexão após iniciar o aplicativo.

### Causa técnica identificada
`app/_layout.tsx` inicia o serviço automático de viagens e o fluxo de conexão no mesmo ciclo de inicialização. Ambos podem chamar `initAutoSave()`. A função anterior retornava o estado em memória assim que `runtime.basePath` coincidia, mesmo quando outra chamada ainda estava lendo e hidratando o arquivo JSON. Além disso, `persistValidatedConnection()` tentava iniciar a sessão sem aguardar explicitamente a hidratação.

### Correção aplicada
- `src/meriva/autosaveManager.ts`: inicialização single-flight; chamadas concorrentes para a mesma pasta aguardam a mesma Promise de hidratação.
- `src/obd/sharedConnection.ts`: aguarda `initAutoSave(basePath)` antes de persistir a conexão validada e abrir a sessão.
- `tests/bluetoothLifecycle.test.js`: adicionadas asserções de regressão para ordem de inicialização e proteção contra concorrência.
- Mantido o contrato do diário `VIAGENS/meriva_smart_daily_obd_history.txt`: eventos por data, múltiplas sessões sem substituir os eventos anteriores.

### Validação e estado
- Alterações gravadas na branch `fix/daily-obd-history-keep-screen-awake-main`.
- CI não foi disparada manualmente nesta etapa.
- Testes automatizados e validação física no Android ainda pendentes; não declarar a correção validada até esses resultados.
- PR #49 permanece sem merge; `main` não foi alterada.

## DB-060 · 2026-10-11 — Correção da CI #1911: teste de tela ligada desatualizado

### Falha observada
A CI #1911 executou `npm run doctor` com sucesso e passou pelo TypeScript e por diversos testes, mas falhou em `tests/backgroundExecution.test.js:21`. O teste exigia o import antigo `useKeepAwake` e a chamada do hook, embora `app/_layout.tsx` já tivesse sido alterado para ativação explícita via `activateKeepAwakeAsync`, reativação no retorno ao primeiro plano e limpeza com `deactivateKeepAwake`.

### Correção
Atualizadas as asserções de `tests/backgroundExecution.test.js` para verificar o contrato atual de ativação explícita e os eventos de ciclo de vida do aplicativo. Nenhuma alteração na implementação OBD ou no formato do diário diário foi necessária para esta falha.

### Estado
A correção do teste foi gravada na branch `fix/daily-obd-history-keep-screen-awake-main`. A nova CI deve confirmar o resultado; não considerar validado até a execução terminar verde. O job Android build da execução #1911 foi ignorado porque o job de validação falhou.



## DB-061 · 2026-10-12 — Auditoria de consumo estimado e disparo de CI

### Evidência e correção
- Na leitura de `src/trip/autoTripService.ts`, o fallback MAF aceitava `0 g/s` como entrada válida para estimar combustível. Fluxo de ar zero não sustenta uma estimativa positiva de consumo e podia produzir telemetria enganosa.
- Corrigido o predicado para aceitar somente MAF finito e estritamente maior que zero. Quando o valor é zero, o fluxo segue para a próxima fonte disponível ou mantém consumo como indisponível, sem inventar uma taxa.
- Commit: `f28b5bc63fc77f8bf5596c17241ca7797067ab76` — `fix: reject zero MAF flow as fuel estimate`.

### Validação
- O commit foi gravado diretamente em `main`, o que deve acionar o workflow `CI` configurado para push.
- Resultado de TypeScript, testes, Expo Doctor e build Android: pendente de confirmação no GitHub Actions. Não declarar a correção validada até o workflow terminar.
- A auditoria confirmou que `autoTripService.ts` pausa a gravação de viagem enquanto `ecuConnected` está falso, mas esta inspeção isolada não comprova que todas as rotas de inicialização/parada do GPS estejam condicionadas à ECU. Esse ponto permanece como verificação obrigatória no resultado da PR #55 e no teste físico.

### Próximos passos
1. Verificar o resultado da CI do commit acima e corrigir qualquer falha pela evidência do log.
2. Confirmar no diff/testes se GPS só inicia com ECU respondendo e para ao perder resposta.
3. Conferir histórico diário com várias sessões no mesmo dia, keep-awake, relatório de PIDs/fórmulas e build APK standalone.
4. Encerrar PRs abertas somente após preservar as alterações úteis e verificar que não há trabalho exclusivo perdido.


## DB-062 · 2026-10-12 — Auditoria de desempenho OBD, integridade de PIDs e persistência em lote

### Pesquisa comparativa
Foram comparados os caminhos de atualização documentados pelo `python-OBD`, OBD Auto Doctor e OBDLink com a implementação deste aplicativo:
- `python-OBD Async` mantém um loop de atualização e retorna a última resposta conhecida sem bloquear a interface: https://python-obd.readthedocs.io/en/latest/Async%20Connections/
- OBD Auto Doctor diz que atualiza sensores sequencialmente, conforme a capacidade do veículo, adaptador e conexão: https://www.obdautodoctor.com/features/
- OBDLink documenta que cada PID de logging precisa ser monitorado continuamente e pode reduzir a taxa de atualização dos demais; a opção de trigger por frame de PID prioriza a taxa de amostragem: https://support.obdlink.com/support/solutions/articles/43000709894-get-started-with-logs
- O datasheet ELM327L descreve adaptive timing baseado nas latências de resposta reais, limitado por ATST: https://www.elmelectronics.com/wp-content/uploads/2016/07/ELM327L_Data_Sheet.pdf

### Defeitos encontrados e alterações
1. **Descoberta PIDs / round trips**
   - Reutilizar a resposta real `010C` usada no gate de validação da ECU, não consultar esse PID outra vez na fase de descoberta.
   - Os demais PIDs só são sondados depois de a bitmap atual anunciar suporte. PIDs salvos de sessões anteriores servem apenas para priorizar a ordem, não para contornar o suporte da ECU atual.
   - Consultar a próxima bitmap (`0120`, `0140`, `0160`) somente se a página anterior anunciar o PID de continuação. Um PID só entra no conjunto operacional depois de resposta individual válida; bitmap não é prova de que a consulta do PID funciona.
   - Arquivos: `src/obd/intelligentPidDiscovery.ts`, `src/obd/bluetoothManager.ts`.

2. **Polling / unidade e consumo**
   - Criado contrato de cadência versionado em `src/knowledge/polling_policy.json`: RPM/velocidade no caminho principal; taxa medida `015E` em cada ciclo quando funcional; MAF/MAP como fallback e nível `012F` em cada quatro ciclos, com fases diferentes; telemetria auxiliar rotativa `0105`, `010B`, `0111`, `0142`.
   - MAP não é consultado de novo para a telemetria rotativa quando já foi consultado no fallback MAP/IAT no mesmo ciclo.
   - Corrigido PID `012F`: o parser usa a unidade `percent`, não `%`. A comparação anterior descartava a leitura e afetava nível, litros restantes, reserva e autonomia. Em falha do PID, o último nível válido permanece disponível.
   - MAF zero não gera estimativa de combustível. A estimativa anterior pode permanecer visível por até 10 s, mas só a amostra calculada no ciclo atual alimenta a integração da viagem.
   - Arquivos: `src/trip/autoTripService.ts`, `src/obd/fuelConsumption.ts`, `src/knowledge/polling_policy.json`.

3. **I/O de CSV e persistência de aprendizado**
   - Cada amostra bruta/interpretada é enfileirada sem regravar o CSV inteiro no caminho crítico do PID. A fila escreve em lote ao atingir oito linhas ou um segundo e descarrega ao entrar em `background/inactive`, na desconexão ECU/Bluetooth, antes de exportar e antes de limpar dados.
   - Se uma leitura ou escrita do arquivo falhar, o lote pendente é restaurado e agendado para nova tentativa; a falha continua explícita para o chamador.
   - A partição do CSV diário usa a data local do aparelho; a coluna timestamp continua em ISO UTC. Isso evita que um log feito à noite no Brasil seja arquivado no dia seguinte por causa da conversão UTC.
   - O banco persistente de PIDs/perfil de aprendizado não regrava a mesma amostra do mesmo PID mais de uma vez a cada 5 segundos; cada resposta continua no CSV, e a janela é independente por PID.
   - Arquivos: `src/database/csvLogger.ts`, `src/database/obdLogger.ts`, `src/meriva/autosaveIntegration.ts`, `src/obd/sharedConnection.ts`, `app/armazenamento.tsx`.

4. **GPS e lifecycle**
   - Removido o início independente do GPS em `app/_layout.tsx`; o serviço automático de viagem passa a ser o dono do ciclo de vida GPS. GPS inicia somente quando a ECU está validada/respondendo e para quando a ECU perde resposta, desconecta ou o serviço da viagem é encerrado.
   - Removida a chamada duplicada concorrente de `gpsTracker.stop()` durante o desmontar da raiz; o encerramento segue pelo serviço de viagem.
   - Logs CSV são descarregados inclusive na desconexão intencional mesmo se uma operação de teardown falhar.

5. **Documentação**
   - Atualizados `README.md`, `docs/ELM327_ENGINEERING_PLAYBOOK.md` e `docs/RELATORIO_PIDS_E_FORMULAS.md`: alinhada a configuração atual do transporte Bluetooth (framing local pelo prompt `>`, delimiter vazio), `ATI` descrito como best-effort e não como gate universal, política de aquisição, fronteira de durabilidade do buffer e limitações sem teste físico.
   - O TXT diário continua representando fronteiras de sessão/eventos; os CSVs diários continuam sendo a trilha por amostra.

### Testes/regressões adicionados ou atualizados
- Descoberta adaptativa: reaproveita `010C`, percorre somente bitmaps anunciadas, não permite que cache de PID contorne bitmap atual, não operacionaliza PID sem resposta válida.
- CSV em lote: preserva duas amostras por arquivo, não faz I/O na chamada de enfileiramento e restaura/regrava lote após falha simulada de leitura.
- Persistência de aprendizado: janela mínima por PID e sem inflar ocorrências a cada ciclo de polling.
- Contrato JSON: IDs PIDs no catálogo, fases de polling válidas/não coincidentes, intervalo de aprendizado, unidade de PID `012F`.
- Combustível: MAF zero rejeitado.
- Data diária: partição local do arquivo não muda de dia apenas por converter timestamp para UTC.
- Lifecycle: GPS condicionado à resposta real da ECU.

Arquivos de testes: `tests/regression.test.js`, `tests/merivaAutosave.test.js`, `tests/knowledgeJson.test.js`, `tests/fuelConsumption.test.js`, `tests/backgroundExecution.test.js`.

### Commits de referência desta fase
- `af294e71`, `824ce95b`, `85a0c8c7`, `b63563e6` — logging em lote e recuperação de lote.
- `d2739741`, `62f43c3b`, `6e05ccd6`, `709fcb1a` — descoberta por bitmap e regressões.
- `0e943cb5`, `7ad9769a`, `dfa40d5f` — cadência de polling, unidade/nível combustível e limpeza.
- `36a49c14`, `fec5f625` — data local dos arquivos diários e teste.
- `044efd08`, `7ae45f07`, `8f20e2c9` — README, playbook ELM327 e relatório técnico.
- `58d2808c` — garante flush de CSV no teardown da conexão.

### Validação e limites
- O contrato JSON e as regressões foram adicionados ao script de validação da CI existente. A conclusão deste registro dispara a CI por `push`; o resultado de TypeScript, suíte completa, Expo Doctor e build Android deve ser confirmado no GitHub Actions antes de declarar a fase verde.
- **Sem benchmark alegado:** não há medição nova no mesmo carro/adaptador após essas alterações. A latência depende da ECU KWP/K-Line, do ELM327/clone e do Bluetooth. Não foram alterados `ATST`, `ATAT` nem o protocolo físico sem evidência medida.
- O buffer CSV tem flush de até um segundo e em eventos de lifecycle; um encerramento forçado do processo antes do flush pode perder linhas ainda em memória. A fila preserva o lote quando a API de arquivos informa falha, mas o teste automatizado não substitui teste de armazenamento no Android real.
- Pesquisa de PRs abertas do repositório em 2026-10-12 não retornou PR aberta; não há PR pendente para fechar nesta fase.


## DB-063 · 2026-10-12 — Ajuste da regressão de rotação do cockpit identificada na CI

### Evidência
- A execução CI #1918 (run `38251558555`) passou por instalação de dependências e Expo Doctor, mas falhou em `npm run validate` no teste `tests/orientationLayout.test.js`.
- O log terminava numa asserção que esperava o texto estático `activeHeroMetric + 1/5`. O cockpit atual usa a lista `heroMetrics`, e o serviço OBD passou a ler os PIDs rotativos a partir de `polling_policy.json`; a suite continuava exigindo o array literal anterior `['0105', '010B', '0111', '0142']`.
- A CI #1919 foi iniciada no commit anterior à correção desses testes. Ela não é evidência suficiente para validar o estado final depois dos commits subsequentes.

### Correção
- `app/index.tsx`: tempo e toque agora giram usando `heroMetrics.length`, e o contador mostra o total real da lista, evitando mais um ponto fixo de `5` caso a coleção de métricas mude.
- `tests/orientationLayout.test.js`: atualizadas as verificações para a cadência da lista de PIDs configurada via JSON, a rotação dinâmica, o contador dinâmico e o timer em formatação multilinha.
- Commits: `b7ca3228` (rotação dinâmica), `412d0829` e `0d38f0d4` (contrato dos testes alinhado ao código atual).

### Validação
A nova CI foi disparada ao registrar esta correção. Não declarar TypeScript, testes e build Android como aprovados até a execução mais recente chegar a `completed/success`. Se outra asserção de contrato antigo surgir, corrigir o teste para o comportamento real apenas quando a implementação já estiver coerente; não relaxar testes funcionais.


## DB-064 · 2026-10-12 — Correção de asserções antigas da CI #1920

### Evidência do run
- CI #1920, run `38257980970`, iniciou com commit `7c07a5cb`. `npm ci`, Expo Doctor e TypeScript terminaram com sucesso.
- A regressão `PID + DNA serializados` falhou em `tests/regression.test.js`: asserção exigia `item.pid !== '0105'`, invertendo o comportamento necessário para encontrar a temperatura do arrefecimento, e verificava uma forma antiga de comparação do timestamp.
- O código do cockpit usa `item.pid === '0105'` e calcula `ageMs`, exigindo `ageMs >= 0 && ageMs <= 30_000`. Essa regra é a correta: aceita apenas leitura real, não futura e com no máximo 30 s.

### Correção
- Atualizadas as asserções para verificar identificação positiva do PID `0105` e janela de frescor real, em vez de exigir a expressão antiga.
- Commit: `304c2bde` — `test: assert real coolant PID and freshness window semantics`.

### Estado
A gravação deste registro dispara a CI seguinte. A CI #1920 não terminou verde e não deve ser usada como validação final. É preciso confirmar novamente o script completo, inclusive GPS, persistência e build Android.


## DB-065 · 2026-10-12 — CI #1921 verde na validação e redução dos retries AT opcionais

### Resultado confirmado
- CI #1921, run `38258162611`, commit `5d8eca2a`: `npm ci`, Expo Doctor, TypeScript e `npm test` concluíram com sucesso.
- O job `android-build` já havia passado por `expo prebuild --clean` e estava em `Assemble Android release APK (standalone)` no momento da consulta. Esse resultado ainda não é considerado concluído neste registro.

### Otimização adicional de inicialização
- Evidência: `Elm327Session.performInitialize()` repetia até três vezes um comando AT opcional mesmo quando o adaptador respondia explicitamente `?` (`UNSUPPORTED`). Cada retry adicionava atraso fixo sem chance de a mesma capacidade passar a existir durante a sessão.
- Correção: `src/obd/elm327.ts` interrompe o retry no status `UNSUPPORTED`. Timeout/erro transitório continua usando retries limitados; `ATZ` obrigatório e a janela de assentamento do firmware não foram alterados.
- Teste: `tests/regression.test.js` usa transporte falso e exige exatamente uma emissão de `ATI` quando a resposta é `?`.
- Commits: `65721bf6` (correção) e `83ebd2eb` (regressão); documentação atualizada em `96eaba69` e `4e7c19bd`.

### Estado da validação
Este registro dispara a CI #1922 no head atualizado para cobrir a otimização AT e gerar/validar o APK standalone desse conjunto exato de código. A CI #1921 comprova a validação automatizada do head anterior, não a nova mudança AT; o APK ainda precisa de uma conclusão bem-sucedida na execução mais recente.


## DB-066 · 2026-10-12 — Fixture ELM327 do teste de fast-fail corrigida

- O teste de regressão de comando AT opcional foi ajustado para emitir uma resposta serial realista: payload + CR/LF + prompt `>` do ELM327. A fixture anterior usava barras invertidas literais e não reproduzia o enquadramento real; por isso não classificava `ATI` como `UNSUPPORTED`.
- O teste agora verifica que `ATI` explícito `?` é executado uma única vez durante a inicialização. Timeout e erro transitório continuam elegíveis aos retries limitados do produto.
- Commit: `f1f2001a` — `test: model actual CRLF and ELM prompt in unsupported AT fixture`.
- CI #1922 foi iniciada no head imediatamente anterior a este ajuste. O registro atual dispara a CI seguinte para validar exatamente esta fixture e a mudança de `Elm327Session`. Não usar o resultado de #1922 como prova do estado final.


## DB-067 · 2026-10-13 — Auditoria de performance, política JSON e fast-fail de inicialização

### Escopo e restrição operacional
- Revisão do estado atual de `main`, dos arquivos de transporte/parser/descoberta/polling, catálogos JSON, testes e documentação.
- Pesquisa comparativa em repositórios públicos: `python-OBD`, `Free_OBD`, `AndroidOBD` e `obd-scanner-android`.
- **Não disparar CI**: todas as alterações desta etapa foram feitas na branch `perf/elm327-init-fast-fail-20261013`; commits desta etapa incluem `[skip ci]`. Nenhuma execução de CI foi solicitada ou iniciada por esta etapa.

### Evidências da comparação
- `python-OBD` usa conexão assíncrona/watchers para manter leituras atualizadas sem bloquear a consulta da interface.
- `Free_OBD` mantém uma fila serializada de comandos, diferencia transações AT e OBD e usa bitmaps para descoberta.
- `AndroidOBD` evidencia a transação por socket Bluetooth: enviar comando, aguardar resposta e só então calcular o valor.
- `obd-scanner-android` separa dashboard/diagnóstico/telemetria e cadencia grupos de sensores.
- Referências: https://github.com/tkaracan/python-OBD/blob/master/docs/Async%20Connections.md ; https://github.com/3badguys/Free_OBD ; https://github.com/barnhill/AndroidOBD ; https://github.com/ETSoftwareStudio/obd-scanner-android

### Defeito de performance corrigido
A inicialização podia repetir comandos AT opcionais com erro/timeout até três vezes. Em adaptadores lentos ou que não implementam um comando, cada tentativa podia bloquear a conexão por vários segundos. A falha explícita `?` já era tratada como não suportada; a nova correção estende o fast-fail aos demais erros dos comandos opcionais.

### Modificações
1. `src/obd/elm327.ts`
   - Só `ATZ` (obrigatório) mantém retries de inicialização.
   - `ATI`, `ATE0`, `ATL0`, `ATS0`, `ATH1` recebem timeout curto configurável e não são repetidos em falha transitória.
   - `ATSP0` conserva timeout de seleção de protocolo e não repete a janela longa automaticamente.
2. `src/obd/elm327Compatibility.ts`
   - Adicionados e normalizados `optionalAtTimeoutMs` e `protocolSelectionTimeoutMs`.
3. `src/knowledge/bluetooth_config.json`
   - Adicionados `optionalCommandTimeoutMs: 2500` e `protocolSelectionTimeoutMs: 15000`.
4. `src/obd/bluetoothManager.ts`
   - Aplica os tempos do JSON ao contrato de compatibilidade, respeitando sobrescritas explícitas.
5. Testes
   - `tests/regression.test.js`: verifica timeout curto, timeout de `ATSP0`, ATI não suportado sem retry e erro de AT opcional sem retry.
   - `tests/elm327Compatibility.test.js`: verifica defaults e sobrescrita dos timeouts.
   - `tests/knowledgeJson.test.js`: verifica os campos de timeout no JSON.
6. Documentação
   - Atualizados `docs/ELM327_ENGINEERING_PLAYBOOK.md` e `docs/RELATORIO_PIDS_E_FORMULAS.md` com a política, comparação e limites de validação.

### Auditoria de PIDs/JSON
- `pids.json`, `formulas.json`, `ranges.json`, `meriva_confirmed_pids.json` e `polling_policy.json` foram lidos; todos passaram por parsing JSON nesta auditoria.
- Foi preservada a regra: bitmap anuncia suporte, mas não confirma funcionalidade; um PID só se torna operacional após resposta individual válida.
- A referência do veículo continua com `010C` como único PID confirmado por RAW_ECU. Valores CarScanner permanecem candidatos, não evidência atual.
- Não foram encontrados motivos para alterar fórmulas padrão apenas para aparentar mais suporte. A velocidade do barramento K-Line é serial; não paralelizar comandos no mesmo ELM327.

### Estado dos commits na branch
- `cc4927c1` — timeout curto para comandos opcionais e retry restrito ao ATZ.
- `6128f26e` / `e34f1631` — regressões de timeout e erro opcional.
- `e493a964` — contrato de timeout configurável.
- `b0d68932` — política JSON.
- `355f5ca0` / `446ac4ec` — uso dos timeouts e ligação da política JSON.
- `964385e5` / `92bae46b` — testes de contrato JSON e defaults.
- Documentação adicionada nesta branch; commits marcados `[skip ci]`.

### Validação e próximos passos
- **CI não foi disparada.** TypeScript, testes e APK não estão validados para este conjunto exato de commits.
- Não há benchmark numérico novo, pois não foi feita captura com o Meriva/ELM327 físico após a alteração.
- Próxima validação autorizada: executar `npm run validate`, confirmar build Android e medir tempo de conexão e intervalo real entre respostas de `010D`/`010C` no mesmo adaptador antes/depois.


### Complemento — precisão da regra de inicialização
- Após a política de timeout, corrigido também o comentário em `src/obd/elm327.ts`: apenas `ATZ` é gate obrigatório; `ATI` fornece metadados e não valida por si só o adaptador nem a ECU.
- Commit: `80a53a0d` — `docs: clarify mandatory ELM initialization gate [skip ci]`.
- O registro não altera a regra de validação da ECU por resposta OBD real `010C` e não inicia CI.


## DB-068 · 2026-10-13 — Auditoria cruzada do TXT real, performance OBD, cálculo de combustível e integridade do autosave

### Escopo
- Lido o histórico `meriva_smart_autosave_history.txt` fornecido nesta etapa e cruzado com os serviços de telemetria, polling, combustível, logger CSV, autosave, catálogo de PIDs/JSON, suíte de regressão e documentação.
- Comparação externa com implementações e documentação de aplicativos OBD: `python-OBD`, OBDLink e Car Scanner; pesquisas científicas de propriedades estequiométricas gasolina/etanol.
- As alterações foram aplicadas na `main`. Não foi usado dado pessoal/identificador do veículo no código ou documentação.

### Evidência objetiva do TXT entregue
1. O arquivo tinha **205 blocos** `SALVAMENTO_BEGIN`, mas apenas **200 números distintos** no intervalo 103–302. Os números 262, 263, 264, 265 e 266 apareciam duas vezes, com as cópias fora da ordem numérica no final do arquivo.
2. A seção de leituras mantinha uma amostra antiga de PID `010F` (temperatura do ar admitido) datada vários minutos antes de outras leituras. Isso não prova defeito do parser atual; o valor antigo deve continuar submetido às regras de frescor do painel.
3. Algumas viagens mantêm `fuelDataValid=false`/consumo `N/D` quando a amostragem de combustível não sustenta uma média confiável. O limiar de volume continua protegendo o app de médias enormes ou falsas; não foi convertido em consumo zero.
4. Os DTCs `P0135` e `P0420` do arquivo são evidências do veículo, não defeitos de software; esta etapa não altera nem apaga esses registros.

### Correções em aquisição/performance
- `src/meriva/autosaveIntegration.ts`: persistência do banco de PIDs/perfil de aprendizado passa por fila serializada fora da parte bloqueante de cada ciclo OBD. A leitura atual, telemetria em memória e filas RAW/interpretadas continuam a ser atualizadas, sem esperar I/O de JSON do perfil em cada PID.
- `src/meriva/autosaveManager.ts`: `pushLastReading` sempre atualiza o cache em memória. Mudanças numéricas contínuas (RPM/velocidade) não disparam uma gravação completa de autosave/TXT a cada volta: a persistência normal é limitada a uma vez por PID a cada 10 s. PID novo e mudança de status, unidade ou origem continuam imediatos.
- Ao entrar em background/inactive, o autosave compara o fingerprint do estado atual com o snapshot persistido. Assim, a última leitura atualizada em memória é gravada mesmo se a janela normal de 10 s ainda não venceu.
- `src/database/obdLogger.ts`: CSV bruto e interpretado usam agora a mesma data local do aparelho no nome dos arquivos, enquanto os timestamps permanecem ISO UTC. Corrigida uma divisão de um mesmo dia entre arquivos pela data UTC.
- A sessão ELM327 permanece serial. Nenhuma requisição paralela foi introduzida. A otimização remove I/O de perfil do caminho crítico, limita autosaves repetidos e mantém a cadência de PIDs lentos centralizada em JSON.

### Correções de fórmula de combustível
- Causa encontrada: o cálculo por MAF/MAP usava, por omissão, AFR 14,7 e densidade 0,745 kg/L — parâmetros de referência para gasolina — mesmo quando o usuário escolhia ETANOL ou FLEX nas configurações.
- `src/obd/fuelConsumption.ts`: adicionada seleção explícita de propriedades de combustível. Os valores de referência aproximados são gasolina AFR 14,7/densidade 0,745 kg/L e etanol AFR 9,0/densidade 0,789 kg/L. Esses valores são aproximações de literatura e não calibração específica para a gasolina/etanol local.
- Para FLEX, a estimativa MAF/MAP exige uma composição válida entre 0 e 100% vinda do PID `0152`; o app não presume gasolina silenciosamente. O PID `0152` é consultado apenas quando necessário, anunciado pela bitmap da ECU e com cadência baixa definida em `src/knowledge/polling_policy.json` (30 ciclos).
- `015E` medido em L/h continua com precedência sobre estimativas. A preferência de combustível se propaga para o serviço de viagem sem precisar reler o arquivo de configurações em cada PID. Se faltar composição FLEX e não houver taxa medida válida, a estimativa é indisponível em vez de apresentar um número potencialmente errado.
- `FuelRateIntegrator.addSample` passa a ignorar timestamp antigo sem recuar a referência temporal e corromper integrações subsequentes.

### Integridade do histórico TXT
- `src/meriva/autosaveHistoryTxt.ts`: adicionado dedup por número, retenção da última ocorrência, ordenação crescente e fila serializada de read-modify-write para autosave e exportação simultâneos.
- O próximo append mantém o limite de 200 blocos únicos. Leitura/exportação já apresenta o histórico normalizado; a cópia física local do telefone será compactada quando ocorrer o próximo append/autosave, pois não foi possível executar código remotamente no armazenamento do aparelho.
- Os testes incluem os duplicados de um histórico legado e seis gravações concorrentes; devem terminar com números únicos e ordenados.

### JSON e documentação
- `src/knowledge/polling_policy.json`: versão 2, inclui a política de composição FLEX e invariantes de uso do PID 0152 e prioridade do PID 015E.
- `src/knowledge/bluetooth_config.json`: versão de schema 2, com limites declarados de 2500 ms para comandos AT locais opcionais e até 15000 ms para seleção de protocolo.
- Documentação atualizada em `README.md`, `docs/ELM327_ENGINEERING_PLAYBOOK.md` e `docs/RELATORIO_PIDS_E_FORMULAS.md`.

### Pesquisa externa e decisões técnicas
- `python-OBD` mantém um loop assíncrono de atualização e retorna o último valor conhecido à interface: https://github.com/tkaracan/python-OBD/blob/master/docs/Async%20Connections.md
- A documentação OBDLink esclarece que cada PID continuamente monitorado reduz a taxa de atualização dos demais e que o logging por PID-frame acompanha a taxa efetiva de aquisição: https://support.obdlink.com/support/solutions/articles/43000709894
- O Car Scanner também destaca o número de parâmetros como fator dominante, mas as otimizações multi-requisição mencionadas são para CAN e não foram transplantadas automaticamente para a K-Line: https://www.carscanner.info/optimizing-connection-speed/
- Propriedades aproximadas dos combustíveis: https://pmc.ncbi.nlm.nih.gov/articles/PMC8495882/ e https://www.sciencedirect.com/topics/agricultural-and-biological-sciences/ethanol-fermentation

Conclusão: interfaces assíncronas melhoram a disponibilidade do último valor, mas não aceleram por si só a consulta física. A velocidade real está limitada por resposta ECU, adaptador, protocolo e número de PIDs. A otimização segura aqui é eliminar consultas e persistências redundantes e manter amostragem por prioridade.

### Testes adicionados/atualizados
- Combustível: gasolina versus etanol, modo FLEX sem composição, composição 0/100%, override de calibração e timestamp de amostra fora de ordem.
- Autosave: mudanças numéricas dentro de 10 s atualizam memória sem regravar imediatamente, background salva o valor mais recente e amostras futuras voltam a persistir ao vencer a janela.
- Histórico TXT: dedup dos blocos repetidos e serialização de escritas concorrentes.
- Logs diários: RAW/interpretado permanecem no mesmo dia local perto da meia-noite UTC.
- Contratos JSON: versão de schema/polling, PID de composição e cadência baixa.
- Configurações: alteração do tipo de combustível notifica o serviço ativo.
- Regressão geral: alinhamento entre política JSON, fluxo de combustível e fila de aprendizado.

### Estado de validação e CI
- Esta entrada de diário será o commit final da rodada e deve disparar a CI automática por `push`.
- **A validação TypeScript/testes/Expo Doctor/build APK ainda está pendente para este commit** até a execução aparecer concluída no GitHub Actions. Não declarar sucesso antecipado.
- Não há benchmark de latência físico novo. Após a CI, validar com o Meriva/ELM327 real: tempo até primeira resposta `010C`, intervalo de `010D`/`010C`, taxa de `NO DATA`, consistência de PID 0152/015E e número de blocos únicos no TXT exportado.


### Registro adicional — resultado e correção da CI #1925

- Execução: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/38342099678
- `npm ci`: sucesso.
- Expo Doctor: **17/17** checks aprovados.
- TypeScript: sucesso.
- Suíte de testes: os novos testes de throttle de autosave, deduplicação/concorrência, combustível por tipo, logger diário e contratos JSON passaram.
- Uma única regressão antiga falhou em `tests/regression.test.js`: a asserção verificava a frase em português `não valida a exatidão física do sensor`; uma refatoração anterior havia deixado a mesma explicação somente em inglês. O comportamento funcional não falhou, mas a documentação do contrato local ficou incompatível com a regressão.
- Correção: restaurado em `src/meriva/autosaveIntegration.ts` o comentário em português que explicita que resposta OBD válida não comprova exatidão elétrica do sensor. Commit `e67ed815`.
- A CI #1925 não chegou ao build Android porque `validate` falhou na asserção de texto. O próximo commit desta documentação inicia a CI #1926 para verificar exatamente a correção e o build; ainda não declarar a rodada validada até essa execução terminar verde.


### Registro adicional — CI #1926 repetiu a falha de contrato textual

- Execução: https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/38342200992
- Instalação, Expo Doctor e TypeScript passaram; os testes de autosave e o restante da regressão passaram, mas a mesma asserção de `testPidResponseIsNotVehicleValidation` falhou.
- A causa foi a diferença literal entre o comentário em português e a frase exigida pelo teste. A frase foi alinhada ao contrato existente, sem alterar a regra funcional: uma resposta positiva válida comprova resposta do PID, não exatidão física/elétrica do sensor.
- Commit da correção textual: `54548936`.
- Esta atualização de diário dispara a CI seguinte (#1927 esperada) para validar o head corrigido e executar o build Android; até essa execução acabar verde, a rodada permanece **não validada por CI**.


### Fechamento da rodada de 13/10 — CI #1927 verde

- **Commit validado:** `e6d788c6ca68a520ae9afecfc4dd9de35e12d988`.
- **CI:** [#1927 — execução 38342310092](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/38342310092).
- **Resultado final:** `success`, execução concluída em 13/10/2026.
- **Job `validate`:** sucesso. `npm ci`, Expo Doctor (`npm run doctor`) e `npm run validate` concluíram sem falha.
- **Job `android-build`:** sucesso. Expo prebuild, montagem do APK release standalone, verificação e upload do artefato concluíram sem falha.
- **Causa encerrada nesta rodada:** a regressão textual que bloqueou as CIs #1925 e #1926 foi corrigida no commit `54548936`; a CI #1927 confirmou a validação e a compilação Android do commit `e6d788c`.
- **Escopo deste registro:** somente documentação do resultado já observado; não declara que os defeitos funcionais listados nas próximas etapas foram corrigidos.
- **Próximo passo:** iniciar cada correção funcional em commit isolado, revisar o diff e os contratos/testes afetados antes do push; acompanhar `validate` e `android-build` até ambos terminarem verdes antes de avançar.



### Diagnóstico da CI #1928 — falha de heap no build Android

- **Commit testado:** `3de674bebcf42bab309ece6f12b953613136bae0` (registro documental da CI #1927).
- **Execução:** [CI #1928 — run 38395716356](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/38395716356).
- **Resultado:** job `validate` verde; job `android-build` falhou. `npm ci` e Expo prebuild passaram.
- **Causa real no log:** `java.lang.OutOfMemoryError: Java heap space` dentro de `com.android.tools.build.jetifier.processor.archive.Archive$Builder.extractFile`, durante `JetifyTransform`; a montagem falhou após 3m19s. Não há evidência de falha TypeScript/testes nem de erro no código da aplicação.
- **Correção isolada:** ajustar somente a invocação Gradle do job Android para heap de 4 GiB, metaspace de 1 GiB e no máximo 2 workers, reduzindo o pico de memória nas transformações Jetifier. Nenhuma lógica do app foi alterada.
- **Revisão do diff:** uma linha do comando Gradle em `.github/workflows/ci.yml` e este registro no diário; sem imports, contratos JSON, testes ou comentários de código alterados.
- **Validação da correção:** pendente da próxima CI. Não considerar resolvido até `validate` e `android-build` concluírem verdes.
- **Próximo passo:** acompanhar a CI disparada por este commit. Se o build voltar a falhar, analisar o novo log antes de qualquer alteração adicional.

### Resultado final da CI #1929 — correção de heap validada

- **Commit validado:** `8443126e982dfb75c733d4495d8a051b83876e53` (`ci: increase Gradle heap for Android Jetifier build`).
- **Execução:** [CI #1929 — run 38396421856](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/38396421856).
- **Resultado final:** `success`, concluída em 13/10/2026.
- **Job `validate`:** sucesso; `npm ci`, Expo Doctor e `npm run validate` passaram.
- **Job `android-build`:** sucesso; Expo prebuild, APK release standalone, verificação do APK e upload do artefato passaram.
- **Conclusão:** o aumento de heap Gradle e o limite de dois workers eliminaram a falha de memória observada na CI #1928 nesta execução. A validação confirma o workflow e a compilação, sem alterar a lógica funcional do aplicativo.
- **Próximo passo:** registrar este resultado em commit documental isolado e aguardar a CI disparada por ele antes de avançar para correções funcionais.



## DB-069 · 2026-10-14 — Central de Testes de Sensores (primeira versão)

### Implementação nesta branch
- Criada a rota `app/testes-sensores.tsx`, acessível em Mais Recursos.
- Reutiliza a sessão compartilhada ELM327/ECU; não cria conexão paralela.
- Exige ECU validada e PID `010C` anunciado. Uma leitura real de RPM confirma se o modo selecionado (motor desligado/ligado) é coerente antes de iniciar.
- Consulta em sequência apenas os PIDs conhecidos anunciados pela ECU; permite interromper após a consulta em andamento.
- Guarda PID, valor/unidade, estado do parser, RX bruto, latência e timestamp na tela.
- Criado `src/diagnostics/sensorTestEngine.ts` para separar resposta OBD válida, plausibilidade e hipótese. MAP compara com BARO no modo motor desligado e usa regra heurística contextual na marcha lenta aquecida; temperatura e posição não são declaradas aprovadas só por retornarem número.
- Relatórios TXT são salvos no armazenamento privado do app em `MERIVA_SMART/testes-sensores`.
- Criado `tests/sensorTestEngine.test.js` e incluído no script `npm test`.

### Limitações e segurança
- Limiares são heurísticos e não especificações de fábrica; resposta OBD válida não comprova integridade física/elétrica.
- Sensores que exigem série temporal, malha fechada, comando ativo ou multímetro/osciloscópio ficam explicitamente como não conclusivos.
- As consultas usam a fila serial do ELM327. A duração depende do número de PIDs e da K-Line/KWP; não foram introduzidas consultas paralelas.
- A tela orienta realizar testes com o veículo parado e não usar o telefone durante a condução.

### Arquivos
- `app/testes-sensores.tsx`
- `app/mais.tsx`
- `src/diagnostics/sensorTestEngine.ts`
- `tests/sensorTestEngine.test.js`
- `package.json`
- `docs/DIARIO_DE_BORDO.md`

### Validação
Revisão estática feita contra os contratos de `sharedConnection`, `Elm327Session.queryPid`, `getPidDefinition` e catálogo de PIDs. Testes locais, Expo Doctor e CI não foram executados nesta etapa; não declarar a branch validada até `npm run validate` e build Android terminarem com sucesso.

### Próximo passo
Revisar o diff completo, executar validação TypeScript/testes e build Android, depois testar fisicamente no veículo: primeiro motor desligado, depois motor aquecido em marcha lenta. Não testar durante a condução.


## DB-070 · 2026-10-14 — [HISTÓRICO SUPERSEDIDO EM 2026-10-20] Catálogo JSON, IA de triagem e três leituras por PID

> **Nota histórica:** esta entrada descreve a versão então implementada. A exigência atual é de cinco leituras sequenciais e cinco valores válidos, conforme a entrada de 2026-10-20 “Restaurar cinco leituras do Laboratório e consulta manual de PID”. Não reduzir para três nem usar este registro histórico como especificação atual.

### Pesquisa técnica e limites de evidência
- Consultadas referências públicas SAE J1979/OBD-II e tabelas abertas de PIDs para conferir definição/fórmula, além do Manual do Proprietário Meriva 2012, auditoria da Bíblia e material técnico secundário Econoflex.
- A fonte secundária Multec H X14YFH alerta para aplicação 2007–2008; seus valores/compatibilidade não foram generalizados para o veículo 2011/2012.
- Definição padrão não garante suporte na ECU. O runtime exige bitmap atual e definição em pids.json; PIDs ausentes não são consultados.
- Só 010C permanece confirmado por RAW_ECU; baseline CarScanner não vira evidência de ECU atual.

### Alterações
- Criado src/knowledge/sensor_tests.json com 30 parâmetros candidatos, fontes, limitações, pré-requisitos, regras de avaliação e vínculos da IA offline.
- Refatorado sensorTestEngine.ts para consumir o JSON, exigir três tentativas por PID e três valores válidos para correlação por mediana.
- A Central executa três rodadas seriais dos PIDs suportados, verifica modo do motor pela RPM, mantém RX bruto e gera TXT por tentativa.
- Cronômetro regressivo inicia ao iniciar, estima por comandos/latência observada e só marca conclusão depois de o plano terminar.
- diagnosticEngine.ts consome vínculos do catálogo e acrescenta recomendações às hipóteses DTC/PID.
- Adicionados testes do catálogo, avaliadores com três leituras e recomendação O2/P0135. Criado docs/AUDITORIA_TESTES_SENSORES_2026-10-14.md.

### Riscos e validação
- Cortes são heurísticos, não especificações OEM. Resposta OBD não prova precisão física/elétrica.
- Sem paralelismo ELM327; preservada a fila serial K-Line.
- Ausência de resposta é tentativa sem valor inventado. Parada/perda mantém TXT parcial e não marca sucesso.
- A CI deste commit deve confirmar TypeScript, testes, Expo Doctor e APK. Validação física segue pendente no veículo real.


### Correção de robustez — normalização de identificadores PID
- A auditoria do código identificou que normalizeSensorPid tinha uma regex escapada para corresponder a caracteres literais, em vez de whitespace real.
- Corrigido o normalizador e acrescentado teste de regressão: normalizeSensorPid('01 0C') deve resultar em '010C'. A página já removia whitespace corretamente.
- Nenhuma regra de suporte ou conclusão de sensor foi alterada.
- CI desta correção: TypeScript, testes, Expo Doctor e build Android.


## DB-071 · 2026-10-16 — Incidente: ciclo repetitivo de conexão OBD

### Sintoma relatado
- Ao conectar o ELM327, a tela pisca, desconecta, tenta conectar novamente e repete o ciclo.
- O sintoma foi relatado pelo usuário; não há log de execução do aparelho que comprove a causa inicial da queda.

### Correções preparadas
- Removida a tentativa de conexão OBD do `app/_layout.tsx`; o layout permanece responsável por permissões e ciclo de vida, enquanto a tela inicial é a única proprietária da conexão automática inicial.
- A reconexão em `sharedConnection.ts` preserva a configuração de compatibilidade da sessão original, em vez de voltar aos padrões ao passar configuração indefinida.
- A recuperação reserva o estado `reconnecting` antes de persistir/fechar a sessão, ignorando callbacks repetidos da mesma queda durante a limpeza assíncrona.
- Atualizado `tests/bluetoothLifecycle.test.js` para proteger a propriedade única do fluxo e a preservação da configuração.

### Validação e limites
- Alterações preparadas na branch `fix/obd-reconnect-loop-20261016`.
- Testes automatizados, CI e validação física ainda pendentes; não declarar a correção validada até a execução dos testes e a verificação no veículo.
- Próximo teste físico: com o veículo parado, verificar uma conexão normal, desligar/religar o adaptador e confirmar que a interface não entra em ciclo de pisca/desconexão.

## DB-072 · 2026-10-16 — Ajuste da validação CI da correção Bluetooth

### Evidência
- A execução CI #2193 passou por `npm ci`, Expo Doctor (17/17) e TypeScript.
- A suíte parou em `tests/bluetoothLifecycle.test.js:47` porque o teste ainda exigia uma mensagem de fallback que deixou de existir após o `RootLayout` passar a preparar permissões sem iniciar a conexão OBD.
- A falha encontrada foi uma asserção de teste desatualizada; isso, isoladamente, não comprova a correção física do problema de reconexão.

### Correção
- Substituída a asserção da mensagem antiga por verificações explícitas de que o layout exige as permissões Bluetooth e localização.
- Mantidas as asserções que impedem conexão OBD concorrente no layout e verificam preservação da configuração da sessão durante a recuperação.

### Validação pendente
- Nova CI solicitada pela atualização da branch; confirmar resultado integral, inclusive testes restantes e build Android.
- Teste físico do ELM327 no veículo continua pendente.


## DB-073 · 2026-10-20 — Restaurar cinco leituras do Laboratório e consulta manual de PID

### Problema
- O Laboratório de Sensores havia regredido de cinco para três tentativas por PID.
- A consulta manual de PID e o acesso rápido à lista de PIDs descobertos ficaram difíceis de localizar; a lista não era consistentemente reidratada da sessão/cache.
- A suíte de contrato ainda esperava três leituras, o que provocou a primeira falha de validação após a correção.

### Diagnóstico
- O catálogo JSON, o motor de avaliação, o texto/progresso da tela e o teste de contrato precisavam concordar na exigência de cinco tentativas.
- A avaliação numérica deve exigir cinco tentativas e cinco respostas válidas para o PID avaliado; ausência de resposta não pode virar zero nem ser aprovada como leitura válida.
- A lista pode vir da descoberta da ECU ou do cache persistido; cache antigo não prova suporte atual da ECU e deve ser confirmado por resposta real.

### Correção
- Restaurado o mínimo de cinco leituras por PID no catálogo e na tela do Laboratório.
- O motor passou a calcular a média aritmética das cinco amostras válidas; resultados com amostragem incompleta ficam não conclusivos/sem resposta, conforme o caso.
- Reintroduzida a navegação direta “Consulta manual de PID” em Mais Recursos, normalização/validação de PID Mode 01 e alinhamento do PID consultado com o parser.
- A lista de PIDs recupera a descoberta da sessão/cache e permite tocar em um item para preencher a consulta manual.
- Atualizados testes de regressão do motor, do contrato do catálogo e da navegação para impedir retorno silencioso a três leituras ou remoção do acesso manual.

### Testes e CI
- Primeira execução: `npm run validate` falhou porque `tests/knowledgeJson.test.js` ainda exigia três leituras. Corrigida a expectativa para cinco sem remover a verificação.
- Execução final: [CI #39424459644](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/39424459644) — `validate` **success**; `android-build` **success**; Expo prebuild, montagem do APK standalone, verificação e upload do artefato concluídos.
- Commit validado: `0dbaab941bc4e7a3da07a9f91486cd149e1d9c2c`.
- Artefato de CI: [meriva-smart-diagnostic-standalone-apk](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/39424459644) (disponibilidade indicada pelo GitHub até 2026-11-03; exige acesso ao repositório).
- PR: [#74 — restaurar cinco leituras e consulta manual de PID](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/74).

### Resultado
- Validação automatizada e build Android verdes. Isso confirma compilação e verificações automatizadas, mas não substitui teste de campo com ELM327/ECU reais.
- Não declarar sensor fisicamente aprovado apenas por resposta OBD: os estados são heurísticos e dependem do suporte do PID, do parser e das condições do teste.

### Próximo passo
- Revisar o diff final da PR #74 e executar teste no veículo: cinco amostras por PID, falha de resposta, PID inválido, seleção de PID descoberto/cacheado e consulta manual real.
- Confirmar que a lista mostra claramente a diferença entre PID descoberto na sessão atual e PID recuperado do cache antes de tratar a informação como suporte confirmado.
- Não integrar a PR até concluir a revisão do diff e o teste de regressão funcional, caso permaneça alguma divergência de UX.


## DB-074 · 2026-10-20 — Cockpit inicial: indicadores OBD e estado de falhas

### Problema
- O indicador rotativo principal ainda incluía velocidade GPS, embora o cockpit devesse priorizar os quatro parâmetros OBD definidos.
- O cartão grande “Saúde do veículo” repetia conteúdo/navegação da central detalhada.
- O contador de falhas podia mostrar “NORMAL” com a ECU desconectada, confundindo ausência de leitura atual com ausência de DTC.
- O estilo visual de alerta térmico podia sobrescrever a tipografia do valor principal.

### Diagnóstico
- As correções pertencem à apresentação do cockpit. Não foi necessário alterar a fila serial ELM327, o parser de PIDs, a descoberta OBD ou os serviços de conexão.
- Os quatro indicadores usam leituras reais finitas e recentes (até 30 segundos), somente com ECU conectada; caso contrário, mostram N/D.
- A central detalhada de saúde continua acessível em Mais Recursos, pela rota /saude.

### Correção
- O ciclo de 10 segundos agora percorre temperatura do motor (0105), tensão do módulo (0142), posição da borboleta (0111) e RPM (010C). O toque no indicador continua permitindo avançar manualmente.
- Removido da página inicial o cartão duplicado de saúde, sem excluir a tela /saude.
- O contador de falhas mostra N/D quando a ECU não está conectada; com conexão atual, mostra quantidade de DTCs ou SEM DTC.
- Estilo de alerta térmico limitado à cor, preservando o tamanho do valor principal.
- Criados testes de regressão em tests/orientationLayout.test.js e tests/cockpitNavigation.test.js para proteger o conjunto de quatro métricas, o estado N/D e a navegação para a central de saúde.

### Testes e CI
- [CI #2542](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/39437018218): job validate **success**; job android-build **success**.
- Expo Doctor: **17/17** verificações aprovadas.
- npm run validate: **success**.
- Prebuild Android, montagem do APK standalone, verificação do APK e upload do artefato: **success**.
- Commit de código validado: b2d90079a5d12e3468f40289ebe5b0b776ecc231.
- Artefato meriva-smart-diagnostic-standalone-apk: 27.443.656 bytes, SHA-256 126605b500ea50b7858cc5d6d0a9c7445bc16a87074e829ad2997d7ca34e93d6; disponível até 2026-11-03 no GitHub Actions (requer acesso ao repositório).

### Resultado e limites
- Cockpit e validação automatizada/build Android verdes no commit registrado acima.
- A validação automatizada não substitui a verificação física no aparelho. Ainda não foi realizado teste desta revisão com ELM327/ECU reais, nem verificação visual final em retrato e paisagem.
- PR #74 continua aberta e não foi integrada ao main.

### Próximo passo
- Instalar o APK da CI e conferir os quatro indicadores em retrato/paisagem, a alternância de 10 segundos e o comportamento N/D com ECU desconectada.
- No carro parado, confirmar leituras reais de 0105/0142/0111/010C e validar os fluxos do Laboratório: cinco leituras sequenciais, respostas ausentes, PID manual inválido e PID selecionado da lista. Distinguir sempre PID guardado em cache de suporte confirmado pela ECU atual.
- Rever o diff completo da PR e só então decidir o merge.


## DB-075 · 2026-10-20 — Gráficos de telemetria ao vivo e histórico por viagem

### Problema e diagnóstico
- A tela Dados já mostrava sparklines textuais de quatro parâmetros, mas não permitia examinar curvas nem comparar telemetria de uma viagem real finalizada.
- O projeto já tinha fontes apropriadas: janela móvel em memória por PID, com limite de 120 pontos por PID, e pontos temporais esparsos persistidos em viagens reais (no máximo 720 pontos por viagem, com intervalo mínimo de 10 s). Criar um segundo logger/histórico seria redundante e aumentaria I/O no Android.
- A lista de “últimas leituras reais” usava a ordem do array cacheado e não filtrava explicitamente origem SIMULAÇÃO, portanto precisava ser ordenada pelo timestamp e filtrada por fonte.

### Correção implementada
- Criado `src/obd/telemetryChart.ts`, helper puro para calcular coordenadas, segmentos e estatísticas de gráfico sem dependências externas.
- O helper descarta timestamps inválidos/futuros e valores numéricos inválidos, limita a janela desenhada e **não liga os dois lados de uma amostra ausente**; séries vazias/dimensões inválidas retornam sem gráfico.
- `app/dados.tsx`: adicionado seletor de parâmetros reais para a série da sessão ECU atual e alternância para telemetria persistida em viagens `REAL_OBD` finalizadas.
- Histórico de viagem usa somente `DriveCycle.telemetrySamples` já gravado. Viagens `SIMULACAO`, `CARSCANNER_SEED` e viagens antigas sem amostras não recebem valores artificiais.
- A sessão ao vivo usa `getLiveSeries()` existente; quando a ECU está desconectada, o gráfico não reapresenta amostras antigas como se fossem atuais.
- As últimas leituras agora filtram `source === 'REAL'` e são ordenadas pelo timestamp mais recente.
- Não foram adicionados pacotes, servidores nem novas consultas OBD; o polling ELM327 permanece serial.

### Testes adicionados
- `tests/liveTelemetry.test.js`: cobre cálculo de mínimos/máximos/média/variação, coordenadas dentro dos limites, amostra faltante sem segmento cruzado, timestamps inválidos/futuros, série vazia, dimensões inválidas e séries planas.
- `tests/cockpitNavigation.test.js`: protege a reutilização da janela de telemetria, o histórico `REAL_OBD`, o filtro das últimas leituras reais e o modo de viagens salvas.

### Validação e CI
- Esta implementação foi publicada no branch `fix/restore-five-readings-manual-pids-20261020`; **TypeScript, suíte completa e APK Android estão pendentes da CI deste commit**. Registrar o run e o resultado após a execução, sem assumir PASS antecipado.
- Teste físico ainda pendente: confirmar no aparelho as curvas ao vivo, o comportamento sem ECU, a navegação retrato/paisagem e que uma viagem recém-finalizada aparece no histórico local com as amostras efetivamente gravadas.

### Próximo passo
- Aguardar CI completa (`validate` e `android-build`), corrigir falhas pela evidência do log e registrar o resultado final.
- Após instalar o APK, conferir amostras reais na Meriva/ELM327; não tratar a validação automatizada como prova de precisão dos sensores nem de suporte a todos os PIDs.


### Ajuste revelado pela primeira CI da etapa de gráficos
- CI #2546 — run [39445022697](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/39445022697): `npm ci`, Expo Doctor e o início de `npm run validate` foram executados; o typecheck falhou em `app/dados.tsx` nas linhas 131 e 167 porque `styles.chartFootnote` era usado pela tela, mas não estava declarado no `StyleSheet`.
- Diagnóstico: erro de tipagem da apresentação, não falha do parser, da aquisição OBD ou da geometria do gráfico. O job `android-build` foi corretamente ignorado por depender de `validate`.
- Correção: declarado `chartFootnote` com tipografia compacta e alinhada ao restante dos metadados do gráfico.
- A nova CI deve confirmar a correção e executar o APK Android. Até ambos os jobs ficarem verdes, a etapa continua **não validada**.


### Resultado final da CI — etapa de gráficos de telemetria
- CI #2548 — [execução 39445257264](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/39445257264), commit `b3d71e912a4b77d00e6f927f553a0a3b85754526`: **concluída com sucesso**.
- `validate`: PASS — `npm ci`, Expo Doctor (17/17 verificações) e `npm run validate` passaram, incluindo typecheck e os testes de regressão adicionados.
- `android-build`: PASS — Expo prebuild, montagem do APK standalone, verificação do APK e upload do artefato passaram.
- Artefato: [meriva-smart-diagnostic-standalone-apk](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/39445257264/artifacts/12277461327), aproximadamente 27,45 MB; expira em 03/11/2026.
- Hash SHA-256 do artefato publicado: `82b5c835945b92a485277e35fac4df82c721d7f2c134c26514cb7081b7877b24`.
- A falha inicial de tipagem do estilo `chartFootnote` foi corrigida antes desta execução verde.
- Limite da evidência: CI confirma validação automatizada e compilação, não confirma conexão física com ELM327, exatidão dos sensores, qualidade das curvas em condução nem persistência após reinstalação.
- PR #74 permanece aberta e não foi mesclada.


## DB-076 · 2026-10-20 — Auditoria P1–P5 e enriquecimento opcional de clima

### Escopo e auditoria
- Revisado o estado do branch da PR #74 antes de alterar código; a PR permanece aberta e não foi mesclada.
- **P1 — OBD/ELM327:** reutilizados o transporte Bluetooth Classic, o estado explícito de resposta da ECU, a telemetria real e a suíte de regressão existente. Não foi adicionada segunda fila de polling nem biblioteca OBD paralela.
- **P2 — GPS/viagens:** confirmada a existência de `expo-location`, `expo-task-manager`, serviço de viagens automáticas, tarefas em segundo plano e testes de GPS/permissões. Nenhuma dependência duplicada foi adicionada.
- **P3 — Internet opcional:** implementado enriquecimento de cidade/condição climática na página inicial. Usa a permissão de localização em primeiro plano somente se já concedida; não solicita permissão automaticamente. Falha de GPS, permissão ou rede degrada para N/D e não interfere com aquisição OBD.
- **P4 — Histórico/exportação:** reutilizadas as funções de persistência local e exportação TXT existentes, incluindo histórico diário separado e registros de viagens. Não foi criado um segundo armazenamento.
- **P5 — Interface/alertas:** mantidos o cockpit, indicadores reais, estados N/D, gráfico ao vivo e histórico já existentes. Alertas térmicos continuam informativos; não foi introduzida notificação de fundo sem necessidade validada. Auditoria visual de acessibilidade em aparelho real continua pendente.

### Implementação P3
- Novo `src/weather/currentConditions.ts`: consulta Open-Meteo para temperatura/código meteorológico; geocodificação reversa tenta obter o nome da cidade. O recurso é somente de apresentação, não alimenta o motor diagnóstico.
- `app/index.tsx`: exibe faixa compacta com cidade, temperatura e condição do tempo; estado indisponível é explícito.
- Sem nova dependência: aproveita `expo-location` já instalado no Expo SDK 51 e a API `fetch` do React Native.
- Privacidade e operação offline: nenhuma solicitação nova de permissão; não envia coordenadas se a permissão existente não estiver concedida. Falha de rede não bloqueia nem altera leituras OBD.
- Novo `tests/onlineConditions.test.js`: cobre códigos de tempo, ausência de permissão sem leitura GPS, fallback offline e resposta online.
- `package.json`: adiciona o teste à suíte `npm test`; não houve alteração de versão do Expo nem instalação de pacote.

### Commits
- `39e7aa0bcad1ed1e506d7b1fe3e921c6201518cb` — módulo de clima opcional.
- `e219118773ed366306368b74cac1f93a53a096b5` — faixa de clima na página inicial.
- `4f1c2b1dbbab99035ccd6fafb28440e850c447cc` — testes de fallback online/offline.
- `b980bdf6ed16c3c07d90af650b5c60edbf434768` — suíte de teste atualizada.

### Testes e CI — status registrado em 2026-10-20
- Run [39449909465 / CI #2560](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/39449909465), commit de código `2b853e9830213b23f520a7e7eb12e7cbb7e8a237`: `npm ci` **PASS**, Expo Doctor **PASS**, `npm run validate` **PASS**.
- No momento da atualização deste trecho, `android-build` ainda estava montando o APK release standalone. Portanto, **a CI completa continua pendente** até aparecer conclusão `success` nesse job e terminar verificação/upload do APK.
- A execução anterior [39448090512](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/39448090512) passou em ambos os jobs para um commit anterior, mas não substitui a confirmação da cabeça atual.
- Este status é um retrato do run consultado; ao atualizar a CI, registrar o resultado real sem inferir PASS com base em uma etapa intermediária.

### Limites e próximos passos
1. Confirmar o resultado final de `android-build` para o código de clima opcional e atualizar este diário com evidência.
2. Verificar o APK instalado: página inicial online, modo avião, permissão de localização negada e retorno de internet.
3. Testar no carro a estabilidade Bluetooth/ECU, cinco leituras sequenciais, consulta manual PID e gravação/encerramento GPS; CI não substitui o teste físico.
4. Capturar telas atuais em retrato e paisagem para verificar legibilidade, overflow e acessibilidade.
5. Manter a PR #74 aberta até revisão final e autorização explícita de merge.


## DB-077 · 2026-10-20 — Consolidação do diário e salvaguardas contra regressões

### Problema
O diário cresceu e passou a reunir muitos “próximos passos” históricos. A implementação de três leituras em 14/10 aparecia perto de registros mais recentes que exigem cinco, criando risco de um agente futuro seguir uma descrição antiga em vez da regra atual. Havia também vários estados de CI pendentes que pertenciam a commits anteriores.

### Correção documental
- Adicionada no início uma seção de estado vigente e contratos anti-regressão, com a ordem de precedência explícita: estado atual + entrada mais recente verificada > registros históricos.
- Destacadas como invariantes as cinco leituras válidas, consulta manual e seleção de PIDs, fila serial única ELM327, modo offline, fronteiras entre dados reais/seeds/simulação, regras de GPS/viagens, compatibilidade Expo SDK 51 e CI completa.
- Marcada a seção de 14/10 sobre três leituras como histórica e supersedida pela correção de 20/10.
- Atualizado o bloco de CI da entrada P1–P5 com o status realmente observado do run 39449909465: `validate` passou; `android-build` ainda estava em execução na última consulta. Não foi presumida aprovação final.
- Preservados os diagnósticos de falhas antigas e as correções que servem como evidência de regressões já ocorridas. Não foram apagados históricos técnicos só para encurtar o arquivo.
- Nenhum arquivo de produção, dependência, catálogo de PIDs ou configuração Android foi alterado nesta consolidação.

### Verificação e CI
- Base documental lida integralmente: 2.611 linhas na versão anterior.
- Branch: `fix/restore-five-readings-manual-pids-20261020`.
- PR #74 continua aberta e não mesclada.
- A alteração é documental. A nova CI associada ao commit deste diário deve ser observada separadamente; o run anterior não deve ser descrito como validação de um SHA posterior.

### Resultado
O diário agora oferece primeiro o contrato que deve ser obedecido antes de apresentar o histórico. O registro de três leituras permanece apenas para explicar a regressão passada; não é mais uma instrução operacional.

### Próximo passo
Confirmar a nova execução de CI após este commit e atualizar o registro final de `validate` e `android-build`. Depois da CI, executar validação física no Android/ELM327 e verificação visual retrato/paisagem; não fazer merge sem autorização.


## DB-078 · 2026-10-20 — Índice enumerado de todas as atualizações e regra de leitura

### Solicitação
Enumerar todas as atualizações do diário para que trabalhos futuros encontrem primeiro as decisões mais recentes e não recuperem instruções antigas como se fossem atuais.

### Alterações
- Atribuído ID sequencial `DB-001` a `DB-077` a cada seção de atualização datada já existente, preservando a ordem do documento e os detalhes técnicos históricos.
- O índice integral dessas entradas foi inserido no início do arquivo.
- Esta atualização passa a ser `DB-078`; novas atualizações devem receber o próximo número sequencial, sem reutilizar IDs.
- A seção antiga de três leituras permanece identificada como supersedida; o contrato atual continua exigindo cinco tentativas sequenciais e cinco respostas válidas para avaliação numérica.
- Corrigida a duplicação do parágrafo introdutório.
- Reforçada a regra de que o SHA da cabeça da PR e a CI devem ser verificados ao vivo no GitHub. Não usar um SHA ou estado de CI estático do diário como fonte mais atual quando já houver commits posteriores.

### Regra obrigatória para toda retomada
1. Ler “ESTADO VIGENTE E REGRAS ANTI-REGRESSÃO”.
2. Consultar o índice e abrir a maior entrada `DB-NNN`; ela é o ponto de retomada documental.
3. Verificar na PR #74 o HEAD/SHA real e a última CI associada a esse SHA; olhar os dois jobs `validate` e `android-build`.
4. Ler as entradas relevantes anteriores para causas/regressões, mas confirmar no código se uma tarefa continua pendente antes de executá-la.
5. Ao concluir qualquer ação, acrescentar nova entrada com o próximo ID, atualizar o índice no início, registrar commit/CI com evidência e manter a PR aberta até autorização explícita de merge.

### Estado ao registrar
- Branch: `fix/restore-five-readings-manual-pids-20261020`.
- PR #74 permanece aberta e não mesclada.
- Nenhuma alteração de código funcional foi feita nesta atualização.
- A CI precisa ser consultada novamente após este commit; um run anterior não valida automaticamente o novo SHA.

### Resultado
O diário contém 78 atualizações enumeradas no índice e no próprio cabeçalho das entradas. O número de referência cresce monotonamente: a próxima entrada será `DB-079`.


## DB-079 · 2026-10-20 — Camada executável anti-regressão

### Problema
O índice numerado melhora a retomada documental, mas não impede sozinho que uma alteração futura remova uma funcionalidade, reduza o número de leituras ou deixe de executar uma suíte crítica na CI.

### Diagnóstico
Já existiam testes de comportamento para PIDs, consulta manual, cockpit, Bluetooth/ELM327, GPS, histórico e clima offline. A falha processual era não haver um gate único que verificasse os contratos centrais e confirmasse que as principais suítes continuavam conectadas ao comando de validação.

### Correção
- Criado `docs/CONTRATO_ANTI_REGRESSAO.md`, com RG-01 a RG-10, seus testes responsáveis, regras para mudanças autorizadas e procedimento de retomada.
- Criado `tests/projectBaseline.test.js`, que valida: cinco leituras por PID; presença das suítes essenciais em `npm test`; unicidade da fila serial ELM327; fluxo único de conexão; diagnóstico local separado do clima; Expo SDK 51; coerência de `package.json` e `package-lock.json`; e os quatro indicadores atuais do cockpit.
- Adicionado o comando `npm run gate:baseline`.
- Adicionado ao workflow de CI o passo visível **Run anti-regression baseline gate**, antes de `npm run validate`. Uma regressão nos contratos cobertos falha a validação, em vez de depender apenas de revisão manual do diário.
- Mantidas as suítes comportamentais individuais; o gate não as substitui e também verifica se permanecem conectadas à suíte principal.
- Nenhuma regra diagnóstica, fórmula, PID, configuração Bluetooth ou dependência de produção foi modificada.

### Arquivos
- `docs/CONTRATO_ANTI_REGRESSAO.md` (novo)
- `tests/projectBaseline.test.js` (novo)
- `package.json`
- `.github/workflows/ci.yml`
- `docs/DIARIO_DE_BORDO.md`

### Testes e CI
- O gate foi integrado ao workflow em um passo independente e à execução de validação por script. A CI iniciada pelo novo commit deve ser consultada para confirmar a execução real.
- Não declarar sucesso antecipado: é necessário que o novo HEAD conclua `gate:baseline`, `validate` e `android-build` com sucesso.
- Nenhuma validação física ELM327/ECU foi realizada por esta alteração documental/estrutural.

### Resultado e limites
A partir deste commit, as regressões cobertas no contrato são verificadas automaticamente na CI, além de ficarem documentadas. O mecanismo reduz regressões acidentais, mas não substitui revisão de diff, teste no aparelho e teste com ECU real.

### Próximo passo
Consultar a CI do SHA resultante; corrigir falhas a partir dos logs. Em toda alteração futura, atualizar código + testes + contrato + diário de modo consistente, e manter a PR #74 aberta até autorização explícita para merge.


## DB-080 · 2026-10-20 — Revisão preventiva do próprio gate anti-regressão

### Problema
Durante a revisão estática da nova barreira RG, uma asserção comparava a ordem exata de palavras de um invariante com a redação do contrato, embora o significado estivesse correto.

### Diagnóstico
A validação da camada de proteção não deve depender de uma formulação editorial idêntica quando o contrato preserva o mesmo significado. Isso criaria falha artificial da CI por redação e reduziria a confiança no gate.

### Correção
- Ajustada a asserção de tests/projectBaseline.test.js para procurar a formulação que consta no contrato (“fila serial única”).
- Nenhum código de produção, regra funcional ou teste de comportamento foi alterado.
- A correção ocorreu antes de considerar verde a nova CI; o resultado deve vir do run da cabeça atual, não desta revisão estática.

### Próximo passo
Conferir a execução de CI da cabeça mais recente. Se o gate apontar outra divergência, corrigir pelo código/contrato real e registrar nova entrada com o próximo ID.


## DB-081 · 2026-10-20 — Correção do pisca-pisca do cockpit e restauração da navegação inferior

### Problema observado
A tela inicial passou a apresentar piscadas e os botões inferiores deixaram de aparecer após as alterações recentes.

### Diagnóstico estático
- O efeito de conexão automática dependia do objeto completo `settings`. A tela recarrega as configurações ao ganhar foco; cada leitura pode produzir um novo objeto mesmo que todas as opções sejam iguais. Isso reiniciava o efeito de conexão e reinscrevia listeners sem necessidade, podendo repetir tentativas de conexão quando o usuário navegava e voltava ao cockpit.
- A navegação inferior estava explicitamente condicionada a `!layout.landscape`, portanto desaparecia por definição ao girar o aparelho para paisagem.
- Estes são defeitos identificáveis no código. Ainda não constituem prova de que explicam toda piscada observada no aparelho; a validação física continua necessária.

### Correção implementada
- O efeito de conexão agora depende dos valores primitivos das opções OBD relevantes, e não da identidade do objeto `settings`. Uma recarga sem alteração de configuração não reinicia o fluxo de conexão; alterações reais das opções continuam atualizando o efeito.
- Os botões inferiores Bluetooth e Mais Recursos, junto do estado do diário, permanecem renderizados em retrato e paisagem; a paisagem recebe um ajuste compacto de espaçamento.
- Não foram alterados o transporte Bluetooth Classic, a fila serial ELM327, o protocolo KWP, a validação de resposta ECU, as regras diagnósticas, o número de leituras dos testes nem o catálogo de PIDs.

### Testes adicionados
- `tests/cockpitNavigation.test.js` protege contra a dependência do objeto de configurações inteiro e contra o desaparecimento da navegação ao mudar para paisagem.
- A suíte completa e o build Android ainda precisam confirmar que a alteração compila e passa pelos testes automatizados.

### Commit e CI
- Branch de correção: `fix/cockpit-flicker-restore-buttons-20261020`, criada a partir da cabeça `a9668cf7d3759dfcaf1ef95ccf9f7684fb13ac03) da PR #74.
- Alterações publicadas em commits separados de `app/index.tsx`, `tests/cockpitNavigation.test.js` e deste diário. Os SHAs resultantes e a CI serão consultados no GitHub; não presumir CI verde antes da conclusão dos jobs `validate` e `android-build`.
- A PR #74 não foi mesclada.

### Próximo passo
Executar `npm run validate` e `android-build` pela CI da branch de correção. Se ambos passarem, instalar o APK e reproduzir a navegação em retrato e paisagem; verificar também conexão, desconexão e retorno do app do segundo plano. Se continuar piscando com a conexão estável, recolher logcat e rastrear mudanças de estado/renderização no aparelho antes de alterar o transporte OBD.


## DB-082 · 2026-10-21 — Auditoria visual, tema comum e proteção de consistência entre telas

### Problema e evidência
- A inspeção do código confirmou uma inconsistência visível: o Laboratório OBD usava fundo claro (#eef3fb), cartões brancos e textos escuros, enquanto o cockpit e as demais telas usavam tema escuro.
- As telas secundárias tinham tamanhos/estilos de título divergentes, e o cabeçalho nativo do Expo usava cinza claro/azul apesar do conteúdo escuro.
- A PR #75 tinha `validate` e `android-build` verdes no run #2573 antes desta mudança. Esse resultado é histórico e não valida este novo commit.

### Correções
- Criado `src/ui/theme.ts` com tokens compartilhados de cor e estilo de título.
- Padronizados o fundo das telas, os títulos secundários, o cabeçalho nativo e a paleta do Laboratório; definido `userInterfaceStyle: dark` no Expo.
- Criado `tests/screenTheme.test.js` e conectado a `npm test` e ao gate anti-regressão. O contrato RG-11 protege a consistência visual básica.
- Preservados os fluxos de OBD, a fila serial ELM327, os cinco valores válidos por PID, a consulta manual, os dados offline e as regras diagnósticas.

### Validação e limites
- O commit desta alteração precisa de CI nova com `gate:baseline`, `validate` e `android-build`; nenhum resultado está sendo presumido.
- A validação automatizada verifica os contratos de tema, não substitui inspeção visual no Android em retrato/paisagem. A correção da piscada também requer teste físico com ELM327 para confirmar o comportamento real.
- Não foram adicionadas dependências.

### Próximo passo
Consultar a CI associada ao SHA atual; corrigir qualquer falha pelo log. Após CI verde, instalar o APK e verificar contraste, títulos, barras nativas, botões inferiores, orientação, ciclo de conexão e tela do Laboratório.


## DB-083 · 2026-10-21 — Navegação inferior somente com ícones e alvos acessíveis

### Problema e evidência
- O requisito visual anterior pedia botões inferiores sem legendas visíveis, mas o cockpit e a tela Bluetooth ainda renderizavam rótulos textuais.
- A altura visual/tátil dos itens podia ficar abaixo da recomendação Android de 48 dp para alvos de toque.

### Correção
- Removidas as legendas visuais da navegação inferior no cockpit e na tela Bluetooth; ícones preservados.
- Adicionados `accessibilityLabel`/estado selecionado para que a navegação sem texto continue identificável por leitores de tela.
- Definidos alvos de navegação com `minHeight: 48` e ícones de 22 dp.
- Adicionadas asserções de regressão para navegação icon-only, altura mínima e rótulos de acessibilidade.

### Validação
- A CI do commit de padronização visual está sendo acompanhada separadamente. A alteração icon-only será validada pela próxima execução de `gate:baseline`, `validate` e `android-build`.
- A inspeção tátil/visual em telefone Android continua necessária.

### Próximo passo
Confirmar a CI da cabeça atual e testar os botões em retrato e paisagem, inclusive com TalkBack.


## DB-084 · 2026-10-21 — Biblioteca visual compartilhada, monitoramento de rede 4G/5G e página de conectividade

### Problema e pesquisa técnica
- Navegação e atalhos usavam emojis/glifos misturados, sem vocabulário visual compartilhado.
- O projeto está fixado em Expo SDK 51. A biblioteca `@expo/vector-icons@14.1.0` já constava no lockfile, então foi escolhida para esta atualização compatível com o runtime atual; a migração para os pacotes modulares recomendados pelo Expo fica como atualização de plataforma separada, com matriz própria de compatibilidade e CI.
- O NetInfo fornece estado do transporte, alcance da internet e geração celular. A UI diferencia rede ativa de acesso à internet confirmado e não inventa geração móvel ausente nos dados do Android.

### Correções implementadas
- Criado `src/ui/AppIcon.tsx`, com ícones Ionicons e nomes semânticos centralizados.
- Substituídos emojis/glifos nos atalhos do cockpit, navegação inferior, Bluetooth e botões principais de Dados, Veículo e Saúde.
- Adicionado `@react-native-community/netinfo@11.3.1` e o hook orientado a eventos `src/network/useNetworkStatus.ts`; sem timer de polling e sem alteração do ciclo OBD.
- Criado `src/network/networkStatus.ts` com apresentação testável para Wi-Fi, dados móveis 2G/3G/4G/5G, internet não confirmada, falta de internet, sinal Wi-Fi e informação de tarifação quando fornecidos pelo sistema.
- Adicionada a tela `app/conectividade.tsx` e atalhos no cockpit e em Mais Recursos. A tela explica que leituras OBD, testes, histórico e IA local não dependem da internet; recursos ainda não implementados são identificados como próximos passos.
- Preservados Bluetooth Classic/ELM327, fila serial única, cinco leituras válidas nos testes, consulta manual de PIDs, histórico local e regras offline.

### Testes e contrato
- Adicionado `tests/connectivity.test.js` para 5G, 4G sem internet, Wi-Fi, offline e estado desconhecido.
- Conectada a suíte ao `npm test` e ao gate de anti-regressão; incluída a tela de conectividade no teste de tema e registrados RG-12/RG-13.
- Atualizado o lockfile para corresponder ao `package.json`, mantendo o Expo SDK 51. A primeira CI detectou ausência de `expo-font` como dependência direta e recomendou NetInfo `11.3.1` para SDK 51; ambos foram corrigidos conforme o resultado do `expo-doctor` antes da nova CI.

### Commit, CI e limites
- Atualizações preparadas na branch `fix/cockpit-flicker-restore-buttons-20261020`; após a publicação, conferir o SHA e a CI real da nova cabeça.
- Não considerar a entrega concluída até `gate:baseline`, `validate` e `android-build` passarem.
- A geração 4G/5G depende dos dados que o Android fornece; caso ausentes, o app mostra “MÓVEL”/“Geração não informada”.
- Instalar e conferir o APK em retrato/paisagem, Wi-Fi, dados móveis e modo avião; validar fisicamente ELM327/ECU separadamente.


## DB-085 · 2026-10-21 — Atualização manual da rede e validação do sinal informado pelo Android

### Problema
A página de conectividade apresentava o estado recebido por eventos do sistema, mas não oferecia uma ação explícita para reconsultá-lo quando a geração móvel ou o acesso à internet apareciam como não confirmados. Além disso, o normalizador aceitava qualquer número finito como força de sinal Wi-Fi.

### Correção
- Adicionada a ação acessível “VERIFICAR REDE NOVAMENTE”, usando `NetInfo.refresh()`; o botão indica a verificação em andamento e informa falha sem bloquear a tela.
- O monitoramento continua orientado a eventos. A atualização não inicia polling periódico e não chama nem reinicia Bluetooth, ELM327, GPS ou motor diagnóstico.
- O sinal Wi-Fi só é aceito como válido quando o Android informa número finito entre 0 e 100; valores negativos ou acima de 100 viram desconhecidos, não percentuais falsos.
- Atualizados os testes de conectividade e o contrato RG-14.

### Validação e limites
- A CI verde do SHA anterior `047ec91a29be943e9fce40d2a9f4b6e0644bdc30` é somente a linha de base; esta alteração precisa de nova CI.
- Verificar `gate:baseline`, `validate` e `android-build` na cabeça nova. A CI não substitui o teste do APK em Wi-Fi, 4G/5G e modo avião.

### Próximo passo
Conferir os jobs da CI do novo SHA; depois, testar a ação de atualização e confirmar que a conexão OBD permanece estável ao alternar entre a página de conectividade e o cockpit.


## DB-086 · 2026-10-21 — Cockpit: informações de rede/clima legíveis e botões com áreas de toque ampliadas

### Problema e evidência visual
- Nas capturas Android recebidas, cidade, temperatura e condição meteorológica eram renderizadas em uma linha com fonte de 8 dp; o atalho de rede usava ícone de 13 dp e texto de 8 dp. Isso reduzia a legibilidade das informações ambientais e da rede.
- O cockpit usava `justifyContent: 'space-between'` em um contêiner flexível com vários blocos. O espaço livre era distribuído entre cada bloco, criando uma lacuna desproporcional entre cabeçalho/rede e o painel OBD.
- Os atalhos inferiores já tinham rótulos de acessibilidade e altura mínima de 48 dp, mas ícones de 22 dp e ausência de dicas de ação. As três ações principais também não declaravam explicitamente papel/rótulo acessível.

### Correções preparadas no código
- `app/index.tsx`: agrupado cabeçalho + informações ambientais/rede; cidade, temperatura e condição têm tamanhos maiores, com o nome da cidade podendo ocupar até duas linhas no retrato e uma linha na paisagem; o cartão ambiental mantém valores `N/D`/opcional quando não houver observação válida.
- O selo de rede reserva espaço maior e direciona para a página de conectividade existente. Um segundo nível de texto diferencia INTERNET OK, SEM INTERNET, OFFLINE e VERIFICANDO a partir do estado já informado pelo Android; a página detalhada continua exibindo os estados completos.
- O contêiner do cockpit deixou de distribuir todas as secções com `space-between`; o espaço flexível foi concentrado abaixo das ações principais, mantendo a navegação no fim sem abrir grandes lacunas entre cabeçalho, rede e painel OBD.
- As três ações principais receberam papel, nome e dica de acessibilidade explícitos, altura mínima de 54 dp e área de toque preservada. Os atalhos inferiores permanecem **somente com ícones**, conforme o contrato anterior, com ícones de 25 dp, alvo mínimo de 56 dp, feedback de toque e dicas para leitores de tela.
- `src/ui/NetworkStatusIndicator.tsx`: aumentada a geração/rede para 12 dp e acrescentada segunda linha compacta que informa a disponibilidade da internet.
- `tests/cockpitNavigation.test.js`: adicionadas regressões para hierarquia tipográfica da cidade/temperatura/condição, estado de internet, dimensões dos botões, dicas de acessibilidade e prevenção da distribuição vertical que criava lacunas.
- `docs/CONTRATO_ANTI_REGRESSAO.md`: novo RG-15 protege legibilidade da rede/clima e áreas de toque sem acoplar a conectividade à ECU.
- Nenhuma dependência nova, permissão, consulta OBD ou mecanismo de polling foi adicionado. O fluxo de rede continua informativo e não comanda a conexão Bluetooth/ELM327.

### Commit, CI e limites
- Esta atualização foi preparada no branch `fix/cockpit-flicker-restore-buttons-20261020`, dentro da PR #75, que continua aberta e não mesclada.
- O hash do commit e a execução da CI serão registrados após a publicação e a consulta real do GitHub Actions; neste momento, TypeScript, testes, `gate:baseline` e `android-build` ainda não foram declarados aprovados para estas mudanças.
- A CI anterior verde valida apenas seu próprio SHA; não substitui a execução desta alteração.
- A inspeção das capturas fundamenta os problemas de legibilidade/espaçamento, mas a aparência final ainda exige instalação do APK e conferência no Android em retrato e paisagem, incluindo os toques reais dos três ícones inferiores.

### Próximo passo
Publicar uma alteração atômica de código + regressões + contrato + diário; consultar a CI do SHA exato. Corrigir qualquer falha pelo log e não fazer merge sem autorização explícita.


## DB-087 · 2026-10-21 — Ajuste adicional de legibilidade da rede e tamanho dos botões principais

### Problema observado
A revisão da implementação DB-086 confirmou que o tipo de rede e o ícone foram ampliados, mas a linha secundária de disponibilidade da internet ainda usava fonte de 8 dp. Os botões principais tinham altura mínima de 54 dp e rótulo de 10 dp, deixando margem para melhorar leitura e toque sem recriar o espaçamento irregular.

### Correção implementada
- `src/ui/NetworkStatusIndicator.tsx`: ícone de rede ampliado de 18 para 20 dp, rótulo Wi-Fi/geração móvel de 12 para 13 dp e estado resumido da internet de 8 para 10 dp.
- `app/index.tsx`: cartão de rede ampliado (64 dp de altura mínima) com dimensões compactas específicas para paisagem; botões principais agora têm altura mínima de 56 dp e texto de 11 dp.
- `tests/cockpitNavigation.test.js`: protege os novos limites de tipografia, ícone e área dos botões nos dois modos de orientação.
- `docs/CONTRATO_ANTI_REGRESSAO.md`: RG-15 passa a registrar os tamanhos mínimos e sua cobertura automatizada.
- Sem novas dependências ou mudanças nas funções OBD, conexão Bluetooth, regras diagnósticas, consultas manuais, número de leituras dos testes ou fluxo offline.

### Verificação e limites
- Alterações escritas sequencialmente na branch `fix/cockpit-flicker-restore-buttons-20261020`; o SHA final e a execução de CI devem ser consultados no GitHub.
- Não declarar validação local: este ambiente não tem acesso de rede para executar clone/instalação do repositório.
- A CI precisa concluir `gate:baseline`, `validate` e `android-build` no SHA final antes de declarar a etapa automatizada aprovada.
- Teste no aparelho Android segue separado: legibilidade real em 360 dp, orientação paisagem, TalkBack e funcionamento dos botões; a conectividade não pode interferir na sessão ELM327.

### Próximo passo
Conferir o SHA final e a CI da PR #75; corrigir qualquer falha indicada pelos logs. Não mesclar sem autorização explícita.


## DB-088 · 2026-10-21 — Auditoria contra regressões, reconciliação das PRs fechadas e CI do conjunto combinado

### Problema
Os botões principais ainda foram reportados visualmente como texto sem aparência de botão e havia histórico recente de oscilação da conexão Bluetooth/ECU. O estado de PRs/CI precisava ser reconciliado antes de afirmar que as correções estavam no aplicativo principal.

### Diagnóstico baseado no GitHub
- O `main` consultado estava no commit `78b9ca71344ce3d100ad949c09f290b328f01eaa`, com correção de lifecycle Bluetooth já incorporada.
- PR #74 (`a9668cf7d3759dfcaf1ef95ccf9f7684fb13ac03`) e PR #75 (`bd2e725a45fb2dce633377c1527bb0b389f86d5b`) estavam fechadas sem merge. A CI #2568 do head da PR #74 terminou com sucesso, mas isso não valida automaticamente o conjunto da PR #75 nem o seu merge em `main`.
- Na branch de cockpit, a tela inicial usa dependências individuais das opções OBD no efeito de conexão, em vez do objeto `settings` inteiro; isso protege contra reinício da conexão quando o estado de configurações é recarregado como novo objeto.
- O contrato anti-regressão e o gate executável protegem cinco leituras por PID, consulta manual/lista de PIDs, fila ELM327 serial, dono único da conexão inicial, funcionamento offline, GPS/viagens, histórico, tema, navegação em ambas as orientações e legibilidade/acessibilidade dos botões.

### Ação desta rodada
- Criada a branch `audit/anti-regression-ci-20261021` sobre a cabeça da branch de cockpit, incluindo o conjunto funcional de cinco leituras/consulta manual e as correções de cockpit, navegação e conectividade.
- Atualizado este diário para registrar o estado real das PRs e o resultado da auditoria, sem declarar uma CI ainda não executada.
- Será aberta uma PR de auditoria contra `main` para disparar a CI automática sobre o conjunto combinado. Não será feito merge sem autorização explícita.

### Critérios de aceitação
1. `gate:baseline` aprovado.
2. `validate` aprovado, incluindo TypeScript e a suíte completa.
3. `android-build` aprovado e APK standalone verificado.
4. Revisar os logs de cada job se algum falhar; não reduzir testes nem alterar regras funcionais para mascarar falha.
5. Depois da CI, validar no aparelho a renderização real dos três botões em retrato/paisagem e testar o ELM327 com o veículo parado. CI verde não comprova o teste físico.

### Limitações atuais
A inspeção estática confirma os contratos e a diferença entre branches, mas não comprova por si só o comportamento visual em um aparelho nem a estabilidade física da conexão Bluetooth/ECU. A rodada permanece pendente até a CI da nova PR terminar.


## DB-089 · 2026-10-21 — Rotação automática da tela

### Problema
O usuário pediu que a interface acompanhe a rotação física do aparelho, mantendo o layout adaptável sem regressões na conexão Bluetooth/ECU.

### Diagnóstico
- `app.json` já declara `expo.orientation: "default"`, e o layout responsivo usa `useWindowDimensions()` via `useMidLayout()`.
- A biblioteca oficial `expo-screen-orientation` tem versão compatível com Expo SDK 51: `~7.0.5`. O uso de `unlockAsync()` restaura a política `DEFAULT`, evitando que uma trava de orientação deixada pela navegação impeça retrato/paisagem.
- A documentação do Expo informa que `OrientationLock.DEFAULT` deixa o Android decidir a orientação; portanto, o bloqueio global de rotação do próprio Android ainda pode impedir a mudança física.

### Correção
- Adicionada `expo-screen-orientation@~7.0.5` ao `package.json` e ao `package-lock.json`.
- O layout raiz chama `ScreenOrientation.unlockAsync()` na inicialização e registra listener de orientação com cleanup.
- Mantida a lógica responsiva centralizada existente (`useWindowDimensions()` / `useMidLayout()`); não foram adicionados bloqueios de retrato ou paisagem nem alterada a lógica OBD/Bluetooth.
- O teste `tests/orientationLayout.test.js` agora protege a dependência, a liberação da orientação padrão e a limpeza do listener.

### Testes / CI
- Alteração preparada na branch `audit/anti-regression-ci-20261021`, dentro da PR #76.
- A CI deve validar `gate:baseline`, `validate` e `android-build`. Nenhum resultado é declarado antes de os jobs terminarem.
- O comportamento físico deve ser confirmado no aparelho com **Rotação automática** ativada nas configurações rápidas do Android.

### Próximo passo
Aguardar a CI da PR #76 após as últimas alterações; corrigir qualquer falha real de instalação, TypeScript, testes ou build antes de considerar a alteração pronta.

## DB-090 · 2026-10-22 — Correção da autonomia, conexão explícita e navegação única

### Problemas corrigidos
- O cockpit podia apresentar autonomia persistida como se fosse atual mesmo com ECU desconectada.
- A fórmula persistida multiplicava o consumo médio pela capacidade total do tanque, em vez de considerar o nível real lido pelo PID 012F.
- O valor de temperatura `N/D` recebia a cor verde, apesar de não existir leitura válida.
- O cartão de clima podia promover o bairro a nome de cidade quando o município não era retornado no primeiro campo do geocodificador.
- A tela tinha uma fileira de atalhos (Diagnóstico, Dados, Viagens) além da navegação inferior, duplicando destinos na versão exibida pelo usuário.
- O rótulo genérico `OFFLINE` não identificava se a ECU, o Bluetooth ou a internet estava indisponível.
- A barra inferior nativa do Android usava cores desalinhadas com o cockpit escuro.

### Alterações preparadas
- `src/trip/autonomyPresentation.ts`: função pura que só expõe autonomia atual quando há sessão ECU válida, suporte e amostra válida de nível de combustível; usa o consumo da viagem quando válido e a média histórica como fallback.
- `src/trip/autoTripService.ts`: cálculo e persistência da autonomia passaram a considerar o percentual real de combustível; sem nível válido, a estimativa atual fica indisponível em vez de reutilizar silenciosamente a autonomia antiga ou presumir tanque cheio.
- `app/index.tsx`: `N/D` da temperatura agora é neutro; a autonomia do cockpit vem da sessão ativa; estados `ECU CONECTADA`, `ECU SEM RESPOSTA`, `BLUETOOTH ATIVO`, `CONECTANDO ELM327` e `ECU DESCONECTADA` são separados; a barra principal passou a ter cinco destinos rotulados; os atalhos duplicados foram substituídos por um cartão de conexão acionável; a barra de status superior usa ícones claros no tema escuro.
- `app.json` e `package.json`: configurado `expo-navigation-bar@~3.0.7` (SDK 51) para a barra nativa inferior escura, com botões claros; `package-lock.json` sincronizado.
- `src/weather/currentConditions.ts`: ao resolver o nome mostrado, prioriza município (`city`/`subregion`) e não transforma bairro ou estado em cidade.
- `tests/autonomyPresentation.test.js` e regressões em `tests/onlineConditions.test.js`, `tests/cockpitNavigation.test.js`, `tests/orientationLayout.test.js`, `tests/screenTheme.test.js` e `tests/projectBaseline.test.js`; o novo teste foi conectado a `npm test`.
- `docs/CONTRATO_ANTI_REGRESSAO.md`: RG-15 atualizado para navegação única e RG-16 adicionado para autonomia e estados sem leitura.

### Verificação e limites
- Alterações agrupadas na branch `fix/cockpit-live-autonomy-20261022`, sem merge em `main`.
- O código, as configurações Expo e as expectativas dos testes foram revisados estaticamente. **TypeScript, suíte completa e APK ainda não foram executados neste ambiente**, portanto não declarar os resultados como aprovados antes da CI.
- O workflow padrão fica temporariamente restrito a `workflow_dispatch` nesta branch durante a montagem das mudanças; `main` permanece inalterada. Os gatilhos normais só serão restaurados depois da revisão estática completa do conjunto.
- O teste físico no Android ainda é necessário para confirmar contraste real da barra nativa inferior, rótulos da navegação em retrato/paisagem e conexão com ELM327/ECU.

### Próximo passo
Concluir a revisão final do conjunto e restaurar os gatilhos da CI para executar `gate:baseline`, TypeScript, suíte de regressão e build Android no SHA exato. Não fazer merge sem autorização explícita.

## DB-091 · 2026-10-22 — Compatibilidade da barra nativa com Expo Doctor

### Evidência da CI
- A primeira execução do PR `#78` instalou as dependências com sucesso, mas `npm run doctor` falhou porque `expo-navigation-bar@3.0.4` não atendia à versão exigida pelo Expo SDK 51 (`~3.0.7`).
- A falha ocorreu antes do gate de baseline e antes de `npm run validate`; portanto, aqueles passos ainda não têm resultado nessa execução.

### Correção
- `package.json` e `package-lock.json` foram alinhados para `expo-navigation-bar@~3.0.7`.
- `tests/projectBaseline.test.js` foi atualizado para proteger a versão exigida pelo Expo Doctor.
- A configuração nativa de fundo escuro e botões claros foi preservada.

### Estado
- Correção enviada à branch `fix/cockpit-live-autonomy-20261022` para nova execução da CI.
- Não fazer merge enquanto a nova execução não verificar Expo Doctor, gate de baseline, TypeScript e suíte de regressão.

## DB-092 · 2026-10-22 — Restauração da splash screen e falha de cobertura antirregressão

### Evidência
- O usuário reportou que a splash screen desapareceu.
- `app.json` não continha configuração `expo.splash`.
- `package.json` não declarava `expo-splash-screen`, embora o `package-lock.json` ainda contivesse a versão `0.27.7`.
- A auditoria `docs/AUDITORIA_2026-10-02.md` registrava explicitamente a remoção do Expo Splash Screen por ser considerado sem uso.
- `tests/projectBaseline.test.js` não protegia a dependência nem a configuração de splash; portanto, o gate podia passar sem detectar a regressão. A regra antirregressão estava incompleta, não era uma garantia de comportamento.

### Correção preparada
- Reintroduzido `expo-splash-screen@~0.27.7` em `package.json` e no conjunto de dependências raiz do lockfile.
- Restaurada em `app.json` a configuração de splash nativa com fundo `#07111f` e `resizeMode: contain`, coerente com o tema escuro.
- Adicionadas asserções ao `tests/projectBaseline.test.js` para a dependência, versão do lockfile e configuração de fundo.
- Adicionado RG-18 a `docs/CONTRATO_ANTI_REGRESSAO.md` para impedir nova remoção silenciosa.

### Limites de validação
- Não foi confirmado um arquivo de imagem de splash existente no repositório durante esta inspeção; por isso, esta correção restaura a configuração/fundo nativo, mas não afirma que o logotipo ilustrado foi restaurado.
- A correção precisa passar pelo gate, Expo Doctor, suíte completa e build Android da CI antes de ser considerada validada.
- Sem merge automático: manter a correção isolada na branch/PR até todos os jobs passarem e o usuário autorizar integração.

### Lição de processo
Uma anotação de auditoria que remove uma funcionalidade visível precisa de evidência de que ela é realmente redundante e de uma atualização explícita do contrato de regressão. A ausência de teste não é prova de ausência de uso.

## DB-093 · 2026-10-22 — Reconciliação da documentação após regressão da splash

### Objetivo
Sincronizar a documentação de entrada, arquitetura, desenvolvimento, contribuição, changelog, auditorias históricas e contrato antirregressão com a correção preparada em DB-092, sem apagar decisões antigas nem declarar validação não comprovada.

### Arquivos atualizados neste lote
- `README.md`: documenta a configuração atual de splash, a dependência necessária e a distinção entre configuração nativa e asset visual confirmado.
- `CHANGELOG.md`: adiciona a seção Unreleased com as mudanças da splash e o estado de validação pendente.
- `CONTRIBUTING.md`: define a documentação sincronizada e a exigência de evidência por SHA para alterações de dependências/identidade visual.
- `docs/ARCHITECTURE.md`: descreve a splash nativa e a diferença entre configuração, asset e tela React Native.
- `docs/DEVELOPMENT.md`: inclui o procedimento de validação da splash no build e em aparelho Android.
- `docs/CONTRATO_ANTI_REGRESSAO.md`: fortalece RG-18 e adiciona RG-19 para consistência documental e alegações baseadas em evidência.
- `docs/AUDITORIA_2026-10-02.md`, `docs/AUDITORIA_FASE0.md`, `docs/AUDITORIA_TECNICA_2026-10-03.md`: preservam os achados históricos, mas adicionam notas datadas para evitar que declarações antigas sobre splash/lockfile sejam confundidas com o estado atual.
- Este diário: registra o lote e suas limitações.

### Estado técnico documentado
- `expo-splash-screen@~0.27.7` está declarado em `package.json` e alinhado com a dependência raiz/versão do `package-lock.json`.
- `app.json` define `expo.splash.backgroundColor = #07111f` e `resizeMode = contain`.
- A configuração não prova que um asset de logotipo exista ou esteja embutido no APK; essa inspeção continua pendente.
- O workflow configurado executa `npm ci`, Expo Doctor, gate de baseline, TypeScript/testes e build Android release. Não se deve afirmar que esses passos passaram no SHA final sem consultar a execução correspondente.

### Verificações realizadas nesta atualização
- Arquivos recuperados diretamente da branch `fix/cockpit-live-autonomy-20261022` antes da edição.
- Alterações documentais preparadas como um lote único para evitar commits parciais que disparem CI antes da revisão completa.
- Ainda é necessário confirmar o SHA do commit documental, revisar o diff consolidado e verificar os resultados de CI somente depois de o lote estar completo.

### Critérios de encerramento
1. Confirmar que todas as 10 páginas listadas acima estão no mesmo commit.
2. Rever diff para garantir que auditorias históricas foram anotadas, não reescritas como se os achados nunca tivessem existido.
3. Executar/consultar gate, suíte, Expo Doctor e build Android para o SHA final, sem declarar aprovação antecipada.
4. Conferir o asset de splash e a inicialização fria em APK instalado; se o asset estiver ausente, corrigir o recurso visual separadamente.
5. Não fazer merge sem autorização explícita.


## DB-094 · 2026-10-22 — Plano de aceitação para o lote de confiabilidade e UX

### Objetivo
Transformar as prioridades do relatório analítico em critérios verificáveis e separar funcionalidade existente, trabalho proposto e validação física. Este registro não declara novas funcionalidades de produto como concluídas.

### Alterações deste lote
- `docs/TEST_PLAN.md`: criado plano de regressão com cenários críticos de OBD/ECU, frescor dos dados, autonomia, conectividade offline, navegação, DTC, splash, build e critérios de recursos futuros.
- `docs/CONTRATO_ANTI_REGRESSAO.md`: adicionado RG-20 para exigir cobertura rastreável e distinguir CI/build de teste físico.
- `tests/projectBaseline.test.js`: protege a existência do plano e seus cenários centrais para que a documentação de aceitação não desapareça silenciosamente.
- `CHANGELOG.md`: registra o plano de testes e a próxima etapa de validação.

### Limites e estado
- A PR #78 já contém correções de cockpit/navegação, apresentação de autonomia, temperatura indisponível e estados de conexão, com testes associados.
- O plano documenta casos de teste existentes e pendentes; não afirma que Detox/Appium, lembretes de manutenção, mapas, OTA, analytics, login ou sincronização em nuvem estejam implementados.
- O modo oficina avançado e a sincronização em nuvem/perfis permanecem fora do escopo autorizado.
- Nenhuma CI nova foi disparada durante a preparação do conteúdo. Após o commit consolidado, a CI pode iniciar automaticamente conforme os gatilhos do repositório; os resultados precisam ser consultados para o SHA final.

### Critérios de encerramento
1. Conferir o diff consolidado e o RG-20.
2. Verificar o gate, TypeScript, suíte e build Android na CI do SHA atualizado.
3. Confirmar splash e navegação visualmente em aparelho Android.
4. Testar ELM327/ECU reais separadamente; CI verde não equivale a validação física.
5. Não fazer merge sem autorização explícita.


## DB-095 · 2026-10-22 — Expiração de nível de combustível antigo na autonomia atual

### Achado funcional
- `AutoTripService` mantinha o percentual do PID 012F sem registrar a hora da última resposta válida. Se consultas subsequentes falhassem enquanto a sessão continuasse ativa, o cockpit podia calcular autonomia com evidência antiga.
- O helper da autonomia verificava conexão/suporte/faixa, mas não a idade da amostra. A regra documental de não reutilizar dados vencidos não estava totalmente implementada para nível do tanque.

### Correção aplicada
- `src/trip/autoTripService.ts`: registra o timestamp em memória quando o PID 012F retorna um percentual válido; invalida percentual/timestamp após 30 s, limpa a evidência ao perder a resposta da ECU e impede a persistência de autonomia baseada em nível vencido.
- `src/trip/autonomyPresentation.ts`: centraliza o limite de frescor de 30 s e rejeita timestamp ausente, inválido, futuro ou vencido.
- `app/index.tsx`: fornece o timestamp da amostra atual ao cálculo da autonomia do cockpit.
- `tests/autonomyPresentation.test.js`: adicionados testes para o limite exato de 30 s, amostra vencida (>30 s), timestamp ausente/inválido e timestamp futuro.
- `tests/projectBaseline.test.js`, `docs/TEST_PLAN.md`, `docs/CONTRATO_ANTI_REGRESSAO.md` e `CHANGELOG.md`: o contrato de frescor passa a ser explícito e protegido.

### Limites e validação
- Nenhuma dependência foi adicionada; a API, o transporte Bluetooth/ELM327 e o protocolo OBD não foram alterados.
- O timestamp é runtime-only e não transforma dados persistidos em dados atuais. A ausência de uma nova leitura após 30 s resulta em `N/D`/autonomia indisponível.
- A CI ainda deve ser conferida no SHA consolidado depois da atualização da branch. APK/build não substitui teste físico com ELM327/ECU. A splash continua pendente de asset visual nativo confirmado.
- Nenhum merge automático; modo oficina avançado e sincronização em nuvem/perfis seguem fora do escopo.


## DB-096 · 2026-10-22 — Fechar outros caminhos de exibição da autonomia persistida

### Achado complementar
- Após DB-095, o cockpit principal rejeitava nível vencido, mas a API `autoTripService.getState()` ainda retornava `estimatedRangeKm` persistido antes de uma nova leitura 012F; telas como Laboratório e Dados podiam receber uma autonomia histórica como se fosse atual.
- A tela `app/dados.tsx` mostrava diretamente `state.autonomy.estimatedRangeKm` sob o título “DADOS EM TEMPO REAL”, misturando um snapshot persistido com métricas atuais.

### Correção aplicada
- `getState()`, `subscribe()` e notificações internas passam a expor estado sanitizado: se a ECU não responde, não existe sessão válida ou a amostra de combustível tem mais de 30 s, o nível atual e a autonomia pública são indisponíveis.
- O estado de autonomia do serviço começa em zero quando o app inicia ou abre uma nova sessão ECU; a média histórica continua disponível apenas como contexto de consumo, não como nível atual do tanque.
- `app/dados.tsx` passa a usar `trip.estimatedRangeKm`, vindo do serviço com filtro de frescor, em vez de usar `state.autonomy.estimatedRangeKm` diretamente.
- `tests/projectBaseline.test.js` impede regressão nesses caminhos de estado público e tela em tempo real.

### Validação
- Alteração adicional de revisão funcional; nenhuma dependência ou protocolo alterado.
- A CI #2841 está associada ao commit anterior de frescor DB-095, não valida esta alteração complementar. A atualização desta branch poderá iniciar automaticamente uma nova execução; conferir o resultado correspondente ao SHA mais recente.
- Teste físico ELM327/ECU e inspeção visual da splash continuam pendentes. Sem merge; modo oficina avançado e sincronização em nuvem/perfis permanecem fora do escopo.


## DB-097 · 2026-10-22 — Rejeitar timestamps inválidos/futuros na telemetria ao vivo

### Achado funcional
- `getVehicleConditionSnapshot()` tratava qualquer timestamp que fosse no máximo 10 s no passado como atual, sem exigir idade não negativa. Uma amostra marcada no futuro poderia entrar no contexto de motor/veículo.
- `getLivePidTrend()` também convertia idade negativa em zero, permitindo que timestamp futuro fosse mostrado como leitura recém-recebida, e `recordLivePidReading()` aceitava timestamps inválidos.

### Correção aplicada
- `src/obd/liveTelemetry.ts`: timestamps ISO inválidos/futuros são rejeitados na entrada; tendência e contexto operacional calculam idade usando o mesmo instante de referência e exigem idade entre 0 e 10 s para classificar o estado atual.
- `tests/liveTelemetry.test.js`: adiciona regressão para timestamps futuros e inválidos, assegurando ausência de tendência/contexto fabricado.
- `tests/projectBaseline.test.js`, `docs/TEST_PLAN.md`, `docs/CONTRATO_ANTI_REGRESSAO.md` e `CHANGELOG.md` foram atualizados para registrar a regra.

### Validação
- Mudança sem nova dependência e sem alterar consulta OBD, fila Bluetooth ou origem das amostras.
- Testes automatizados e build Android da cabeça mais recente devem ser confirmados na CI automática; sem merge e sem declaração de teste físico ELM327/ECU.


## DB-098 · 2026-10-22 — DTC: distinguir ausência de códigos de falha de leitura

### Achado funcional
- `readCurrentDtcs()` interpretava uma resposta sem códigos parseáveis como “NENHUM DTC RETORNADO” sem verificar `ElmCommandResult.status` nem confirmar um quadro positivo completo. `NO DATA`/timeout ou resposta malformada podia ser confundida com ausência de falhas.
- `scanDtcServices()` classificava a string `NO DATA` como serviço disponível porque ela era aceita como sinônimo de “no codes”; isso também poderia marcar códigos previamente salvos como inativos sem evidência válida.

### Correção aplicada
- `src/obd/dtcParser.ts`: acrescentada validação de resposta por serviço, aceitando quadro positivo completo ou mensagem explícita de ausência de códigos; rejeita `NO DATA`, erro e quadro truncado.
- `src/obd/dtcScanner.ts`: serviço só é marcado disponível com status `OK` e resposta válida.
- `app/laboratorio.tsx`: leitura direta Mode 03 preserva RX/tempo para diagnóstico, mas interrompe a interpretação de códigos quando status/resposta não são válidos; erro não limpa nem inativa histórico.
- `tests/dtcScanner.test.js`: cenários positivos, nenhum DTC explícito, `NO DATA`, ausência de cabeçalho e resposta truncada.
- `tests/projectBaseline.test.js`, `docs/TEST_PLAN.md`, `docs/CONTRATO_ANTI_REGRESSAO.md` e `CHANGELOG.md` atualizados; RG-21 registra o contrato.

### Limites e validação
- Nenhuma dependência ou comando de limpeza de DTC foi adicionado. O lote só altera classificação da leitura.
- A CI do SHA final precisa concluir `validate` e `android-build`. O teste físico de ECU/ELM327 continua pendente; sem merge.


## DB-099 · 2026-10-22 — Pendências de splash screen e rodada de estabilização

### Objetivo
Consolidar as pendências da auditoria e iniciar a validação com critérios verificáveis, sem presumir que a CI de um commit anterior valide mudanças posteriores.

### Estado verificado antes desta entrada
- Branch consultada: `fix/cockpit-live-autonomy-20261022`.
- `app.json` contém a configuração de splash com fundo `#07111f` e `resizeMode: contain`, mas essa configuração, sozinha, não comprova a presença do logotipo no APK.
- O workflow `.github/workflows/ci.yml` é acionado em push para branches e executa `npm ci`, Expo Doctor, `gate:baseline`, `npm run validate` e build APK Android.
- O SHA atual da branch e a presença de asset visual de splash ainda precisam ser confirmados nesta rodada; não declarar a CI anterior como validação do estado atual.

### Pendências prioritárias
1. Inspecionar assets existentes e confirmar se a splash visual está referenciada e empacotada no Android; validar cold start em aparelho.
2. Confirmar HEAD da branch e vincular todos os resultados de teste ao mesmo SHA candidato.
3. Executar CI completa: baseline antirregressão, TypeScript/suíte de testes, Expo Doctor, prebuild e APK standalone.
4. Preservar Bluetooth Classic, fila serial compartilhada, distinção entre adaptador conectado e ECU respondendo, consulta manual de PID, cinco leituras válidas, separação entre dados reais e simulados, GPS, viagens, telemetria e histórico.
5. Revisar navegação Diagnóstico/Dados/Viagem, legibilidade e orientação sem remover funcionalidades.
6. Testar ELM327/ECU fisicamente e registrar esse resultado separadamente da CI.
7. Atualizar changelog, plano de testes e contrato antirregressão conforme as alterações efetivamente verificadas.

### Sequência de execução
- Confirmar branch e SHA.
- Inspecionar assets antes de criar, substituir ou renomear arquivos.
- Corrigir a integração da splash sem alterar o fluxo de inicialização além do necessário.
- Implementar alterações pequenas e rastreáveis; rodar validações no mesmo commit final.
- Registrar falhas, evidências, artefatos e testes físicos pendentes.

### Restrições e critério de conclusão
- Não remover funcionalidades existentes para contornar falhas.
- Não marcar testes como aprovados sem evidências.
- Não fazer merge sem validação final e autorização explícita.
- Modo oficina avançado e sincronização em nuvem/perfis permanecem fora do escopo.
- Esta entrada permanece em andamento até a CI da cabeça final estar concluída e os testes físicos serem identificados como aprovados ou pendentes.


## DB-100 · 2026-10-23 — Implementar asset visual e configuração explícita da splash nativa

### Causa confirmada
- A branch não continha pasta `assets/`; `app.json` configurava apenas a cor de fundo e o modo de escala, sem apontar para uma imagem.
- A dependência `expo-splash-screen@~0.27.7` já existia, mas isso, isoladamente, não cria um logotipo para o launch screen.

### Alterações preparadas neste commit
- Adicionado `assets/splash.png`, PNG transparente de 512×512 com marca MERIVA SMART, contraste ciano/branco e fundo compatível com `#07111f`.
- Configurado explicitamente o plugin `expo-splash-screen` com o asset versionado, largura de 280 dp, `resizeMode: contain` e o fundo escuro.
- Mantida a configuração legada `expo.splash` usando o mesmo PNG.
- Ampliado `tests/projectBaseline.test.js` para verificar o plugin, o caminho, a dimensão configurada e a assinatura real do PNG; a configuração não pode mais passar sem um asset existente.
- Atualizados `CHANGELOG.md`, `README.md`, arquitetura, desenvolvimento, contribuição, plano de testes e contrato antirregressão para refletir a correção.

### Preservação e validação
- Não foram alterados layout de navegação, Bluetooth Classic, fila serial, consulta OBD, diagnóstico, GPS, viagens ou persistência.
- O baseline está reforçado no código; o resultado real de `gate:baseline`, TypeScript, testes, Expo Doctor e build Android depende da CI do novo SHA e será registrado após consulta.
- A aceitação visual ainda exige instalar o APK de release e conferir a inicialização fria em aparelho Android. CI verde, por si só, não comprova o resultado visual no dispositivo.
- Nenhum merge executado; modo oficina avançado e sincronização em nuvem/perfis continuam fora do escopo.


## DB-101 · 2026-10-23 — Splash operacional, conexão automática e identidade Smart OBD

### Implementação
- Adicionada a rota inicial `app/splash.tsx` com identidade Smart OBD Diagnostic e estados visíveis de conexão.
- A splash tenta conectar automaticamente ao ELM327 entre dispositivos Bluetooth Classic pareados, valida uma resposta real da ECU e repete tentativas com backoff limitado até conectar ou a tela ser desmontada.
- Após validar a ECU, consulta cada PID anunciado cinco vezes pela fila serial da sessão antes de navegar ao cockpit. Falhas de PID não são convertidas em valores numéricos nem interrompem o restante do aquecimento.
- O cockpit agora usa o nome Smart OBD Diagnostic e os cinco destinos inferiores ficam em modo somente ícone, preservando rótulos de acessibilidade.
- Nome, slug e scheme Expo atualizados para Smart OBD Diagnostic; o identificador Android permanece estável para não quebrar instalações existentes.
- O gate antirregressão agora exige a splash operacional, as cinco consultas por PID e o início de navegação pelo fluxo de splash.

### Referências técnicas aplicadas
- Painel ao vivo, DTC, viagens, logs e instrumentos configuráveis são padrões comuns em Car Scanner ELM OBD2, Torque Pro e OBDLink.
- A aquisição segue a lista de PIDs descoberta da ECU; PIDs padrão não são assumidos como universalmente suportados.
- Ícones mantêm o sistema vetorial existente `@expo/vector-icons`; não foram copiados assets de terceiros com licenciamento incerto.

### Limites e riscos controlados
- A descoberta disponível é de dispositivos pareados Bluetooth Classic; Android não permite conectar arbitrariamente a dispositivos não pareados sem o fluxo de pareamento do sistema.
- A splash exige permissões de Bluetooth/localização já tratadas pelo fluxo de permissões Android; nenhuma autenticação de conta foi adicionada.
- O aquecimento executa cinco consultas por PID suportado e pode demorar conforme a quantidade de PIDs e a latência K-Line/ELM327.
- Não alterados parser OBD, fila serial, regras de confiança dos dados, persistência de viagens ou cálculos de combustível.
- A CI do novo SHA precisa validar TypeScript, baseline, suíte completa e APK Android. A aceitação final também exige teste físico com ELM327 e ECU reais.
- Nenhum merge executado.


## DB-102 · 2026-10-23 — Desbloquear o acesso ao cockpit quando a ECU está indisponível

### Causa confirmada
- A splash operacional repetia as tentativas indefinidamente sem uma ação visível para entrar no aplicativo; sem ELM327 ou ECU, ficavam inacessíveis o cockpit, as configurações e a conexão manual.
- O fluxo de inicialização não respeitava `autoConnectObd=false`, embora essa preferência já existisse e fosse aplicada pelo cockpit.

### Alterações
- A splash agora pula a conexão automática e abre o cockpit quando `autoConnectObd=false`.
- Após duas tentativas com falha, aparece uma ação acessível para abrir o cockpit sem declarar a ECU conectada; o estado de conexão continua sendo determinado pela validação OBD real.
- Atualizados o gate antirregressão, o plano de aceitação, o README e o changelog para proteger e descrever o comportamento.
- Não foram alterados Bluetooth Classic, a fila serial, o parser, as regras de amostras válidas, dados reais/simulados, GPS, viagens ou armazenamento.

### Verificação pendente no momento do commit
- Duas execuções de CI para o SHA anterior haviam concluído `validate` com sucesso e estavam montando o APK release; a mudança desta entrada gera um novo SHA e exige nova execução completa.
- Não foi possível realizar inspeção física do APK ou validar um ELM327/veículo nesta etapa. Esses testes continuam pendentes e não serão tratados como aprovados por CI.
- Nenhum merge executado.


## DB-103 · 2026-10-23 — Permissões de localização deixam de bloquear diagnóstico OBD

### Causa confirmada
- `app/_layout.tsx` tratava a ausência de permissão de GPS/localização como falha fatal da preparação geral, exibindo alerta e deixando `permissionsChecked` falso. Isso podia bloquear a entrada estável no aplicativo mesmo quando a conexão Bluetooth tinha permissão.
- O contrato anti-regressão já descrevia localização/clima como enriquecimento opcional e exigia que falhas de permissão não interrompessem o diagnóstico.

### Alterações
- Mantida a exigência de permissão Bluetooth para a conexão OBD real; a falta de localização agora gera aviso informativo, sem lançar exceção fatal no layout.
- Adicionada verificação no teste de permissões e tornada a suíte `permissions.test.js` obrigatória no gate de baseline.
- Atualizados plano de aceitação, README e changelog. GPS, clima e percurso continuam dependentes da disponibilidade/permissão correspondente; não passam a produzir dados simulados.

### Validação pendente
- A CI completa precisa ser observada no SHA final deste commit. Nenhum teste físico de GPS/ELM327 foi executado nesta rodada.
- Nenhum merge executado.


## DB-104 · 2026-10-23 — Prioridade de alerta térmico e localização contextual

### Alterações
- Quando a leitura OBD real e recente de temperatura do líquido chega a 110 °C ou mais, o indicador central permanece fixado na temperatura e não pode ser trocado para outro indicador até a temperatura voltar abaixo do limiar. O cartão térmico existente permanece visível.
- O enriquecimento de clima agora conserva rótulos distintos `CIDADE:` e `BAIRRO:` quando ambos são fornecidos pelo geocodificador, e a faixa superior alterna entre eles a cada 10 s. A geolocalização segue condicionada à permissão de primeiro plano já concedida; nenhuma permissão nova ou rastreamento extra foi introduzido.
- Ampliados os testes de geocodificação e de contrato do cockpit; atualizado o plano de aceitação, changelog e README.

### Integridade e limites
- Não foi alterada a cadência de consultas OBD, nem foram aumentadas consultas ao ELM327 para a rotação visual. O limiar térmico reutiliza o mesmo valor real/fresco já usado pelo cockpit.
- A alternância só tem dois estados quando geocodificação retorna cidade e bairro distintos; se faltar bairro, a UI preserva o rótulo disponível. Sem permissão, mostra `CLIMA LOCAL` e não solicita localização.
- CI para este SHA ainda precisa concluir baseline, TypeScript/testes, Expo Doctor e APK Android; não foi executado teste físico de ECU, GPS ou aparência.
- Nenhum merge executado.


## DB-105 · 2026-10-23 — Sincronizar contrato de teste com callback de prioridade térmica

- Revisão do diff do cockpit identificou uma asserção textual antiga que esperava o callback do timer em expressão de uma linha; o código correto passou a usar um bloco para manter a prioridade térmica durante a anomalia.
- A asserção foi ajustada para validar a estrutura real do timer e continuar exigindo que a rotação permaneça protegida por teste. Nenhum comportamento OBD ou limiar foi alterado.
- A CI do SHA atualizado é a evidência decisiva; nenhum resultado de teste é antecipado nesta entrada.


## DB-106 · 2026-10-23 — Manutenção preventiva e diário local de abastecimentos

### Objetivo e escopo
- Adicionada rota `app/manutencao.tsx` acessível pela página Mais Recursos, com layout responsivo e área segura.
- A tela permite salvar a quilometragem atual, registrar data e km da última manutenção, marcar um serviço realizado hoje, alternar plano de uso normal/severo para óleo e registrar abastecimentos (gasolina ou etanol, litros e valor opcional).
- Os lembretes usam as referências já versionadas no manual local do Meriva 2012. Se não houver dados suficientes, o status fica como `CADASTRAR`, nunca como “em dia”. Vencimento por quilometragem ou calendário sinaliza serviço vencido.
- Abastecimentos são persistidos em `MERIVA_SMART/MANUTENCAO/registros.json`, limitados a 100 registros, sem serem convertidos em amostras OBD ou alimentar os cálculos existentes de consumo.

### Testes e limites
- Criado teste de regras puras para intervalos normal/severo, validação de data, limite de mês, vencimento por km/data e histórico ausente; ligado a `npm test` e ao gate de baseline.
- A UI valida litros, custo, data, quilometragem e mantém valores manuais separados do autosave/telemetria OBD.
- Referências do Meriva são lembretes e não se aplicam automaticamente a outro carro sem confirmação do plano. Não foi testado abastecimento físico nem instalado APK nesta etapa; a CI do SHA final ainda precisa concluir inclusive o build standalone.
- Nenhum merge executado.


## DB-107 · 2026-10-23 — Cockpit OBD com até 20 PIDs reais

- **Problema:** painel inicial limitado a quatro métricas fixas; leituras auxiliares restringidas a quatro PIDs rotativos, com N/D durante janelas sem leitura.
- **Causa confirmada:** a tela usava uma lista fixa de quatro métricas e a política de polling só rotacionava quatro PIDs. O caminho serial também precisava evitar repetir um PID quando ele já tivesse sido consultado no mesmo ciclo para consumo ou estimativa.
- **Alterações:** política explícita com 20 PIDs candidatos e apresentação apenas de PIDs anunciados pela ECU; rotação auxiliar ampliada, com exclusão dinâmica dos PIDs já consultados no ciclo; janela explícita para leituras reais recentes, descarte de timestamps inválidos/futuros, N/D quando o dado vence e alertas visuais para limites operacionais definidos; alertas passam à frente da rotação normal e alternam a cada 10 s.
- **Proteções:** não criar segunda fila/sondagem OBD, não promover catálogo a suporte real e não reutilizar valores vencidos como atuais. Limites de alerta são indicações de referência, não DTCs nem prova isolada de defeito.
- **Validação:** teste cockpitTelemetry.test.js adicionado a npm test e ao gate anti-regressão. CI, TypeScript e build Android ainda aguardam execução para este commit; não presumir aprovação. A validação física com ELM327/ECU continua separada.

## DB-108 · 2026-10-23 — Recuperação Bluetooth/ELM327 e reconciliação de PR

- **Falha de integração:** a PR #77 ficou baseada no HEAD anterior às PRs #78 e #79 e tocava arquivos de cockpit/navegação atualizados desde então. A reconciliação mantém o código atual de splash, cockpit e telemetria; mudanças de navegação antigas não devem substituir essas versões.
- **Recuperação OBD:** timeouts de conexão/escrita/fechamento nativo têm deadlines; persistência da desconexão não bloqueia a tentativa de fechar a sessão; reconexão permanece bloqueada quando a liberação do socket RFCOMM não está confirmada; retry de limpeza também é limitado.
- **Protocolo e permissões:** recuperação ELM (ATZ/ATSP/prova ECU/ATDP) é serializada; GPS segue opcional para iniciar OBD; o plugin limita permissões Bluetooth legadas no Android até API 30 sem limitar as permissões modernas.
- **Proteções:** testes adversariais de promessa pendente, falha de fechamento, bloqueio entre instâncias e ordem de protocolo ficam ligados a `npm test` e ao gate anti-regressão. Os requisitos Bluetooth recebem IDs RG-22 a RG-31, sem duplicar RGs existentes.
- **Validação:** conferir `gate:baseline`, `validate` e `android-build` no SHA final desta atualização. A CI não substitui teste físico com ELM327/ECU; esse teste e a inspeção no aparelho permanecem pendentes.

## DB-109 · 2026-10-24 — Auditoria integral, correção do índice e reconciliação do estado atual

### Escopo e leitura
- Foi lido o conteúdo completo de `docs/DIARIO_DE_BORDO.md` (3.441 linhas antes desta correção), incluindo os registros de contexto do início, a seção de regras operacionais e todas as entradas históricas `DB-001` a `DB-108`.
- As entradas históricas foram preservadas. Correções foram aplicadas ao estado documental atual, ao índice e à formatação dos cabeçalhos, sem reescrever falhas antigas como se não tivessem ocorrido.

### Inconsistências corrigidas
- O bloco chamado “ESTADO VIGENTE” datado de 2026-10-21 estava desatualizado e mencionava um SHA antigo de `main`; ele foi renomeado para snapshot histórico e apontado ao bloco de estado atual.
- O índice listava somente até `DB-088`, apesar de o arquivo já conter as entradas `DB-089` a `DB-108`. Todas foram incluídas e a entrada atual `DB-109` foi acrescentada.
- Os cabeçalhos de `DB-107` e `DB-108` usavam nível `###`, ao contrário das demais entradas; foram normalizados para `##`.
- Os dois resumos de contexto de 2026-10-23 diziam que a PR #80 ainda não havia sido mesclada. A redação agora deixa explícito que esse era o estado na data de registro e remete à confirmação posterior, sem apagar o histórico.
- Foi adicionado no início um resumo atual datado com os SHAs e links de CI/PR consultados. O índice agora declara com precisão que enumera entradas `DB-NNN`, mantendo separadas as notas iniciais sem ID.

### Estado do GitHub verificado em 2026-10-24
- `main`: `701474de2cb3ed8a617a66d87fe3b5e368366acb`; CI [39985825746](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/39985825746) concluída com sucesso nesse SHA.
- PR #80 foi mesclada em 2026-10-23 e seu merge commit é o próprio SHA atual de `main`.
- PRs #81, #82, #83 e #84 estavam abertas na consulta. Suas CIs consultadas terminaram com sucesso nos SHAs de suas respectivas branches, mas nenhuma dessas mudanças deve ser descrita como estando em `main` antes do merge.
- PRs #74 e #75 estavam fechadas sem merge.
- O protótipo Floot e o app Expo/React Native continuam sendo alvos distintos; a portabilidade proposta na PR #83 é separada e não se presume integrada.

### Validação e limites
- Verificação documental: IDs `DB-001` a `DB-109` conferidos em sequência; as lacunas antes desta correção eram do índice, não das entradas históricas.
- Esta alteração muda documentação somente; não altera código de produção, catálogo JSON, fórmulas, dependências, configuração Android ou transporte OBD.
- A CI do novo commit documental ainda precisa ser consultada pelo SHA exato. Não declarar essa alteração validada por CI até que a execução correspondente termine.
- Teste físico com ELM327/ECU e inspeção visual no aparelho não são comprovados por CI e continuam a exigir evidência própria.

### Regra de manutenção a partir desta revisão
- Preservar como históricos os estados registrados em cada data; corrigir o estado atual em bloco próprio, com links e SHAs consultáveis.
- Ao criar uma nova entrada `DB-NNN`, atualizar também o índice no início e usar o próximo ID disponível.
- Nunca declarar uma branch/PR como mesclada ou validada com base em status de outra branch, outro SHA ou uma etapa intermediária de CI.



## DB-110 · 2026-10-24 — Descoberta OBD mais rápida, cache não autoritativo e latência por comando

### Auditoria do fluxo real
- O repositório nativo já tinha `src/obd/intelligentPidDiscovery.ts`, chamado por `src/obd/bluetoothManager.ts`, usando a fila serial de `Elm327Session`. Portanto, não foi criado um segundo motor nem uma segunda fila.
- Foram encontrados dois gargalos de arranque: a splash repetia cinco consultas seriais para cada PID suportado antes de abrir o cockpit; além disso, quando o cache batia com o protocolo, o manager reutilizava a lista cacheada e pulava a bitmap da sessão corrente.
- As cinco leituras válidas continuam exigidas para a avaliação de sensores no Laboratório. Elas não são necessárias para fazer a descoberta inicial e não devem bloquear a entrada no cockpit.

### Correções aplicadas neste branch
- `src/obd/bluetoothManager.ts`: toda sessão válida executa `discoverIntelligentPids`; o cache compatível passa como `knownPids` para ordenar os candidatos, nunca como prova de suporte. A resposta `010C` já usada para validar a ECU é reutilizada sem um round trip duplicado.
- Instrumentação por comando: `PID_DISCOVERY_COMMAND_RESULT` registra tipo de comando, status, tempo `elapsedMs`, valor/unidade, justificativa e RX bruto. `PID_DISCOVERY_SUMMARY` registra páginas bitmap consultadas, quantidade de sondagens, soma/máximo dos tempos reportados, duração total de parede e PIDs que responderam validamente.
- `app/splash.tsx`: removido o ciclo extra de cinco consultas por PID antes do cockpit. O painel abre depois que a descoberta/validação na conexão termina e a splash apresenta a contagem de PIDs com resposta válida.
- `tests/regression.test.js`: reforça que um PID guardado em cache compatível é priorizado, mas somente depois da bitmap corrente, e que os tempos por comando ficam disponíveis no resultado.
- `tests/projectBaseline.test.js`: protege contra o retorno de aquecimento serial na splash e contra o uso do cache para pular a descoberta.
- Atualizados `docs/CONTRATO_ANTI_REGRESSAO.md` (RG-32), `docs/TEST_PLAN.md` e `README.md`.

### Critérios técnicos preservados
- A fila ELM327 continua única e serial; nenhum comando concorrente foi adicionado.
- PIDs não anunciados pela bitmap atual não são consultados com base apenas em cache antigo.
- O PID `010C` permanece reutilizado como prova real da ECU, sem duplicar a consulta na descoberta.
- Cinco leituras sequenciais e cinco valores válidos continuam obrigatórios no teste de sensores; a mudança remove apenas o pré-aquecimento duplicado de startup.
- Catálogo e bitmap não provam precisão física/elétrica do sensor. Somente resposta válida comprova resposta atual do PID.

### Validação e limites
- CI [40102952556](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40102952556), run #3170, para o HEAD `f9afaed53132521f8fbfc09d59cf6ab90bac9536`: `validate` e `android-build` concluídos com sucesso.
- A CI comprova apenas o SHA da branch #86; não comprova que a alteração esteja em `main`, nem mede latência real em um veículo.
- O teste físico com ELM327/ECU continua pendente; latência real, bitmap e PIDs suportados devem ser registrados a partir de uma sessão real.
- PR #86 aberta, sem merge.


## DB-111 · 2026-10-24 — Continuidade da auditoria e reconciliação documental das PRs

### Escopo da auditoria
- O Diário de Bordo foi consultado antes da inspeção do código, com atenção ao estado vigente, às regras anti-regressão, ao índice e às entradas mais recentes.
- Revisados no GitHub: `package.json`, workflow `.github/workflows/ci.yml`, `docs/CONTRATO_ANTI_REGRESSAO.md`, `docs/TEST_PLAN.md`, catálogo `src/knowledge/pids.json`, parser `src/obd/parser.ts`, definição/fórmulas de PID, cálculo de consumo de combustível, apresentação de autonomia, serviço de viagem e testes associados.
- A análise foi estática, apoiada nos arquivos e no estado da CI no GitHub. Não foi executada uma sessão local com veículo ou adaptador físico.

### Resultados e evidências
- **Catálogo e fórmulas:** o catálogo contém 34 PIDs e 18 identificadores de fórmula distintos. Todos os identificadores usados no catálogo aparecem cobertos por vetores determinísticos em `tests/pidParserIntegrity.test.js`. O teste também percorre todos os PIDs para verificar comprimento declarado, interpretação finita e preservação dos bytes básicos.
- **Parser:** a suíte cobre payload truncado e excedente, resposta hexadecimal compacta e espaçada, cabeçalho CAN, envelope legado K-Line com checksum e mensagens de estado do adaptador. A validação de bytes sintéticos não demonstra que a ECU deste veículo suporte todos os PIDs catalogados.
- **Autonomia:** a lógica central exige ECU conectada, sessão ativa, PID 012F suportado e leitura de combustível recente (janela de 30 s); consumo da viagem só é priorizado depois dos limiares de distância, combustível integrado e amostras válidas. A API pública do serviço filtra leituras vencidas antes de entregar o estado às telas. Na revisão estática deste caminho, não foi confirmado defeito adicional que justifique alterar a lógica sem teste comportamental específico.
- **CI da PR #87:** execução [40114505089](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40114505089), no HEAD `fb475eb4908311a666c304af59d9e6007a092a9f`: `validate` e `android-build` concluídos com sucesso.
- **Coordenação documental:** a PR [#85](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/85) e a PR [#87](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/pull/87) modificam `docs/DIARIO_DE_BORDO.md` a partir de bases distintas e usam `DB-109` para conteúdos diferentes. Há risco concreto de conflito de conteúdo/ordenação e de um dos registros ser perdido se as branches forem integradas sem reconciliação. Esta atualização reserva `DB-110` nesta branch documental; a branch da PR #87 ainda precisa ser sincronizada com o índice e a numeração final antes de qualquer merge.

### Limites de validação
- Nenhuma alteração em código de produção, fórmulas, catálogo de PIDs, dependências ou configuração Android foi feita nesta rodada; a alteração desta rodada é documental.
- A execução anterior da PR #87 concluiu `validate` e `android-build` com sucesso no SHA indicado. Como o Diário será sincronizado, cada novo HEAD gerado pela edição documental precisa de CI própria.
- Não foi executado teste físico com ELM327/ECU nem inspeção visual do APK instalado. Esses itens permanecem pendentes.
- Nenhum merge foi executado ou autorizado.

### Próximos passos
1. Confirmar a CI de cada branch depois da sincronização documental, pois cada commit recebe um SHA novo.
2. Manter uma única sequência DB-001 a DB-111 nas PRs #85, #86 e #87; não sobrescrever registros históricos.
3. Se a CI falhar ou o build expuser problema, registrar o log e a causa antes de alterar código.
4. Validar fisicamente a descoberta bitmap, o PID 012F e a autonomia durante uma viagem real antes de afirmar compatibilidade com a Meriva específica.


## DB-112 · 2026-10-24 — Validação estrita de bitmaps OBD e reconciliação dos IDs anti-regressão

### Problemas confirmados na revisão das PRs
- As PRs #86 e #87 atribuíam significados distintos ao mesmo identificador `RG-32`: descoberta OBD na #86 e confiabilidade de consumo/autonomia na #87. Essa colisão dificultava a integração e fazia uma asserção de baseline proteger o requisito errado após a combinação das mudanças.
- `src/obd/pidScanner.ts` extraía os primeiros quatro bytes após o marcador da bitmap, mas não validava bytes excedentes nem mantinha as linhas de resposta separadas. Assim, uma resposta malformada poderia ser aceita como bitmap válida.

### Correções aplicadas
- PR #86: `decodeSupportedPids` agora valida uma única bitmap com exatamente quatro bytes de payload, preservando envelopes aceitos de OBD direto, CAN de 11/29 bits com DLC correspondente e K-Line legado com checksum final. Rejeita bytes excedentes, payload repartido entre linhas e respostas de múltiplas ECUs ambíguas.
- PR #86: o campo `responded` do scanner legado só confirma uma bitmap válida para o PID de descoberta solicitado. Uma resposta positiva para outro PID é rejeitada, enquanto uma bitmap válida com zero bits suportados continua sendo uma resposta válida.
- PR #86: adicionados testes de regressão para bytes extras, linhas separadas, cabeçalhos CAN de 11/29 bits, envelope K-Line, respostas múltiplas, PID de resposta divergente e bitmap válida vazia.
- PR #86: o contrato RG-32 foi ampliado para incluir a integridade das bitmaps da sessão atual, além da regra de cache apenas como prioridade e dos registros de latência.
- PR #87: o requisito de consumo confiável/autonomia foi renumerado para RG-33; o teste `projectBaseline.test.js` passou a exigir RG-33 para esse requisito, eliminando a colisão com RG-32.

### Validação e limites
- As alterações de código/testes/documentação geraram novos HEADs nas branches #86 e #87. A CI deve ser confirmada nos SHAs finais depois desta sincronização; resultados de commits anteriores não validam estes novos HEADs.
- Os testes adicionados cobrem formatos determinísticos, mas não comprovam suporte/precisão de sensores na Meriva específica.
- Teste físico com ELM327/ECU, medição de latência real e inspeção do APK instalado continuam pendentes.
- Nenhuma PR foi mesclada nesta atualização.


## DB-113 · 2026-10-24 — Compatibilidade do parser com envelope K-Line compacto

### Problema confirmado
- A configuração de inicialização do ELM327 usa `ATS0`, que remove separadores entre bytes. O parser da PR #87 aceitava o checksum do envelope K-Line legado apenas no caminho de tokens separados por espaços; uma resposta compacta como `486B10410C1AF882` era rejeitada por conter um byte terminal além do payload PID.
- Esse caminho é relevante para protocolos K-Line presentes em veículos mais antigos; testes apenas com respostas espaçadas não cobriam a combinação com `ATS0`.

### Correção aplicada na PR #87
- O caminho compacto de `findResponsePayload` agora permite exatamente um byte terminal extra somente quando o prefixo é o envelope conhecido `486B10`. Respostas OBD diretas continuam exigindo payload exato sem bytes extras.
- Cabeçalhos CAN compactos agora exigem ID de 11/29 bits seguido de DLC compatível com o comprimento esperado para serviço, PID, quadro e payload; prefixos arbitrários e DLC incorreto são rejeitados.
- Adicionados testes para aceitar o envelope K-Line compacto e rejeitar outro byte adicional depois do checksum, aceitar IDs CAN compactos de 11/29 bits e rejeitar DLC incorreto ou prefixo hexadecimal arbitrário. A validação equivalente foi aplicada ao caminho espaçado: IDs CAN e DLC são conferidos, e bytes arbitrários antes da resposta ou DLC incompatível são rejeitados.
- O contrato RG-33 agora documenta o envelope K-Line compacto e a validação do DLC CAN; RG-32 permanece reservado à integridade/descoberta das bitmaps, sem colisão entre PRs.

### Validação e limites
- Parser, teste de integridade e contrato foram alterados em novos commits da branch #87. A CI do HEAD final precisa terminar antes de considerar a mudança validada.
- O teste cobre o formato de resposta, não a comunicação física nem a validade elétrica dos dados. ELM327/ECU reais e inspeção visual do APK continuam pendentes.
- Nenhuma PR foi mesclada nesta atualização.


## DB-114 · 2026-10-24 — Exibição do ajuste de combustível do segundo byte do PID 0114

### Problema confirmado
- O catálogo já definia o PID `0114` com dois bytes, e a fórmula `O2_VOLTS` corretamente calculava a tensão a partir do byte A. Porém, o byte B — que contém o ajuste de combustível de curto prazo (STFT) associado à sonda B1S1 — era preservado em bytes brutos mas não interpretado nem mostrado ao operador.
- O valor especial `B=0xFF` significa que essa sonda não é usada no cálculo do ajuste de combustível; calculá-lo como número daria uma interpretação semântica incorreta.

### Correções aplicadas na PR #87
- `src/obd/parser.ts`: mantém o valor principal em volts e preenche `interpretation` com `AJUSTE CURTO B1S1=...` usando `(B × 100 / 128) − 100`; para `B=0xFF`, informa `NÃO USADO` sem gerar percentual.
- `app/laboratorio.tsx`: apresenta o campo `INTERPRETAÇÃO` nos detalhes técnicos quando o parser oferece uma interpretação secundária.
- `tests/pidParserIntegrity.test.js`: verifica que o valor de tensão não muda, que `B=0x76` resulta em `-7,81%` arredondado para exibição e que `B=0xFF` é tratado como não usado.
- `tests/projectBaseline.test.js`: protege contra regressão que esconda interpretações secundárias dos detalhes técnicos.
- Atualizados `docs/RELATORIO_PIDS_E_FORMULAS.md` e `docs/TEST_PLAN.md`.
- Referências técnicas consultadas: [SAE J1979 (tabela do PID $14)](https://law.resource.org/pub/us/cfr/ibr/005/sae.j1979.2002.pdf) e [catálogo público de PIDs OBD-II](https://www.dashlogic.com/docs/technical/obdii_pids).

### Validação e limites
- As novas alterações de parser, teste, interface e documentação precisam de CI própria no SHA final desta sincronização.
- A fórmula e a apresentação têm testes determinísticos; isso não confirma que a ECU específica da Meriva suporte o PID 0114 nem que a leitura física da sonda esteja calibrada.
- Teste com ELM327/ECU e inspeção visual do APK continuam pendentes.
- Nenhuma PR foi mesclada nesta atualização.

## DB-115 · 2026-10-24 — Buffer limitado para respostas da descoberta de PIDs

### Problema e objetivo
- A descoberta preservava observações mas não oferecia uma estrutura limitada reutilizável para inspecionar respostas brutas.
- Cache global de respostas poderia misturar ECUs e sessões diferentes.

### Implementação
- Criado `src/obd/pidDiscoveryBuffer.ts`, um FIFO limitado (padrão 64, ajustável de 1 a 256), exclusivo da descoberta atual, com normalização de PIDs e cópias defensivas.
- `src/obd/intelligentPidDiscovery.ts` registra respostas da sonda prioritária, bitmaps e PIDs individuais e devolve `responseBuffer` para auditoria.
- Testes cobrem capacidade, FIFO, normalização e isolamento.

### Limites
- O buffer é volátil por execução; não substitui a validação de suporte na ECU atual nem é persistência histórica.

## DB-116 · 2026-10-24 — Buffer RX limitado no transporte Bluetooth

### Problema confirmado
- O transporte acumulava chunks até o prompt `>` sem limite explícito; chunks muito grandes também podiam inchar os diagnósticos.

### Correção
- `src/obd/bluetoothClassicTransport.ts`: limite RX de 16 KiB; após overflow, descarta a resposta até o prompt e emite erro explícito em vez de aceitar dados truncados.
- Diagnósticos guardam no máximo 256 caracteres de texto/hex por chunk, mantendo o tamanho original reportado.
- Testes verificam rejeição do quadro excessivo, truncamento dos logs e recuperação para a próxima resposta.

## DB-117 · 2026-10-24 — Integridade de checksum K-Line e enquadramento de DTC

### Problema confirmado
- A aceitação do envelope legado `48 6B 10` permitia byte terminal sem verificar que ele correspondia ao checksum aditivo.
- O parser DTC anterior retirava caracteres não hexadecimais do conjunto da resposta e podia juntar linhas de ECUs distintas, sem validar adequadamente o enquadramento CAN.

### Correção
- `src/obd/parser.ts`: checksum K-Line aditivo de 8 bits validado no caminho compacto e espaçado.
- `src/obd/dtcParser.ts`: linhas processadas separadamente; aceita resposta direta, quadro CAN de quadro único com comprimento declarado compatível e envelope K-Line reconhecido com checksum válido. Códigos repetidos são deduplicados.
- `tests/pidParserIntegrity.test.js`, `tests/regression.test.js` e `tests/dtcScanner.test.js`: quadros com checksum incorreto ou comprimento CAN errado são rejeitados; respostas válidas em linhas separadas continuam reconhecidas.

### Limites
- As regras de quadro foram testadas com fixtures determinísticas. Capturas físicas K-Line/CAN ainda são necessárias para verificar todos os clones de adaptador e ECU da Meriva.

## DB-118 · 2026-10-24 — Persistência segura de viagens, CSV, cota e backups

### Problemas confirmados
- Uma falha de leitura de `VIAGENS/index.json` podia fazer uma nova gravação começar em índice vazio, substituindo o histórico anterior.
- Gravações concorrentes de viagens podiam disputar o mesmo índice; nomes diários baseados em UTC podiam colocar viagens no dia local errado.
- CSVs existentes precisavam de ordem estável de colunas e a fila de telemetria não tinha limite explícito.
- A verificação de cota tratava alguns erros de leitura como tamanho zero; a meta `cleanupTargetMb` não orientava efetivamente a limpeza. Backups não eram verificados nem rotacionados.

### Correção
- `src/storage/driveCycleStorage.ts`: fila serial por índice, arquivo temporário validado, cópia anterior válida, recuperação a partir do backup e erro explícito se o índice for inválido sem cópia recuperável. O CSV diário usa a data local do início da viagem.
- `src/database/csvLogger.ts`: fila limitada a 10.000 linhas pendentes, status de fila, cabeçalho estável e migração sem perda de linhas ao adicionar colunas.
- `src/storage/quotaManager.ts`: tamanhos desconhecidos geram erro explícito; limpeza até a meta remove somente os arquivos mais antigos de `LOGS` e `LEITURAS`, nunca viagens, configuração, aprendizado ou backups.
- `app/armazenamento.tsx`: erro de verificação aparece na tela em vez de simular ocupação baixa.
- `src/storage/backup.ts`: CSVs são descarregados antes da cópia; cada diretório é comparado por tamanho, um manifesto é validado e a retenção mantém os cinco backups mais recentes.
- Testes cobrem gravações concorrentes, recuperação/preservação do índice, migração de cabeçalho CSV e manifesto de backup.

### Limites
- CSV continua baseado em leitura e regravação do arquivo para implementar migração de esquema; arquivos muito grandes podem exigir segmentação/append nativo futuro.
- A fila tem teto explícito: se permanecer saturada, novas linhas são descartadas e o contador é incrementado; monitorar esse contador é importante para diagnósticos de longa duração.

## DB-119 · 2026-10-24 — Validação profunda do autosave, GPS e estimativas de combustível

### Problemas confirmados
- A validação do autosave era superficial em subestruturas; coordenadas fora das faixas geográficas ou precisão GPS ausente podiam ser tratadas como evidência utilizável; estimativas de combustível precisavam rejeitar casos físicos/numericamente inválidos.
- A fila serial do DTC retinha entradas concluídas por comparação entre promises diferentes.

### Correção
- `src/meriva/autosaveValidation.ts`: valida envelope, timestamps, leituras finitas, DTCs, viagens, autonomia, discovery e configurações; a hidratação retorna defaults seguros para objetos parciais. Schemas antigos só passam se houver uma migração registrada.
- `src/gps/gpsTracker.ts`: rejeita latitude/longitude fora de faixa, precisão negativa/infinita e usa `NaN` para coordenadas inválidas na função Haversine; precisão ausente deixa de ser evidência de movimento confiável.
- `src/obd/fuelConsumption.ts`: rejeita temperatura absoluta não física, parâmetros não finitos e resultados de taxa de combustível que transbordem para infinito.
- `src/database/dtcManager.ts`: remove corretamente a referência de fila após o término da gravação.
- Testes adicionados para envelopes parcialmente inválidos, GPS inválido/drift e estimativas MAF/MAP impossíveis.

### Validação e limites
- A CI do HEAD final precisa terminar verde em `validate` e `android-build`.
- Teste em aparelho, captura real ELM327/ECU, verificação visual de telas e recuperação real de backup continuam fora da validação estática/automatizada.

## DB-120 · 2026-10-24 — Descoberta rápida e integridade de quadros OBD

### Correções integradas nesta branch
- `app/splash.tsx`: removidas cinco consultas extras por PID na inicialização. A descoberta individual já é feita pela fila compartilhada; o teste de sensores mantém cinco amostras válidas.
- `src/obd/pidScanner.ts`: cada bitmap é validada sem concatenar linhas e deve ter exatamente quatro bytes; envelopes CAN precisam de ID/DLC coerentes e K-Line exige checksum aditivo válido.
- `src/obd/bluetoothManager.ts`: cache compatível apenas prioriza a ordem. A ECU da sessão atual é consultada sempre; diagnóstico registra status, latência por comando e resumo da descoberta.
- `src/database/csvLogger.ts`: removido o uso de `append: true`, não suportado por `writeAsStringAsync` no Expo SDK 51 legado. A gravação preserva os registros anteriores ao acrescentar um lote.
- Os testes de regressão cobrem bitmap com bytes excedentes, quadro dividido entre linhas, CAN 11/29 bits, múltiplas ECUs e checksum K-Line correto/incorreto.

### Custo e validação pendente
- Como o sistema de arquivos legado não oferece append nessa API, o lote CSV é persistido por leitura e regravação do arquivo. Isso preserva os dados, mas pode custar mais em arquivos diários grandes; considerar segmentação ou append nativo suportado em uma rodada específica de desempenho.
- No HEAD anterior desta branch (`30c0d3a9e256e220e43195546693fd331a7d7720`), a run [40132625053](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40132625053) concluiu os jobs `validate` e `android-build` com sucesso, incluindo prebuild e verificação do APK standalone. A atualização DB-121 muda o HEAD; esse resultado não valida o novo SHA e a CI precisa ser confirmada novamente.
- Teste físico com ELM327/ECU e inspeção do APK instalado permanecem pendentes.


## DB-121 · 2026-10-24 — Releitura integral do diário e reconciliação das PRs mais recentes

### Escopo da revisão
- Relido `docs/DIARIO_DE_BORDO.md` na branch `fix/repository-audit-hardening-20261024` antes da edição. Conferidos os cabeçalhos `DB-001` a `DB-120`: 120 entradas sequenciais, sem IDs duplicados nem lacunas.
- Relido `docs/CONTRATO_ANTI_REGRESSAO.md`: 35 regras RG na branch, sem identificadores duplicados. Os estados antigos foram preservados como histórico; somente o bloco de estado vigente e a conclusão da CI de DB-120 foram reconciliados.
- Conferidos metadados das PRs #81–#89 e as execuções vinculadas aos respectivos SHAs. A única PR confirmada como mesclada entre as recentes é a #80; as PRs abertas não fazem parte de `main`.

### Regressões e riscos encontrados
- **Diário divergente entre branches:** as PRs #85, #86 e #87 tinham cópias paralelas do Diário de Bordo; houve conflito anterior de numeração e de identificador RG-32. A branch de consolidação #89 mantém a sequência DB e separa RG-32 (integridade/descoberta das bitmaps) de RG-33 (consumo/autonomia e enquadramento), documentando a reconciliação nas entradas anteriores. Não substituir este diário pela cópia de uma branch irmã sem comparar os registros DB/RG.
- **Risco elevado de conflito com a portabilidade visual:** a PR #83 altera 17 caminhos também alterados pela #89 e ainda compartilha nove caminhos com a PR #82. Os pontos mais sensíveis são cockpit, laboratório, parser, gravação de viagens e testes/contratos; merge sem reconciliação pode recuperar código antigo ou retirar proteções novas.
- **Funcionalidades ainda não integradas:** PID 0144 (#81), inventário completo de PIDs (#84) e navegação/portabilidade visual (#82/#83) continuam em PRs próprias. Não apresentar essas mudanças como parte de `main` nem assumir suporte físico dos PIDs candidatos.
- **Estado real da validação:** no SHA anterior da #89, a CI terminou `validate` e `android-build` com sucesso (run 40132625053). A presente alteração é um novo commit documental, portanto requer sua própria execução de CI. A validação física e inspeção do APK continuam fora da evidência disponível.

### Próxima sequência segura
1. Confirmar CI para o novo HEAD da PR #89 e revisar os diffs resultantes, sem mesclar automaticamente PRs irmãs.
2. Reconciliar #82/#83 com o hardening da #89 por arquivo, preservando a versão escolhida de cockpit/navegação e os testes de parser/viagens.
3. Tratar #81 e #84 após a consolidação, validando catálogo/fórmulas, faixas e evidência real separadamente.
4. Manter a migração do Expo SDK em #88 separada e realizar teste em Android físico com ELM327/ECU antes de declarar o comportamento OBD validado.



## DB-122 · 2026-10-24 — Confirmação das CI e revisão das PRs de layout

### Evidência confirmada
- Consultados os metadados atuais das PRs #82, #83, #85, #86, #87 e #89, seus HEADs e as execuções mais recentes acessíveis.
- PR #82: `validate` e `android-build` concluíram com sucesso em `d4bae6f794d78e59bb7c1323e11deb2978eefa92`, run 40039535306.
- PR #83: `validate` e `android-build` concluíram com sucesso em `85078c2aacd4ff7427b5ded7c1b1ce0e1f6803cf`, run 40098343069.
- PR #89, antes desta atualização do diário: `validate` e `android-build` concluíram com sucesso em `9a7b747c3210b8b4a7b7a1468dfd1b289717329b`, run 40133491810.
- A CI bem-sucedida é por SHA; os commits gerados por alterações documentais exigem nova CI. A conclusão não declara que o APK foi instalado nem que uma ECU real foi testada.

### Pontos de layout que precisam permanecer protegidos
1. A navegação absoluta em paisagem precisa reservar espaço no quadro do cockpit (`paddingLeft:56`) e ter teste de regressão explícito. A implementação da #82 inclui essa defesa; a #83 precisa portá-la.
2. A tela de prévia `app/floot-layout.tsx` deve ser removida/movida para fora da árvore de rotas de produção ou convertida em uma tela real e deliberada, sem telemetria simulada.
3. O nome do veículo no cabeçalho deve vir do perfil configurado ou ser neutro, não um valor literal potencialmente incorreto.
4. A equipe deve escolher uma navegação principal definitiva entre as propostas #82 e #83 e preservar destinos existentes, acessibilidade, layout responsivo e acesso a Dados/Mais Recursos.
5. A política de 25 PIDs da #82 e a expectativa de 20 da #83 devem ser reconciliadas junto com `polling_policy.json` e os testes, sem remover proteção para fazer a CI passar.

### Integração recomendada
- Não fazer merge automático nem integrar #82, #83 e #89 em sequência sem uma branch consolidada/rebase com revisão de diffs. A #83 mexe em lógica de parser, telemetria, viagem e catálogo além do layout; esses trechos precisam ser reconciliados com as correções mais recentes de #89.
- A descrição das PRs #82/#83 foi atualizada com os resultados reais de CI e os riscos. A revisão do layout da #83 identificou os bloqueios acima; a PR deve ficar aberta para correções.
- Permanecem pendentes inspeção visual em aparelho Android e teste físico com ELM327/ECU, incluindo confirmação dos PIDs, leitura de DTC, desconexão/reconexão e verificação da autonomia/consumo.



## DB-123 · 2026-10-24 — Correção da atribuição de layout após releitura direta da PR #83

### Retificação necessária
- A anotação DB-122 atribuiu à PR #83 a navegação vertical absoluta à esquerda, sem reserva de espaço. A releitura direta de `app/index.tsx` no head `85078c2aacd4ff7427b5ded7c1b1ce0e1f6803cf` demonstrou que essa atribuição estava incorreta.
- **PR #82:** possui `bottomNavLandscape` com `position:'absolute'`, `left:0`, largura de 50 dp e `screenFrameLandscape` com `paddingLeft:56`; o conteúdo reserva espaço para a coluna lateral.
- **PR #83:** possui `bottomNavLandscape` apenas com ajustes compactos de margem/preenchimento; os seis ícones permanecem numa barra horizontal no rodapé em paisagem. Portanto, não foi comprovada sobreposição causada por navegação lateral nessa PR.

### Estado correto após retificação
- O problema é a divergência de proposta: #82 usa coluna lateral em paisagem; #83 usa barra inferior horizontal. Escolher uma solução e verificar a legibilidade/área de toque no aparelho; não manter a acusação de sobreposição à #83.
- Permanecem válidos os pontos sobre a rota de prévia estática dentro de `app/`, a divergência README-versus-serviço sobre perfis de veículo, o conflito de política 20/25 PIDs e os arquivos de OBD compartilhados com #89.
- As descrições das PRs #82, #83 e #89 e o comentário na conversa da #83 foram corrigidos para refletir essa distinção.
- Esta entrada corrige a conclusão anterior sem apagar o histórico da auditoria. Nenhum merge foi feito. A nova edição documental exige CI para seu SHA; CI verde não substitui testes físicos e inspeção visual.



## DB-124 · 2026-10-24 — Delimitação do risco de modelo fixo no layout

### Verificação de fonte de verdade
- O cabeçalho da PR #83 escreve literalmente `MERIVA MAXX 1.4`.
- A leitura de `src/database/vehicleConfig.ts` mostra que `ensureMerivaVehicleProfile()` força atualmente `vehicleName/model = Meriva Maxx`, Chevrolet, ano do manual Meriva e motorização do manual, inclusive ao normalizar um perfil já existente. Assim, o texto do cabeçalho corresponde ao perfil padrão atual; não está comprovado que essa PR passe a exibir um modelo errado.
- Contudo, o README descreve o perfil do veículo como configurável. Há, portanto, uma divergência preexistente entre a promessa documental e o serviço de perfil, além da duplicação do nome do veículo na UI.

### Decisão recomendada
- Não classificar o texto literal como falha funcional comprovada na PR #83. Tratar como decisão de produto/manutenção: ou o aplicativo fica explicitamente restrito à Meriva e a documentação reflete esse limite, ou o serviço de perfil e o cabeçalho passam a respeitar valores configuráveis.
- Essa questão é independente da escolha visual entre a barra inferior da #83 e a coluna lateral da #82, do conflito 20/25 PIDs e da reconciliação de parser/persistência com a #89.
- Nenhuma alteração de código foi feita nesta entrada. O commit documental cria novo SHA e deve passar pela CI correspondente.



## DB-125 · 2026-10-24 — Auditoria retrospectiva das PRs, CI e diário desde o início

### Escopo e evidência
- Repositório auditado: `luizmarquesarruda/meriva-smart-diagnostic`.
- Foram consultados os metadados de todas as PRs listadas no endpoint do repositório, do #1 à #89, o histórico de Actions com 3.444 execuções reportadas pela API, o run número 1 e os SHAs atuais das PRs abertas.
- O diário foi lido em dois estados distintos: `main` e a branch desta PR. Não confundir o conteúdo de uma branch de auditoria com o que já foi integrado.
- Também foi lida a entrada cronológica mais antiga identificada, DB-001, e o início atual do arquivo, que é organizado com atualizações recentes no topo e registros DB históricos abaixo.

### Resultado retrospectivo das PRs
- A API retornou **86 PRs existentes**, com lacunas de numeração; #23 e #57 não aparecem como PRs existentes e #88 é uma issue, não uma PR.
- Estado consultado: **23 mescladas**, **8 abertas** (#81–#87 e #89) e **55 fechadas sem merge**. A PR #1 foi encerrada sem merge; a #2 foi a primeira auditoria ampla mesclada. PR fechada sem merge não deve ser presumida incorporada, mesmo quando seu título descreve uma correção importante.
- A #80 é a última integração confirmada em `main` no momento desta auditoria. A #89 permanece draft e fora de `main`.
- Há histórico de PRs de validação/teste que foram fechadas sem merge depois que uma PR seguinte foi mesclada (ex.: #34/#35 e #28–#31). Isso pode ser intencional, mas os títulos não são prova de código integrado; rastrear o SHA/merge commit antes de reaplicar qualquer patch.
- PRs fechadas sem merge com funcionalidades de consumo, GPS, viagem, Bluetooth, armazenamento e design devem ser tratadas como propostas históricas. Verificar cada requisito contra `main` antes de reabrir ou copiar código, para evitar ressuscitar regressões antigas.

### Resultado retrospectivo da CI
- Primeira execução: [run #1, ID 37022666513](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/37022666513), em 2026-10-02, falhou **antes de executar instalação ou testes**. O log identifica a causa: `actions/setup-node@v4` com `cache: npm` não encontrou `package-lock.json`, `npm-shrinkwrap.json` ou `yarn.lock`. Portanto, essa primeira falha foi de configuração/cache do workflow, não evidência de defeito no motor OBD.
- O histórico inicial contém uma sequência de execuções rápidas com falha na CI do `main` antes da execução de testes; o diário deve separar falhas de infraestrutura/configuração, falhas de TypeScript/testes e falhas de build Android, sem somá-las como se fossem o mesmo tipo de regressão.
- No snapshot mais recente consultado, a API reportava 3.444 runs; os runs finais 3393 (push) e 3394 (pull request), ambos no SHA `931973310f955a8d527401d51c33b7d55feb79e7`, concluíram com sucesso, incluindo `validate` e `android-build`. Isso valida aquele SHA, não o commit documental DB-125 que vem depois.
- A CI verde não demonstra conectividade Bluetooth, compatibilidade com um ELM327 físico, suporte dos PIDs na ECU ou precisão de autonomia/consumo em condução real.

### Releitura desde o primeiro registro do Diário de Bordo
- O começo atual do arquivo descreve a portabilidade da seção de fronteiras matemáticas do Floot para `app/laboratorio.tsx` no Expo, com dados artificiais explicitamente identificados. Essa seção não deve ser confundida com uma leitura física.
- A primeira entrada cronológica, **DB-001 (2026-10-06)**, registra uma falha de importação CommonJS do catálogo `fuel_types.json` no teste `fuelIdentification.test.js`. A correção foi compatibilizar o import; o próprio registro pedia aguardar o build Android. A regra processual original — problema, diagnóstico, correção, testes, commit, CI, resultado e próximo passo — continua válida.
- `main` contém 3.441 linhas e vai até DB-106; a branch da #89 contém 3.814 linhas e DB-125 após esta atualização. A diferença é explicada por trabalho posterior em branches ainda não integradas, mas representa um risco documental real: abrir apenas o diário de `main` omite as auditorias DB-107 em diante. Não copiar DB-125 para `main` sem a integração aprovada da PR que o contém.
- A seção de estado vigente na branch foi corrigida para refletir a CI verde de DB-124; DB-125 exige uma nova execução de CI.

### Regressões, inconsistências e riscos recorrentes encontrados
1. **Código não integrado versus documentação:** há 55 PRs fechadas sem merge. O título e a descrição de uma PR não provam que o seu código esteja no produto. Antes de cada correção, comparar o estado atual de `main` e o diff do SHA proposto.
2. **Explosão de execuções de CI:** o histórico tem centenas/milhares de runs de validação. A falha original por lockfile ausente e os ciclos de reexecução/testes desatualizados indicam a necessidade de evitar commits corretivos pequenos em sequência sem uma rodada local integrada. Consolidar mudanças coerentes, executar `npm ci`, testes, gate anti-regressão, `npm run validate` e build Android antes de pedir revisão.
3. **Validação por SHA:** CI verde de PRs separadas não valida o merge combinado; qualquer alteração posterior, inclusive só documental, muda o SHA e requer verificação correspondente.
4. **PIDs:** catálogo/bitmap indicam candidatos; suporte exige resposta positiva válida, PID correto, payload exato e sessão ECU atual. O inventário de 34/35 PIDs não deve ser comunicado como 34/35 PIDs suportados pela Meriva. Resolver a divergência de política 20/25 PIDs antes de combinar #82/#83.
5. **Fórmulas e autonomia:** os testes matemáticos confirmam a implementação sobre entradas sintéticas, não a calibração em veículo. PID 015E é preferível quando a ECU realmente o fornece; MAF/MAP é estimativa e precisa ser identificada como tal. Validar unidades, faixas, dados obsoletos e denominadores mínimos.
6. **Bluetooth/ELM327:** estados Bluetooth e ECU devem permanecer separados; a ECU exige resposta OBD válida. Testes de mocks e CI não substituem teste com adaptador físico, reconexão, timeout e desconexão.
7. **Persistência:** autosave, histórico de viagem, CSV, quota e backup precisam ser validados em upgrade/restauração, interrupção durante escrita e falta de espaço; não presumir segurança física apenas pelos testes unitários.
8. **Layout:** #82 e #83 apresentam navegações diferentes na paisagem; decidir uma só. A rota demonstrativa `app/floot-layout.tsx` deve ser tratada deliberadamente como rota de produto ou ferramenta de revisão. O rótulo fixo do veículo corresponde ao perfil Meriva forçado pelo serviço atual, mas contradiz a promessa documental de perfil configurável.
9. **Floot e repositório nativo:** Floot é um protótipo web sem transporte físico Bluetooth/ECU. Seus testes/typecheck podem validar fórmulas e UX do protótipo, mas não alteram nem substituem CI/build do Expo/Android.
10. **Ferramentas externas:** a busca por apps Replit retornou zero aplicativos editáveis correspondentes a Meriva; portanto, nenhuma mudança foi feita no Replit. O screenshot do Floot não foi capturado porque não havia janela/preview aberta na sessão do usuário. A auditoria visual completa do Product Design requer Work Mode, conforme disponibilidade do plugin.

### Validação do protótipo Floot nesta rodada
- Testes: 4 arquivos de especificação aprovados, 0 falhas (`themeMode`, `dashboardUx`, `obdPidFormulas`, `obdPidDiscovery`); dois testes de hooks estão excluídos da execução padrão.
- Typecheck: limpo.
- A leitura do código confirma que o estado Bluetooth é rotulado como simulado e que não existe conexão física nesta tela. Os dados de autonomia, consumo, velocidade, distância e temperatura aparecem como N/D até integração real.
- Não foi possível validar visualmente em screenshot nesta sessão porque o preview Floot não estava aberto. Abrir o preview e repetir a captura em retrato e paisagem antes de declarar a auditoria visual concluída.
- As funções especiais de alta precisão do plugin Precise Special Functions não são apropriadas para as fórmulas OBD aqui analisadas, que são conversões lineares/afins e operações de bytes. A validação relevante é aritmética de referência, testes de fronteira e comparação com SAE J1979/ISO 15031-5 e evidência da ECU.

### Próximas ações ordenadas
1. Aguardar CI do SHA DB-125.
2. Auditar e reconciliar os arquivos compartilhados entre #82, #83 e #89 em uma integração controlada, sem merge automático.
3. Confirmar a política final de PIDs (20 ou 25), manter os testes alinhados e medir a latência real por comando.
4. Executar teste físico Android/ELM327/ECU para 010C, 010D, 0105, 0110, 012F e 015E conforme suporte anunciado e respostas reais; comparar autonomia/consumo com um trajeto medido.
5. Testar restauração de backup, rotação, GPS em segundo plano, desconexão/reconexão e falta de espaço em aparelho físico.
6. Atualizar a seção vigente e o índice quando houver novo SHA validado; manter a história anterior e rotular claramente o que permanece fora de `main`.

**Resultado DB-125:** auditoria retrospectiva documental/CI e validação do protótipo concluídas dentro do acesso disponível. A auditoria de integração combinada, visual em aparelho e hardware físico permanece pendente. Nenhum merge foi feito.

## DB-126 · 2026-10-25 — Auditoria de estabilidade, rádio Bluetooth e controle de regressões

### Achados confirmados
- O diário da branch de hardening tinha 125 entradas sequenciais e índice correspondente. O índice, porém, terminava em DB-119 e omitia DB-120 a DB-125. Isso é uma regressão documental objetiva; agora a proteção automatizada exige o mesmo conjunto e a mesma ordem.
- Branches de PR independentes reutilizaram DB-109 para conteúdos distintos: #81 (PID 0144), #82 (navegação responsiva), #83 (layout Floot) e #89 (auditoria). O conflito surge ao combinar históricos independentes.
- `main` foi reportada como não protegida (`protected: false`) e sem rulesets; a CI não está confirmada como requisito obrigatório de integração.
- #89 e #90 alteravam os mesmos três arquivos Bluetooth/splash. CIs antigas verdes em SHAs diferentes não validavam a combinação.
- #82 e #83 dividem nove arquivos e propõem navegação diferente, além de política de 20 versus 25 PIDs. #83 compartilha 17 arquivos com #89. Esses conflitos ficam pendentes, sem merge automático.

### Correções nesta branch
- Criada `src/obd/bluetoothRadioRecovery.ts` como política pura para reconhecer rádio desligado, estado indeterminado e erros nativos equivalentes.
- `src/obd/bluetoothClassicTransport.ts` verifica o rádio antes de cada socket RFCOMM e após falha. Fallback só segue quando a tentativa anterior terminou e o rádio foi confirmado ligado.
- `src/obd/bluetoothManager.ts` interrompe retry ao identificar rádio desligado ou estado não confirmado; os logs informam tentativas executadas e causa terminal.
- `app/splash.tsx` preserva a mensagem nativa e disponibiliza a abertura manual do painel.
- Criado `tests/bluetoothRadioRecovery.test.js`; conectado ao `npm test` e ao gate.
- O gate protege suítes críticas adicionais e valida IDs do diário sem duplicação/lacuna e com índice sincronizado.
- Atualizados RG-34, plano BT-RADIO-01, README, changelog e auditoria técnica.

### Validação e limites
- CI iterativa revelou problemas reais em sequência: no SHA `f1655177d939563e013373f7c48230da4135d90d`, o gate falhou por regex de diário com escapes incorretos; em `f9d718a7d7a5fe555fea2d04fe1c83eeb8c55ae1`, o gate passou, mas TypeScript apontou TS18046 por acesso a `lastCause: unknown`, corrigido com erro local tipado.
- Em `43dda6925b6cb4acfef1cf177391a0b7b9731742`, `tests/regression.test.js` detectou duas tentativas RFCOMM simultâneas: a sonda extra do rádio havia ficado depois da leitura do bloqueio compartilhado. A verificação foi movida para antes do bloqueio em `2a5117a5566a0f993e7a45a20c19d0d92671b9c8`; o `validate` passou nos eventos push/PR [run 40185128970](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40185128970) e [run 40185132846](https://github.com/luizmarquesarruda/meriva-smart-diagnostic/actions/runs/40185132846). O build Android desses SHAs ainda estava em andamento no momento do registro, e a alteração deste diário/gate gera outro SHA com CI própria.
- Adicionada verificação de inventário para garantir que todos os arquivos `tests/*.test.js`, exceto o próprio `projectBaseline.test.js` (executado no gate separado), estejam conectados ao comando `npm test`.
- A proteção de `main` com required checks segue pendente porque a integração disponível não tem permissão para alterar branch protection (403).
- O teste da política é determinístico; não substitui teste do Galaxy A06/Android 16 com ELM327/ECU reais. Teste físico, confirmação de PIDs e autonomia em percurso permanecem pendentes.
- Nenhum merge executado.

### Matriz mínima antes de integrar
1. Atualizar PR candidata sobre o head efetivamente integrado e revalidar a sequência do diário.
2. Comparar o diff agregado #81–#84 e #89; resolver arquivos comuns de #82/#83 e #83/#89 sem remover contratos.
3. Executar gate, TypeScript, suíte completa e build Android no SHA final combinado.
4. Instalar o APK e validar Bluetooth, splash, navegação, resposta 010C e apenas PIDs anunciados/respondidos pela ECU.

## DB-127 · 2026-10-25 — CI como auditoria de regressão e cobertura completa das suítes

### Correções confirmadas pela CI
- A primeira revisão do novo gate apontou escape incorreto nas regex de sequência/índice; foi corrigido antes de concluir a validação.
- TypeScript detectou leitura de `lastCause.message` quando `lastCause` era `unknown`. Foi substituída por variável local `Error` tipada.
- A suíte `testBluetoothEventTransport` detectou um efeito colateral da correção: a verificação assíncrona do rádio entre a consulta do bloqueio e a abertura RFCOMM abriu uma janela de corrida. O rádio agora é verificado primeiro, e o mapa global de tentativa pendente é conferido logo depois, sem outro `await` entre a checagem do bloqueio e a criação/registro da tentativa.
- A suíte que detectou a corrida não foi relaxada nem removida; seu limite continua exigindo no máximo uma tentativa nativa concorrente por adaptador.
- As execuções no SHA `2a5117a5566a0f993e7a45a20c19d0d92671b9c8` passaram por `validate` nos eventos push e pull request; os builds Android estavam em andamento. Este novo commit de documentação/gate exige nova CI no SHA resultante.

### Controle adicional
- O gate agora compara o conjunto de arquivos `tests/*.test.js` com as suítes presentes em `npm test`, excluindo somente `projectBaseline.test.js`, que é executado como passo independente da CI. Isso impede que uma suíte seja esquecida do runner mesmo quando não estiver na lista de suítes obrigatórias.
- A sequência DB-001…DB-127 e o índice correspondente são validados automaticamente; a divergência anterior (índice terminando em DB-119 enquanto o corpo chegava a DB-125) foi reparada em DB-126.

### Limites restantes
- Branch `main` continua sem proteção confirmada e sem rulesets. A integração conectada devolveu 403 para alteração de proteção; checks obrigatórios precisam ser configurados nas regras do repositório.
- PRs #82/#83 continuam propostas concorrentes de navegação e PIDs; a consolidação precisa resolver o diff combinado antes de qualquer merge.
- Ainda não houve teste físico no Galaxy A06/Android 16 com ELM327/ECU reais. CI verde não comprova Bluetooth real, suporte de PID nem precisão da autonomia.
- Nenhum merge foi executado.

## DB-128 · 2026-10-25 — Revalidar bloqueio RFCOMM após cada espera e corrigir IDs RG duplicados

### Causa e ajuste
- Na tentativa anterior, a sonda de rádio passou a preceder a leitura do bloqueio compartilhado e o teste de duas instâncias voltou a passar. A releitura de três instâncias mostrou um risco residual: dois waiters podem acordar pela mesma promessa anterior e ambos presumir que o bloqueio está livre.
- O transporte agora repete, em loop, a sequência: consultar rádio → ler bloqueio compartilhado → aguardar tentativa anterior se existir → voltar ao início e revalidar rádio/bloqueio. A região entre o último bloqueio vazio e `connectToDevice` continua sem `await`, mantendo a criação/registro da tentativa como trecho síncrono.
- `tests/regression.test.js` agora abre três instâncias simultâneas para o mesmo endereço e exige três conexões concluídas, mas `bluetoothMaxNativeConnections === 1`. O teste não foi relaxado.
- O contrato tinha IDs duplicados: RG-34 era usado por Bluetooth e persistência; RG-35 por autosave e a nova persistência. Corrigido para RG-34 (rádio), RG-35 (persistência segura), RG-36 (autosave/GPS/estimadores) e RG-37 (waiters RFCOMM). O gate agora verifica IDs RG únicos e contínuos, além do índice/entradas DB-NNN.
- O plano de testes recebeu o caso de três instâncias simultâneas e de revalidação após await.

### Validação
- A correção de lock é uma alteração de comportamento nova. O SHA anterior `3bd9fd6c7721be706e920595d4991ea8e67d5bcf` tem CI própria em execução sobre os testes/gate/documentação da etapa anterior; não representa esta mudança de concorrência.
- Este registro gera um novo SHA; só sua execução CI completa com `validate` e `android-build` verdes pode aprovar o código. O teste físico Android 16 + ELM327/ECU reais continua pendente.
- A proteção de `main` permanece pendente por falta de permissão para configurar required checks. Nenhum merge foi executado.

## DB-129 · 2026-10-25 — GPS rejeita timestamps inválidos e fora de ordem

### Achado confirmado
- O rastreador GPS substituía timestamp inválido/não positivo por `Date.now()`. Isso transforma dado malformado em uma marca temporal aparentemente atual e pode alterar o cálculo do intervalo/distância em relação às próximas leituras.
- Timestamp repetido ou regressivo não era rejeitado antes de criar a amostra; o último ponto válido podia ser substituído por uma leitura temporalmente mais antiga.

### Correção
- `src/gps/gpsTracker.ts` agora descarta coordenadas inválidas, timestamp não finito/não positivo e timestamp menor ou igual ao último fix válido antes de atualizar qualquer estado.
- Removido o fallback para `Date.now()`; preserva-se o timestamp original somente quando válido.
- `tests/gps.test.js` cobre timestamp NaN, amostra atrasada, distância inalterada e recuperação ao chegar um timestamp crescente.
- RG-38, caso GPS-02, baseline e este diário documentam o contrato. O gate verifica que o fallback artificial não retorne.

### Validação
- A validação do SHA anterior `76360ad15466e5e7b0cb64a1b68e33d1814e5ee1` tinha `validate` verde e `android-build` ainda em execução. Esta correção gera novo SHA e exige uma execução CI completa própria; resultados anteriores não contam como aprovação.
- Teste físico de GPS e validação ELM327/ECU continuam pendentes. Nenhum merge foi executado.

## DB-130 · 2026-10-25 — Otimização CSV avaliada e bloqueada pela versão instalada

### Achado
- `src/database/csvLogger.ts` reescreve o conteúdo CSV existente em flushes de esquema estável, de modo que o custo cresce com o tamanho do histórico. O comentário dessa dívida técnica está mantido explícito no código.
- A documentação atual do Expo descreve append para a API legada, mas o projeto está fixado em Expo SDK 51 / `expo-file-system` 17. A CI de TypeScript rejeitou `append: true` porque o `WritingOptions` instalado não declara esse campo. A documentação mais recente, sozinha, não é evidência suficiente para ativar uma opção no pacote instalado.

### Decisão
- A tentativa de usar append foi revertida; o código não usa `as any` nem ignora o erro de TypeScript.
- A implementação compatível atual continua preservando registros, embora tenha custo O(tamanho do arquivo) por flush. A otimização deve ser retomada como tarefa separada com upgrade de SDK validado, API nativa compatível ou desenho de arquivos segmentados, e testes de leitura/exportação/migração.
- README e changelog não afirmam que append está implementado; o contrato de aceitação não inclui uma capacidade ainda não suportada.

### Evidência e estado
- A CI realmente rejeitou a alteração em `android-build`/typecheck no SHA experimental; o erro não foi contornado nem a suíte relaxada.
- Os resultados do SHA anterior `8ca18ce0103d949580a56dd158e8b993aa69e1ac` não validam as alterações subsequentes de tentativa/reversão e documentação. O SHA final desta consolidação precisa de CI própria.
- Nenhum merge foi executado. Testes em aparelho e validação ELM327/ECU continuam independentes da CI.


## DB-131 · 2026-10-25 — Atualização periódica de localização/clima baseada em conectividade

### Achado confirmado
- `app/index.tsx` chamava `loadCurrentConditions()` apenas uma vez, no primeiro mount da tela. Assim, clima/localidade não eram atualizados periodicamente e a volta da internet por dados móveis não disparava uma nova consulta.
- O projeto já contém `@react-native-community/netinfo`, usado para identificar conectividade; não era necessário introduzir uma dependência nova.
- O contrato permanece: localização não solicita permissão automaticamente; clima/cidade são enriquecimento opcional e não participam do diagnóstico OBD local.

### Correção implementada nesta branch
- Criado `src/weather/conditionsRefresh.ts` com início imediato quando há internet, refresh periódico de 15 minutos, atualização imediata após transição offline→online, cooldown de retry de 60 segundos e proteção contra chamadas simultâneas.
- Ligado o serviço ao NetInfo na tela principal para Wi-Fi e dados móveis (incluindo 4G/5G); inscrições e temporizador são removidos no unmount.
- Em falha de atualização após clima válido, a temperatura antiga deixa de ser apresentada como atual; somente a última localidade pode ser preservada com indicação explícita de dados desatualizados. Permissão revogada limpa a localização anterior.
- Criado `tests/weatherRefresh.test.js` para testar conectividade disponível/indisponível, retomada de rede, refresh periódico, ausência de spam, limpeza e retenção segura de localidade. O novo teste foi incluído em `npm test` e no gate de baseline.
- Adicionados os contratos RG-39 e NET-WEATHER-01 ao contrato anti-regressão e plano de testes.

### Validação e limites
- Commits criados na branch `fix/repository-audit-hardening-20261024` da PR #89. A CI deve ser verificada no HEAD final desta alteração; resultados de SHAs anteriores não contam como aprovação.
- Ainda não foi executado teste físico de geolocalização em Android 16 alternando Wi-Fi/4G/5G. A CI não comprova recepção GPS pelo provedor fused, disponibilidade da operadora nem funcionamento do ELM327/ECU reais.
- Nenhuma mudança foi mesclada em `main`. A atualização de clima é opcional e não deve afetar polling, conexão Bluetooth, autonomia ou diagnóstico local.

## DB-132 · 2026-10-27 — Cockpit sem duplicação de DTC; cartão substituído por pressão do coletor

### Solicitação
- Evitar repetir no cockpit o resumo de DTC, já disponível na página específica Saúde/Diagnóstico.
- Preservar o cartão de consumo e autonomia e preencher o terceiro cartão com outra informação útil, sem duplicação.

### Alteração
- `app/index.tsx`: removidos o estado e a contagem de DTC do cockpit; a tela Saúde continua responsável pelos DTCs.
- O terceiro cartão passa a mostrar pressão do coletor em kPa a partir do PID 010B, somente usando leitura real, finita e recente (até 30 s) com ECU conectada. Sem leitura válida, apresenta N/D; não infere nem simula valor.
- `tests/cockpitNavigation.test.js`: adicionadas verificações contra a repetição de DTC e para o uso de PID 010B e fallback N/D.
- Atualizados o contrato RG-08, o plano de testes e o changelog.

### Validação e limites
- A mudança está isolada na branch `ui/cockpit-instant-consumption-20261027`; não foi feito merge.
- A CI ainda precisa executar no HEAD final da branch. Nenhum teste automatizado, build APK ou inspeção visual no aparelho é declarado concluído nesta entrada.
- O PID 010B pode não estar disponível em todas as ECUs; nesse caso, N/D é o comportamento correto. DTC continua acessível na tela Saúde.


## DB-133 · 2026-10-28 — CI: reintegrar suíte de apresentação de saúde do ELM

### Achado confirmado
- A CI da PR #96 falhou no gate anti-regressão porque `tests/elmHealthPresentation.test.js` existia no diretório `tests/`, mas não estava incluído em `package.json` → `scripts.test`.
- O gate compara todas as suítes `tests/*.test.js` com os comandos executados por `npm test`; essa regra está correta e não deve ser enfraquecida.

### Correção
- Incluída a suíte `tests/elmHealthPresentation.test.js` no comando `npm test`, preservando o gate e as demais suítes.
- Na revisão do cartão de pressão, foi encontrado que a validação aceitava leituras `source: REAL` sem exigir `status: RESPONDEU`. O filtro agora exige resposta OBD válida além de valor finito, conexão ECU e idade máxima de 30 s; teste de regressão e RG-08 foram reforçados.
- Esta correção é limitada à integração do teste e não altera lógica de conexão ELM327 ou apresentação do cockpit.

### Validação e limites
- A alteração foi registrada na branch `ui/cockpit-instant-consumption-20261027` da PR #96.
- A nova execução de CI no SHA resultante é obrigatória; os resultados anteriores não validam este commit.
- Teste físico do ELM327/ECU e inspeção visual no Galaxy A06 continuam pendentes.


## DB-134 · 2026-10-28 — Corrigir contrato de layout obsoleto após remoção do DTC do cockpit

### Achado confirmado
- A CI do SHA `a4d2ef54d06850fcaf740a722bbc8b7b703b8f1f` executou `npm run doctor` (17/17) e o gate anti-regressão (PASS), mas `validate` falhou em `tests/orientationLayout.test.js:46`.
- O teste ainda exigia uma expressão de fallback de DTC na tela inicial, embora a decisão DB-132 tenha removido o resumo de DTC do cockpit e mantido a informação na tela Saúde. O contrato de teste ficou desatualizado em relação à mudança intencional de produto.

### Correção
- Substituída a asserção obsoleta por uma verificação explícita de que o cockpit não contenha resumo de DTC. A validação de DTC continua coberta pela tela Saúde e pelos testes de diagnóstico correspondentes.
- Não foi removido nem enfraquecido o gate de baseline; apenas alinhado o teste de layout com a arquitetura atual.

### Validação e próximos passos
- Commits da correção do contrato de teste: `aabc06bea4f93c479417f90101ac77095187d3af` e `93527a815a2c42de6e8ff15895a2abd512eca8f3`; a asserção final verifica diretamente a ausência de DTC no cockpit.
- A CI do novo HEAD deve concluir `validate` e `android-build` com sucesso antes de considerar a PR pronta.
- P0 continua bloqueado até CI verde no SHA exato e reconciliação da divergência entre a captura instalada e o layout do código. Testes físicos de Bluetooth/ECU, GPS e autonomia no Galaxy A06 seguem pendentes.
- Não houve merge. As tarefas P1/P2 permanecem na mesma frente consolidada; não abrir branch paralela.


## DB-135 · 2026-10-28 — Corrigir navegação icon-only no cockpit

### Achado confirmado
- A auditoria do código encontrou conflito entre o contrato RG-15/plano de testes (rótulos visíveis) e o teste `tests/cockpitNavigation.test.js`, que proibia explicitamente as legendas. A tela usava somente ícones, deixando a descoberta dos destinos dependente de memória do usuário, apesar de já existirem estilos de rótulo e nomes de acessibilidade.

### Correção
- `app/index.tsx`: adicionados rótulos visíveis Painel, Diagnóstico, Dados, Viagens e Mais às cinco abas, mantendo os ícones, rótulos de acessibilidade e alvos de toque existentes.
- `tests/cockpitNavigation.test.js`: removida a asserção contraditória e adicionada verificação dos cinco rótulos visíveis.
- `CHANGELOG.md` atualizado. O plano de testes já exigia rótulos visíveis e não precisou de alteração.

### Validação e limites
- Commits de código/teste: `7ce769c3b71ced1444f7556144c1bc1913f2754b` e `040bc92132b278ce10e1571305d8e19f9406aa9c`; changelog: `11238600e94d91dc6ff0ba75095e19130c4063be`.
- A CI do HEAD final precisa confirmar typecheck, suíte completa e build Android. A redução de lacunas e legibilidade deve ser inspecionada em retrato/paisagem; não declarar validação visual sem captura atual do app.
- Nenhum merge. A captura fornecida anteriormente ainda não foi reconciliada com a versão/build instalada.


## DB-136 · 2026-10-28 — Sincronizar índice do diário após as novas entradas

### Achado confirmado
- A CI do SHA `f705cb9e93ca91a3f784a7ea81a54b16b186e5de` falhou no gate anti-regressão porque DB-134 e DB-135 já existiam no corpo do diário, mas ainda não apareciam no índice sequencial. O gate corretamente compara as entradas DB-NNN com o índice.

### Correção
- Incluídas DB-134 e DB-135 no índice, preservando a sequência e os registros completos. O gate não foi alterado nem enfraquecido.

### Validação e limites
- Esta atualização documental gera novo HEAD e exige nova CI. Ainda não declarar `validate` nem `android-build` verdes até os jobs terminarem no mesmo SHA.
- Nenhum merge. A captura visual do app instalado e os testes físicos Android/ELM327/GPS continuam pendentes.


## DB-137 · 2026-10-28 — Fechar lacuna de índice detectada pela segunda execução da CI

### Achado confirmado
- A execução CI `40625197616` voltou a falhar no gate porque a entrada DB-136, que registrava a própria correção do índice, também não tinha sido acrescentada ao índice. O teste exige correspondência exata entre índice e todas as entradas, incluindo a entrada que corrige o índice.

### Correção
- Acrescentada DB-136 ao índice sequencial. A verificação de integridade não foi relaxada.

### Validação e limites
- Novo HEAD exige nova CI. A última execução falhou no gate antes de `validate`; isso não representa falha de TypeScript ou da suíte comportamental, pois essas etapas foram puladas.
- Não fazer merge até o novo HEAD passar pelo gate, `validate` e `android-build`.


## DB-138 · 2026-10-28 — Remover teste ELM órfão sem implementação correspondente

### Achado confirmado
- A CI `40625299840` passou pelo doctor (17/17) e pelo gate anti-regressão, mas `validate` falhou ao executar `tests/elmHealthPresentation.test.js`: o teste tentava abrir `src/obd/elmHealthPresentation.ts`, arquivo inexistente tanto na branch quanto em `main`.
- Busca no repositório confirmou que `formatElmQueueHealth`, `queueDepth` e as métricas de fila só apareciam nesse teste; a interface Bluetooth usa diretamente o snapshot real de saúde de `Elm327Session` e não consome esse formatter.

### Correção
- Removido o teste órfão e sua chamada em `package.json`, em vez de criar um módulo morto ou fingir que existe uma telemetria de fila que o transporte não fornece.
- A barreira anti-regressão continua exigindo que toda suíte `*.test.js` existente seja incluída em `npm test`; nenhuma regra do gate foi relaxada.

### Validação e limites
- Commits: `25943462950c0440ff923abf30101341c109b46e` (script) e `0049d1dcadbb4c6ac367b0da7441bb1367d1cab1` (teste órfão).
- Novo HEAD exige CI completa. O teste físico do ELM327/ECU e a inspeção visual Android permanecem separados da CI.
- Esta entrada substitui a hipótese anterior de DB-133 de que o teste órfão podia ser reintegrado apenas adicionando-o ao script.


## DB-139 · 2026-10-28 — Auditoria de obsolescência: reconciliar marca, arquitetura e framing ELM327

### Achados confirmados e correções
- O rótulo nativo `Smart OBD Diagnostic` diferia da marca do projeto MERIVA SMART, mas o gate `tests/projectBaseline.test.js` exige explicitamente que o app não fique preso ao nome Meriva. O nome nativo foi mantido genérico; README e changelog agora distinguem a marca do projeto da identidade do app. Slug, scheme e package Android continuam estáveis.
- O README tinha uma seção `Validação CI` de 2026-10-06 dizendo que o commit servia como gatilho técnico e afirmando delimiter CR, em contradição com o código vigente. A seção/meta repetidas foram removidas; o contrato operacional fica na seção de engenharia ELM327 e no playbook atual.
- `docs/ELM327_COMPATIBILITY_REVIEW_2026-10-05.md` descrevia delimiter CR real, retry default 2/infinito e ATI como obrigatório. Corrigido para o código/catalogação atuais: `delimiter: ''`, RX delimitado pelo prompt `>`, CR no TX, 20 tentativas-base finitas/8 s, `ATZ` obrigatório e `ATI` best-effort.
- `docs/ARCHITECTURE.md` descrevia quatro áreas genéricas e incluía DTC como conteúdo do cockpit. Atualizado para refletir as rotas existentes e a responsabilidade exclusiva da tela Saúde pelos DTCs.

### Itens avaliados e mantidos
- `plugins/withBluetoothLegacyPermissionLimits.js` está ativo em `app.json`; não é plugin órfão.
- `src/storage/backup.ts` é usado por Configurações e por testes de regressão; não é módulo morto.
- `app/testes-sensores.tsx` existe como rota operacional de testes; não foi eliminado por ser técnico.
- Dependências não foram removidas por simples ausência de import direto: Expo Router, ícones, plugins e pares nativos podem exigir dependência explícita.

### Débito de modernização identificado — não alterado nesta rodada
- O projeto usa Expo SDK 51 / React Native 0.74.5. A documentação oficial anuncia SDK 58 em 15/10/2026 e SDK 57 em 30/06/2026; SDK 51 é um baseline antigo. Fontes: https://expo.dev/changelog e https://expo.dev/sdk
- O projeto usa a família legada de métodos de `expo-file-system` (`readAsStringAsync`, `writeAsStringAsync`, etc.). A documentação mais recente separa a compatibilidade antiga em `expo-file-system/legacy`: https://docs.expo.dev/versions/latest/sdk/filesystem-legacy/
- O pacote `react-native-bluetooth-classic` instalado `1.73.0-rc.17` aparece como tag latest na página npm consultada, mas continua sendo release candidate: https://www.npmjs.com/package/react-native-bluetooth-classic
- Não atualizar Expo/FileSystem/Bluetooth como correção isolada. Próximo bloco de modernização deve ser dedicado, por etapas, com lockfile, Expo Doctor, TypeScript, suíte completa, APK e testes físicos de pareamento, framing CR/`>`, ECU `010C`, GPS e persistência. Preservar SDK 51 na PR de cockpit até a baseline física estar documentada.

### Validação e limites
- As correções foram consolidadas nesta frente da PR #96, sem abrir branch paralela nem fazer merge.
- Conferir a CI do novo SHA: o resultado verde anterior pertence ao SHA base e não aprova estas alterações.
- Nenhum arquivo foi removido nesta auditoria por heurística de nome; exclusões anteriores foram apenas o teste ELM órfão comprovadamente sem módulo de implementação e continuam documentadas em DB-138.


## DB-140 · 2026-10-28 — Auditoria da rede móvel e dos provedores de localização

### Pergunta e fontes
- Investigar o uso das informações 4G/5G para localização, GPS, velocidade e autonomia sem presumir que a rede celular fornece coordenadas confiáveis.
- Documentação consultada: Android ConnectivityManager/NetworkCapabilities (https://developer.android.com/develop/connectivity/network-ops/reading-network-state), Expo NetInfo (https://docs.expo.dev/versions/latest/sdk/netinfo/), Expo Location `getProviderStatusAsync()`/`LocationProviderStatus` (https://docs.expo.dev/versions/latest/sdk/location/), permissões de localização Android (https://developer.android.com/develop/sensors-and-location/location/permissions?hl=pt-br) e Android `TelephonyManager.getAllCellInfo()` (https://developer.android.com/reference/android/telephony/TelephonyManager#getAllCellInfo()).

### Estado encontrado
- O app já recebe eventos de conectividade e identifica o tipo de transporte, geração móvel informada, disponibilidade de internet e informação de conexão tarifada por meio de NetInfo.
- O enriquecimento opcional de clima/localidade já atualiza após reconexão e a cada 15 minutos, com cooldown e uma única solicitação em voo. Esse fluxo não altera o ciclo OBD.
- O rastreador de viagem já solicita localização de alta precisão e valida precisão, timestamp e segmentos consecutivos. A lacuna era a falta de visibilidade na tela Conectividade sobre os estados dos provedores Android.
- NetInfo não fornece RSSI celular nem coordenada de torre. `networkAvailable` do Android indica disponibilidade do provedor de localização por rede; não garante que o último fix tenha usado essa fonte nem que seja preciso.

### Implementação
- Criado `src/network/locationProviders.ts` para normalizar `locationServicesEnabled`, `gpsAvailable` e `networkAvailable`. Valores ausentes ou malformados continuam desconhecidos, sem conversão para verdadeiro/falso.
- `app/conectividade.tsx` consulta `Location.getProviderStatusAsync()` na abertura da tela e ao atualizar o estado da rede, mostrando os serviços de localização, GPS/GNSS e provedor por rede sem solicitar permissões extras.
- Criado `tests/locationProviders.test.js` para serviços ativados/desativados, GPS disponível sem provedor de rede e campos ausentes/inválidos; incluída em `npm test`.
- Criado `docs/AUDITORIA_REDE_MOVEL_E_LOCALIZACAO_2026-10-28.md` com matriz de usos, limites, regras de aceitação e documentação oficial.

### Decisão de engenharia
- 4G/5G e mudanças de conectividade são gatilhos para atualizar dados online opcionais e ajudar a diagnosticar os provedores Android; não são dados para calcular posição, velocidade, distância, consumo ou autonomia.
- Não adicionar agora leitura de IDs de células/dBm. Isso exigiria outra camada nativa e avaliação específica de permissões, privacidade, compatibilidade e utilidade; dados de célula podem não estar atualizados e não substituem um fix de viagem validado.
- Não criar um segundo watcher de localização nem alterar o cálculo de distância. Qualquer futura tentativa de recuperar posição quando o fix estiver antigo deve ser limitada, coordenada com o GpsTracker existente e protegida contra callbacks duplicados.
- Falhas de rede/provedor não podem interromper a sessão Bluetooth/ELM327, a fila serial, o diagnóstico local ou a persistência.

### Validação e limites
- O código e os testes foram adicionados à branch `ui/cockpit-instant-consumption-20261027` da PR #96; CI do HEAD resultante obrigatória para gate anti-regressão, TypeScript, suíte completa e build APK.
- Não considerar a mudança validada até os jobs ficarem verdes no mesmo SHA e a tela ser conferida em APK instalado no Galaxy A06/Android 16.
- Esta alteração não comprova a disponibilidade real de GPS/rede do aparelho e não resolve, por si só, os problemas físicos pendentes de GPS ou ELM327/ECU.


## DB-141 · 2026-10-28 — Auditoria profunda de PIDs, interpretação e integridade da IA local

### Fontes e método
- Revisado o diário e o contrato anti-regressão antes das alterações, seguido de leitura estática cruzada entre `pids.json`, `formulas.json`, `ranges.json`, `sensor_tests.json`, `polling_policy.json`, `meriva_confirmed_pids.json`, parser, banco/autosave, tela Saúde, Laboratório, sensor-test engine e exportação TXT.
- Documentação técnica consultada: SAE J1979-DA revisão J1979DA_202608 (https://saemobilus-test.cld.sae.org/standards/j1979da_202608-j1979-da-digital-annex-e-e-diagnostic-test-modes); ISO 15031-5:2015, confirmada como atual após revisão em 2026 (https://www.iso.org/standard/66368.html); decodificação customizada de python-OBD (https://python-obd.readthedocs.io/en/latest/Custom%20Commands/); mapa de bits de PID 0101 (https://obd2pid.com/pids/01-01); NIST AI RMF (https://www.nist.gov/itl/ai-risk-management-framework).
- Relatório da rodada: [AUDITORIA_PIDS_IA_2026-10-28.md](AUDITORIA_PIDS_IA_2026-10-28.md).

### Auditoria estrutural dos catálogos
- Confirmada estrutura: 34 PIDs, 20 fórmulas, 34 faixas e 30 testes/avaliações de sensores. Não foram encontrados IDs duplicados nem PIDs sem fórmula/faixa; os testes de sensor não apontam a PID ausente do catálogo.
- Quatro PIDs não têm teste dedicado: 0101 (estado/readiness), 0130 (contador de ciclos), 0131 (distância desde limpeza) e 0151 (enumeração de combustível). Não se inventou um teste de sensor analógico para esses parâmetros.
- Só 010C tem evidência RAW_ECU documentada especificamente para a Meriva; dez outros PIDs são candidatos, não confirmações. Não expandir o catálogo em massa: a descoberta ocorre em fila serial e deve respeitar tempo de polling, K-Line, payloads, fórmulas, unidades, faixas e evidência por ECU.
- Confirmado que as faixas atuais são limites amplos de codificação/plausibilidade, não valores de operação saudável OEM. Exemplo: o máximo matemático do PID 0143 pode alcançar 25.700% pela escala U16; isso não representa uma condição fisicamente normal.

### Falhas encontradas e correções
- `src/diagnostics/diagnosticEngine.ts`: antes desta rodada, o motor local não exigia diretamente idade máxima para as observações recebidas. Agora usa limite padrão de 45 s, timestamp válido não futuro, número finito, PID normalizado e faixa catalogada; rejeita origem desconhecida/importada, simulação/seed, valores derivados e amostras inválidas/antigas. Expõe contadores de observações aceitas/bloqueadas.
- A origem é agora normalizada explicitamente. A compatibilidade `REAL` só vale para o contrato local de `LastPidReading`; origem desconhecida é `IMPORTADO` e não pode ser promovida a `REAL_OBD` por exclusão de `SIMULACAO`.
- DTCs marcados `historical=true` são bloqueados para hipóteses atuais, mesmo se um registro legado tiver `status=CONFIRMED`. A mesma evidência duplicada não aumenta o score.
- Contrato de resultado do motor alterado para v2. Telas e TXT nomeiam score/LOW-MEDIUM-HIGH como pontuação/nível qualitativo heurístico, não probabilidade estatística.
- `app/saude.tsx` usa `getSharedObdStatus().ecuConnected`, fonte do estado atual de resposta da ECU. Ausência de hipóteses sem ECU respondendo e evidência atual suficiente resulta em “DADOS INSUFICIENTES”, não em falsa declaração de normalidade.
- `src/obd/parser.ts`: interpretação de PID 0101 ajustada para aplicar os bits de suporte e prontidão em conjunto e separar mapas de ignição por centelha/SI de ignição por compressão/CI. Em dados, 0101 passa a aparecer como “STATUS OBD-II”, e sua interpretação legível é preservada no autosave e no TXT.
- `src/diagnostics/sensorTestEngine.ts`: timestamps inválidos/futuros e números de tentativa duplicados não contam para a série de teste. Mantido o requisito de cinco tentativas distintas e cinco respostas válidas.

### Testes e documentação
- Estendidos `tests/diagnosticEngine.test.js`, `tests/pidParserIntegrity.test.js`, `tests/sensorTestEngine.test.js` e `tests/merivaAutosave.test.js` para frescor, futuro, PID com espaços, derivação, DTC histórico/duplicado, decode de SI/CI de 0101 e persistência da interpretação.
- Reforçado `tests/projectBaseline.test.js` para proteger os contratos de origem/frescor, status vivo da ECU, semântica do PID 0101, RG-40/RG-41 e PID-AI-01.
- Adicionados RG-40 e RG-41 em `docs/CONTRATO_ANTI_REGRESSAO.md`, seção PID-AI-01 em `docs/TEST_PLAN.md`, changelog e este relatório.
- Nenhuma dependência, SDK Expo ou fluxo Bluetooth foi alterado; nenhum merge foi executado.

### Validação / pendências
- A CI deve ser consultada novamente no HEAD final desta série documental/código. Nenhum resultado anterior à última alteração serve como prova do SHA final. Critério: gate anti-regressão, TypeScript, suíte completa e `android-build` verdes no mesmo SHA.
- Depois da CI, inspecionar o APK em Galaxy A06/Android 16 e conferir os novos textos/status no app. A interpretação de PID 0101 é coberta por testes automatizados, mas ainda requer inspeção de interface instalada.
- Validação física do ELM327/ECU real permanece pendente; a resposta `010C` em 2026-10-27 foi timeout, então nenhum PID candidato está fisicamente confirmado por esta rodada.
- Não inferir precisão de sensor a partir da bitmap, da fórmula, da ausência de DTC ou do score local. Próxima fase de IA deve ampliar a corroborabilidade e avaliar falsos positivos/negativos em dados reais rotulados, não simplesmente adicionar mais regras ou PIDs.



## DB-142 · 2026-10-28 — Corrigir polaridade da prontidão no PID 0101

### Achado confirmado em documentação bit a bit
- O cruzamento da tabela do PID 0101 no padrão J1979 com o parser revelou que os bits de prontidão do byte D estavam invertidos na lógica. Nos bits contínuos do byte B, bit de incompletude em 1 significa incompleto. Já no byte D, bit de prontidão em 1 significa concluído/pronto e bit 0 significa não concluído. Fonte pública técnica consultada: https://www.dashlogic.com/docs/technical/obdii_pids (tabela Mode 01 PID 01, bytes B–D, linhas 83–133 na consulta) e https://obd2pid.com/pids/01-01 (mapa dos bits, revisado em 2026-08-31).
- Consequência: a implementação anterior podia exibir monitor concluído como incompleto, confundindo a prontidão OBD com defeito.

### Correção aplicada
- `src/obd/parser.ts`: os monitores não contínuos por SI e CI agora são tratados como incompletos quando o bit D correspondente é zero e o bit C correspondente confirma suporte. O bit de incompletude do byte B mantém a polaridade inversa definida para os três monitores contínuos. Bits reservados ou monitores não suportados não criam alertas.
- `tests/pidParserIntegrity.test.js`: ampliados casos separados para SI pronto/incompleto, CI, monitor não suportado e verificação dos campos específicos. Fixtures corrigidas para que o bit B3 represente SI ou CI intencionalmente; não se assume tipo de motor a partir de outros bytes.
- Atualizados `docs/AUDITORIA_PIDS_IA_2026-10-28.md` e `CHANGELOG.md`.

### Validação e limites
- A nova alteração exige CI do HEAD final com gate, TypeScript, todas as suítes e build Android verdes.
- Este teste prova a interpretação do bitmap sintético, não o estado de prontidão atual da ECU da Meriva. A sessão física e a resposta real de PID 0101 continuam pendentes.
- A correção não altera fórmula de PID nem fluxo de polling; é uma correção semântica de bitmask de segurança diagnóstica.



## Continuidade — correção da CI e rotulagem diagnóstica (2026-10-28)

- Auditoria da execução CI no SHA `3a19b1cc6113ffc315dee81f945a4b84f4205dd9`: o job `validate` falhou em `tests/diagnosticEngine.test.js:133` com `ReferenceError: Cannot access 'nowMs' before initialization`; `android-build` foi ignorado por depender da validação.
- Correção aplicada na frente única da PR #96: mover a inicialização do relógio de teste para antes do primeiro uso; nenhum limiar ou fórmula diagnóstica foi alterado.
- Tela Saúde: substituir o símbolo de porcentagem por escala heurística `0–100` e rotular o nível como qualitativo, explicitando que não é probabilidade estatística.
- Validação pendente: aguardar nova CI no SHA resultante; confirmar `validate` e `android-build` verdes no mesmo SHA. Nenhum merge foi executado.
- Teste físico em Galaxy A06/Android 16/ELM327 real continua pendente; CI não substitui verificação da conexão e da resposta `010C`.


## DB-143 · 2026-10-28 — Aplicativo pessoal, independente e sem conta/login

### Decisão
- O MERIVA SMART é de uso pessoal, instalado como APK Android. Não será preparado como produto distribuído a terceiros.
- Não criar fluxo de cadastro, login, conta de usuário, autenticação remota ou dependência de um serviço em nuvem.
- O aplicativo não se conecta ao Bubble. Nenhuma alteração foi feita no app Bubble.
- O uso principal é local e offline: conexão Bluetooth Classic com ELM327, diagnóstico, PIDs, fórmulas, GPS/autonomia e histórico.

### Conhecimento técnico preservado para implementação independente
- Manter identificadores estáveis para eventos locais e evitar duplicação em retries da fila offline.
- Validar bytes OBD no intervalo 0–255 e distinguir suporte declarado de resposta real da ECU.
- Manter SQLite local como fonte de verdade para histórico e dados persistentes; não depender de rede para diagnóstico.
- Preservar validação temporal e geográfica do GPS, incluindo os três segmentos válidos exigidos para confirmar movimento.
- PID 012F continua autoritativo para nível de combustível quando válido; PID 015E continua sendo taxa de combustível em L/h, sem copiar fórmulas experimentais do Bubble.

### Escopo
- Removida a camada experimental de cliente Bubble, seus contratos, testes e documentação específica.
- Não adicionar chamadas HTTP, credenciais, provisionamento de dispositivos ou telas de login/cadastro.
- Recursos de backup/exportação devem ser locais e iniciados pelo usuário. Integrações futuras só podem ser consideradas se forem explicitamente solicitadas; não fazem parte do escopo atual.

## DB-144 · 2026-10-28 — Navegação por categorias, ícones e qualidade dos dados

- Reorganizada a central “Mais Recursos” em cinco grupos iconográficos: diagnóstico/conexão; veículo/condução; dados/aprendizado; histórico/relatórios; sistema/preferências. Mantidos os destinos nativos existentes e acrescentado atalho para telemetria em tempo real.
- Criado o componente compartilhado `SourceStatusLegend` para explicar cinco estados: medido, estimado, referência, simulado e indisponível. O componente é explicativo: não altera a classificação nem fabrica leituras.
- Inserida a guia em telemetria, viagens e histórico local; viagens e exportações ganharam marcadores visuais por ícones compartilhados. Exportação e limpeza continuam locais.
- Mantidos o tema escuro, os ícones Ionicons já instalados, o comportamento retrato/paisagem e os fluxos sem cadastro, login ou Bubble.
- Adicionado teste de regressão ligado a `npm test` cobrindo os cinco grupos, destinos, ícones e rótulos de qualidade.
- Validação desta alteração depende da CI do novo SHA; isto não atesta teste físico com ELM327 nem APK instalado.

## DB-145 · 2026-10-28 — Corrigir leitura KWP, retry e classificação do estado ECU/Bluetooth

- Causa identificada no código: o parser da branch não reconhecia o quadro KWP compacto 84F111410C0000D3; a resposta positiva 41 0C 00 00 não passava pelo gate de validação da ECU. O trace comprova uma resposta no instante capturado, não suporte a outros PIDs nem condição mecânica do motor.
- Parser: adicionados caminhos compacto e espaçado KWP com comprimento declarado e checksum aditivo; preservadas as correções já presentes para PID 0101. Respostas truncadas, checksum incorreto e bytes excedentes continuam rejeitados.
- Conexão: retry padrão ajustado para 3 tentativas por adaptador com intervalo de 1500 ms; após falha conclusiva no PID 010C, avançar ao próximo dispositivo pareado em vez de repetir a mesma varredura. O fallback inclui J1850 PWM/VPW e a recuperação usa o protocolo identificado, incluindo KWP slow/fast, em vez de adivinhar ATSP5.
- Gate: a recuperação só confirma ECU quando parsePidResponse para 010C retorna resposta válida com valor finito e payload completo. A CI deve ser consultada no HEAD final; não reutilizar o resultado de SHA anterior.
- Cockpit: se o PID 010C não tiver resposta válida, mostrar ECU SEM RESPOSTA e orientar a consultar o RX, sem rotular automaticamente como rádio Bluetooth desligado. O placeholder sem PID não é apresentado como OBD 1/1.
- Dados e limitações: N/D permanece correto para autonomia, temperatura e PIDs sem leitura REAL recente. Conexão física com Galaxy A06/Android 16 + ELM327/ECU real, inspeção do APK instalado e confirmação de 010C continuam pendentes de ensaio físico.
## DB-146 · 2026-10-28 — Restaurar quadrantes 2×2 e paginação de PIDs no cockpit

- **Regressão identificada:** o cockpit concentrava o indicador principal em um único mostrador de alternância temporal, com apenas três cartões auxiliares e um cartão de arrefecimento separado. Isso escondia a leitura simultânea dos quatro indicadores principais.
- **Alteração:** restaurada a grade 2×2 com temperatura do motor (0105), tensão do sistema (0142), posição da borboleta (0111) e rotação (010C) sempre visíveis no primeiro conjunto. O cartão duplicado de arrefecimento foi removido; temperatura continua disponível no quadrante.
- **Sem perda dos PIDs extras:** indicadores adicionais anunciados pela ECU continuam em páginas de quatro; anomalias recebem prioridade, a alternância ocorre a cada 10 segundos e o cabeçalho permite avançar por toque.
- **Integridade de dados:** cada quadrante usa somente leitura real, respondida, finita e recente. Se a ECU estiver desconectada ou o PID não for anunciado/estiver sem amostra válida, o quadrante permanece visível com N/D e motivo explícito. Nenhum seed é usado como telemetria atual.
- **Validação:** adicionados testes unitários para paginação, retorno circular, grade 2×2 e barreira anti-regressão. A CI do novo SHA e o build standalone devem passar antes de integrar; o teste físico no Galaxy A06/Android 16 continua separado.
 
## DB-147 · 2026-10-28 — Incluir os PIDs restantes no carrossel principal com navegação por setas

- **Comportamento solicitado:** o painel principal deve incluir os demais PIDs, não apenas os quatro indicadores fixos. A grade continua exibindo quatro quadrantes simultâneos, enquanto os outros PIDs suportados percorrem páginas no mesmo carrossel.
- **Primeira página estável:** temperatura (0105), tensão (0142), posição da borboleta (0111) e RPM (010C) ficam sempre na primeira página. A priorização de alertas se aplica aos PIDs adicionais e não retira um dos quatro principais do cockpit inicial.
- **Carrossel completo:** todas as métricas suportadas/catalogadas entram na sequência sem duplicação; cada página tem até quatro itens. Setas acessíveis anterior/próxima complementam a rotação automática de 10 segundos. Navegação circular volta ao início.
- **Integridade:** PIDs não anunciados não são tratados como suportados. Todos os valores continuam dependendo de leitura real, resposta válida e janela de frescor; sem evidência, o indicador permanece em N/D.
- **Proteção contra regressão:** a suíte percorre os 20 PIDs da política em páginas de quatro, verifica que não há PID saltado nem repetido e preserva a ordem fixa da primeira página. A CI do novo SHA precisa validar testes e build Android antes de distribuir qualquer APK.


## DB-148 · 2026-10-28 — Auditoria e correção de cockpit em orientação paisagem

- Auditoria: app.json permite orientação padrão e app/_layout.tsx chama ScreenOrientation.unlockAsync com listener removido no cleanup; o bloqueio global do Android continua sob controle do usuário. useMidLayout() recalcula layout.landscape usando useWindowDimensions(), portanto não era necessário impor orientação fixa.
- Falha de layout identificada: a tela empilhava cabeçalho, clima, grade 2×2, sessão e navegação; em modo paisagem, a altura reduzida podia fazer o cockpit/navegação exceder a área visível. O espaçador elástico agravava o risco.
- Correção: cabeçalho/clima agora dividem a faixa superior; cockpit e sessão de conexão dividem a largura; o cockpit ocupa a área flexível e a sessão usa coluna compacta; navegação vira raia lateral de 50 dp, com cinco destinos compactos.
- Densidade: quadrantes reduzem fonte, padding e hints a uma linha em paisagem; o cabeçalho/instrução do carrossel e os cartões auxiliares de consumo, autonomia e pressão também usam modo compacto. O espaçador é limitado a 4 dp, evitando que consuma altura útil. Retrato permanece com fluxo vertical anterior.
- Proteções: testes cobrem orientação padrão livre, liberação da orientação, estilos de paisagem, raia de navegação e cinco destinos visíveis. O checklist físico exige rotação retrato→paisagem→retrato, carrossel/setas e ausência de clipping/sobreposição.
- Limite conhecido: a aplicação não deve forçar a rotação se a opção Rotação automática do Android estiver desligada. A validação de layout automatizada não substitui o teste visual no dispositivo real; o APK final depende da CI do SHA atualizado.

## DB-149 · 2026-10-28 — Quadrantes adaptáveis em ambas as orientações

- Requisito complementar: a rotação adapta a página inicial inteira, não só a navegação. Os quatro quadrantes principais devem continuar simultaneamente visíveis em grade 2×2, com dimensões, espaçamentos e tipografia compactados em paisagem; valores, unidades, rótulos e estados N/D não podem ser cortados nem sobrepostos.
- A barra de navegação permanece inferior em retrato e passa para a lateral direita em paisagem. A reorganização deve usar dimensões correntes da janela e preservar a sessão e leituras de PIDs.
- Corrigida a asserção obsoleta de `tests/orientationLayout.test.js`: o estilo atual define altura mínima de 54 dp para os cartões em paisagem, não 58 dp. Ampliadas as proteções automatizadas para grade responsiva, estilo da grade/cartões em paisagem e limite de linhas.
- Esta alteração documenta e testa o contrato; não prova CI verde nem substitui inspeção física no Galaxy A06. Validar `validate` e `android-build` no SHA final e executar retrato→paisagem→retrato no aparelho antes de merge.


## DB-150 · 2026-10-28 — Auditoria crítica de layout e duplicações de conteúdo

- **Falha inicial da CI:** o teste de orientação procurava a aplicação do estilo do quadrante em uma única linha, embora o JSX estivesse formatado em várias linhas. O teste foi ajustado para aceitar quebras de linha, mantendo a verificação do vínculo entre o cartão e o layout em paisagem.
- **Duplicação na Central de Saúde:** contadores de timestamps duplicados, DTCs antigos e amostras aceitas estavam renderizados duas vezes. Foi preservada uma ocorrência de cada indicador. Os estados Bluetooth/ECU agora vêm de `getSharedObdStatus()`, não dos campos persistidos do autosave.
- **Informação redundante no cockpit:** o cabeçalho repetia a mensagem completa de conexão já apresentada no cartão de sessão. O cabeçalho passou a mostrar um status compacto, enquanto o cartão de sessão mantém a explicação acionável.
- **Resumo operacional repetido no Laboratório:** foi removido o painel de viagem com distância GPS, consumo, PID 015E e autonomia, já resumidos no cockpit/Dados e detalhados em Viagens. O painel podia exibir distância zero sem viagem real e rotular “GRAVANDO” apenas após conectar, confundindo sessão OBD com registro de trajeto. Foram removidos os estados e estilos órfãos associados.
- **Duplicação de viagens no Armazenamento:** eliminada a segunda lista de seis viagens, substituída por link para o relatório canônico `/viagens`. A tela fica dedicada a quota, fila CSV, exportações e limpeza.
- **Espaço final incorreto no Laboratório:** removido o padding inferior de 132 dp que reservava altura para uma barra fixa não renderizada. O padding passa a 30 dp. Corrigido ainda um fechamento redundante de `View` que havia sido introduzido ao trocar a lista de viagens por um atalho.
- **Arquitetura de navegação ainda merece acompanhamento:** Bluetooth e Laboratório mantêm fluxos de conexão distintos (seleção explícita em Bluetooth e tentativa automática de candidatos no Laboratório), embora publiquem a sessão compartilhada. Não foi feita uma consolidação do ciclo de vida nesta rodada para não arriscar regressão de RFCOMM/ECU; registrar como prioridade separada para uma alteração isolada com testes de conexão.
- **Validação:** a CI do SHA anterior `e9229232dc518567c04e12106b5d55c8cc242cff` ainda estava em execução no momento da auditoria. Este registro não declara a nova versão aprovada. Exigir `validate` e `android-build` verdes no SHA final, revisar o diff contra `main` e executar a rotação retrato→paisagem→retrato e a inspeção das telas no Galaxy A06. O teste físico com ELM327/ECU permanece separado.


## DB-151 · 2026-10-28 — Remoção do setter órfão após consolidar o Laboratório

- A primeira CI após remover o resumo de viagem do Laboratório encontrou `TS2304: Cannot find name 'setTripFuelSupported'` no caminho de erro de conexão.
- Causa: a declaração de estado e suas atualizações normais foram eliminadas junto com o painel duplicado, mas uma chamada residual no bloco de erro permaneceu.
- Correção: removida a última chamada ao setter que não tinha mais estado correspondente. O estado de erro geral e o encerramento da sessão continuam preservados.
- Validação ainda depende da CI do novo SHA; não interpretar TypeScript corrigido como build Android ou ensaio físico aprovado.


## DB-152 · 2026-10-28 — Unificar marca visual entre cockpit e tela Viagens

- A inspeção de todos os mastheads identificou que o cockpit e a splash usam a identidade genérica `SMART OBD` / `SMART OBD DIAGNOSTIC`, enquanto a lista de viagens introduzia isoladamente `MERIVA SMART DIAGNOSTIC`.
- Corrigido o masthead de `app/viagens.tsx` para `SMART OBD DIAGNOSTIC`. Mantido o nome de pacote Expo existente, cuja regra de baseline exige marca genérica; não houve alteração de applicationId, slug ou dados de perfil do veículo.
- Adicionada asserção anti-regressão para impedir o reaparecimento de uma marca divergente na tela secundária.
- Resultado visual no dispositivo e CI do SHA final ainda precisam ser validados; nenhuma afirmação de teste físico decorre desta alteração.


## DB-153 · 2026-10-28 — Corrigir contrato de altura da tipografia do cockpit em paisagem

- A CI voltou a falhar em `tests/orientationLayout.test.js`: a asserção exigia `lineHeight:23` para o valor dos quadrantes, mas o estilo de paisagem vigente usa `fontSize:21,lineHeight:22`.
- A inspeção do estilo e do JSX confirmou que a divergência era apenas do teste. Atualizada a expectativa para 22 dp, preservando a tipografia compacta que reduz a altura ocupada.
- A CI precisa ser reavaliada no novo SHA, pois ainda pode revelar outras expectativas obsoletas. APK build e validação visual no Galaxy A06 continuam pendentes até a CI passar.


## DB-154 · 2026-10-28 — Mover teste de integridade de viagens para a tela canônica

- A regressão `histórico sem seed e consumo N/D` ainda testava os filtros de origem/combustível em `app/armazenamento.tsx`, local da lista redundante removida.
- A proteção foi realocada para `app/viagens.tsx`, que agora é a tela canônica de histórico. O teste verifica a filtragem de `REAL_OBD`, os limites de validade de combustível e a apresentação `CONSUMO N/D`; também verifica que Armazenamento não volte a renderizar a lista duplicada.
- A alteração preserva a verificação de integridade de dados, muda apenas o arquivo alvo conforme a arquitetura atual. CI do SHA seguinte continua obrigatória.


## DB-155 · 2026-10-28 — Diferenciar armazenamento de histórico de viagens

- O teste de integridade foi transferido para `app/viagens.tsx`, a tela canônica, mas a primeira formulação da expressão regular ficou escapada em excesso e não correspondia ao código-fonte. Corrigida para testar a expressão `filter(cycle => cycle.source === 'REAL_OBD')` de forma realista.
- Após remover a lista duplicada, a tela Armazenamento ainda se intitulava “HISTÓRICO E DADOS” e a categoria Mais a chamava “HISTÓRICO E RELATÓRIOS”, embora a lista detalhada de viagens esteja em Viagens. Renomeados o título, subtítulo, grupo e atalho para “ARMAZENAMENTO E EXPORTAÇÃO” / “ARQUIVOS E EXPORTAÇÃO”.
- A tela de Armazenamento fica dedicada a espaço local, fila CSV, limpeza e formatos exportados; a tela Viagens continua como local único da lista, detalhes e análise por percurso.
- Não houve alteração dos formatos nem dos dados persistidos. A CI do SHA novo ainda deve comprovar os testes e o build Android.


## DB-156 · 2026-10-28 — Remover cópia do perfil do veículo em Configurações

- A comparação de telas identificou que Configurações repetia o nome do veículo, motorização, capacidade do tanque e reserva já expostos em Veículo. Os dados eram estáticos/contextuais e ocupavam espaço no final da tela de preferências.
- Removida a cópia textual e substituída por um atalho acessível `VER PERFIL DO VEÍCULO` para `/veiculo`. Nenhum campo de perfil ou dado persistido foi alterado.
- Acrescentada barreira de regressão para impedir o reaparecimento da cópia e manter a tela canônica como única fonte visual dos detalhes físicos.
- CI do novo SHA e validação no aparelho continuam pendentes; esta alteração não declara build APK nem validação física.


## DB-157 · 2026-10-28 — Tornar robustas as asserções da navegação do perfil

- As novas asserções do perfil em Configurações tinham escaping excessivo nos padrões de caminho e propriedades, arriscando validar uma expressão textual diferente da pretendida.
- Substituídas por verificações de substring explícitas para `href="/veiculo"` e para os campos que não devem ser duplicados. A proteção continua verificando o contrato real, sem depender de escape de regex.
- A CI do SHA seguinte precisa confirmar a suíte completa e o build Android; não declarar aprovação a partir apenas da inspeção estática.


## DB-158 · 2026-10-28 — Melhorar legibilidade da tipografia em paisagem

- A inspeção de `app/index.tsx` encontrou rótulos/hints de quadrantes e rótulos auxiliares com `fontSize:6` em paisagem. O encaixe espacial era obtido com texto pequeno demais para o cockpit.
- Aumentados os rótulos e dicas dos quadrantes para 8 dp (line-height 9), instrução do carrossel para 7 dp e rótulos auxiliares para 7 dp (line-height 9). Mantidas a grade 2×2, altura mínima do cartão e o contador/carrossel.
- Acrescentados testes e contrato para proteger esse limite de leitura. A aprovação final ainda depende da CI do SHA e de inspeção visual no Galaxy A06, incluindo rotação retrato→paisagem→retrato para confirmar ausência de clipping.


## DB-159 · 2026-10-28 — Atualizar teste do hub após separar armazenamento e viagens

- A CI encontrou em `tests/sourceStatusLegend.test.js` uma expectativa antiga para a categoria `HISTÓRICO E RELATÓRIOS`. A categoria foi renomeada intencionalmente para `ARQUIVOS E EXPORTAÇÃO` porque a tela não apresenta mais uma lista de viagens; o histórico completo passou a ter um destino único em `/viagens`.
- Atualizado o contrato do hub para o novo nome e reforçado que a tela de armazenamento mantém sua função de quota, arquivos, exportação e limpeza, sem renderizar `VIAGENS SALVAS`.
- O teste não foi removido: foi adaptado à organização atual e conserva as verificações de ícones, rotas e legenda de qualidade de dados. CI completa no novo SHA continua obrigatória.


## DB-160 · 2026-10-28 — Centralizar hipóteses da IA na tela Saúde

- A revisão comparativa confirmou que `app/laboratorio.tsx` e `app/saude.tsx` calculavam e apresentavam as mesmas hipóteses locais, evidências, próximos testes e contadores de integridade a partir da telemetria em RAM.
- A Central de Saúde fica como apresentação canônica de hipóteses e evidências. Removidos do Laboratório o cálculo duplicado via `runLocalDiagnostic`, a montagem paralela de observações e o painel correspondente; adicionada ligação acessível para `/saude`.
- Mantidos no Laboratório os fluxos de consulta manual de PID, descoberta, varredura completa de DTC, validação de fórmulas, TX/RX e contexto operacional em detalhes técnicos. Não foi removido código de aquisição nem de persistência OBD.
- Removidos os estilos órfãos ligados ao painel eliminado. Adicionada regressão para impedir retorno do motor/painel duplicado no Laboratório e confirmar que a Central de Saúde permanece como tela canônica.
- Validação ainda depende da nova CI e do build APK no SHA resultante; teste visual real do layout no Galaxy A06 continua pendente.


## DB-161 · 2026-10-28 — Corrigir rótulo obsoleto do atalho de armazenamento em Viagens

- Depois de centralizar a lista de percursos em `/viagens` e restringir `/armazenamento` a quota/arquivos/exportação, o link em Viagens ainda dizia “ABRIR HISTÓRICO E EXPORTAÇÃO”. O rótulo estava desatualizado e contradizia a nova divisão de responsabilidades.
- Alterado para “ABRIR ARMAZENAMENTO E EXPORTAÇÃO”, alinhado ao título da tela de destino e ao grupo da central Mais. Adicionada asserção para evitar a regressão do texto antigo.
- A navegação e os dados persistidos não foram alterados; CI do novo SHA e build APK permanecem obrigatórios.


## DB-162 · 2026-10-29 — Limitar sondas nativas Bluetooth e falhar fechado em estado indeterminado

### Problema confirmado
- Em `src/obd/bluetoothClassicTransport.ts`, `write()` e `readUntilPrompt()` aguardavam `device.isConnected()` sem prazo. Uma Promise nativa que não concluísse podia impedir que o timeout do comando/RX encerrasse a operação.
- Os dois caminhos também capturavam exceções nativas e ignoravam todas, exceto a mensagem exata `BLUETOOTH DESCONECTADO`; após uma falha de estado desconhecido, o código podia continuar como se o socket estivesse disponível.
- O fechamento direto aguardava a Promise de desconexão sem limite. A recuperação inesperada tinha um limite externo, mas o fechamento explícito/inicialização falha ainda podia ficar aguardando indefinidamente.

### Correções aplicadas nesta branch
- Criado `runWithTimeout()` em `src/obd/connectionRecovery.ts`. O helper propaga falhas e limita a espera sem alegar que consegue cancelar uma chamada nativa já iniciada.
- Centralizada a verificação em `assertDeviceConnected()`: timeout ou exceção é registrado como `DEVICE_CONNECTED_CHECK_FAILED` e tratado como estado indeterminado; a escrita TX não é iniciada se a verificação não for concluída com sucesso.
- `readUntilPrompt()` usa apenas o orçamento restante da própria leitura para verificar o estado, impedindo que a sonda nativa prolongue indefinidamente o timeout OBD.
- `close()` agora limita a espera pela limpeza nativa. Se o socket não tiver sido confirmado como liberado, retorna erro e preserva o bloqueio compartilhado, impedindo a abertura concorrente de outro RFCOMM para o mesmo adaptador.
- Ampliados `tests/connectionRecovery.test.js` (operação concluída, rejeitada e travada) e `tests/bluetoothLifecycle.test.js` (integração, estado fail-closed e bloqueio após cleanup pendente). Adicionado OBD-04 a `docs/TEST_PLAN.md`, reforçado RG-03 e registrado o comportamento no CHANGELOG.

### Validação e limites
- A CI verde `40807259011` pertence ao SHA anterior `b21b574dbac25b8b417eb2540716e0c2503eb6eb`; não é evidência de aprovação destas mudanças. A CI do SHA que contém DB-162 deve passar por `validate` e `android-build`.
- Não há execução local do Android nem hardware conectado nesta sessão. O ensaio Galaxy A06/SM-A065M, Android 16, adaptador ELM327 real e ECU continua pendente; testes de helper/CI não provam comunicação serial física.
- Nenhuma alteração foi feita em `main` e não houve merge. Não integrar enquanto a CI do SHA final não estiver verde e enquanto o teste físico da cadeia Bluetooth → ELM327 → ECU não for executado.

### Próximos passos
1. Verificar a CI do SHA final desta branch e corrigir qualquer falha sem relaxar contratos nem testes.
2. No Galaxy A06, observar TX/RX com timestamp e confirmar `ATZ`, resposta ao `ATDP` e ao `010C`; diferenciar erro de verificação do socket, timeout sem prompt ELM e falta de resposta da ECU.
3. Repetir desconexão/reconexão e o fechamento manual para demonstrar que nenhum socket simultâneo abre enquanto a limpeza nativa permanece pendente.

## DB-163 · 2026-10-29 — Timeout finito para sondas de disponibilidade e descoberta Bluetooth

### Problema e causa
A auditoria da branch `ui/cockpit-instant-consumption-20261027` confirmou que os timeouts já cobriam conexão RFCOMM, leitura, escrita e verificação `isConnected` usada por leitura/escrita. Porém, algumas chamadas nativas auxiliares ainda eram aguardadas diretamente: disponibilidade do rádio, estado do Bluetooth antes/depois de tentativas, cancelamento de descoberta, confirmação inicial do socket e enumeração de dispositivos pareados. Se uma dessas Promises nativas não terminasse, o fluxo podia ficar suspenso antes de chegar ao timeout de conexão.

### Alterações aplicadas
- `src/obd/bluetoothClassicTransport.ts`: as sondas citadas agora passam por `runWithTimeout` com limites finitos. A falha/timeout de estado do rádio segue a política fail-closed existente; timeout no cancelamento da descoberta cancela a tentativa RFCOMM, pois a operação nativa pode continuar pendente. Falha/timeout da confirmação inicial do socket registra limpeza nativa e impede que o app trate o link como conectado. A listagem de pareados também retorna erro explícito após o limite.
- `tests/bluetoothLifecycle.test.js`: adicionadas verificações para exigir timeout em disponibilidade/estado do rádio, cancelamento de descoberta e enumeração de pareados.
- Nenhuma dependência, versão Expo, regra de PID, fórmula de consumo/autonomia, algoritmo GPS ou política de origem de dados foi alterada.

### Validação e limites
- Commits da implementação: `2c5658c6cedbaf035b7a6824fb2f1fa217e97bd1`, `263f8b46b186c1c3c7d00726bd46087ac83a1ec5` e `650d23f9bd366f672141389fbc0ca5cff2931826`.
- Commits dos testes: `619fa54ffb2e17e61eae1ca545fa43bab10db47e` e `a3d207cedf30e7a1ae29d19624e9b6683d513a79`.
- A CI `40863609539` é verde apenas no SHA anterior `4f9512c71c5305b551560ffc6908ffc232404e4a`; não conta como validação destas mudanças. As execuções acionadas pelos commits desta entrada foram canceladas/reiniciadas durante a sequência de commits; consultar a execução do HEAD final, sem interpretar execução cancelada como falha de teste nem como aprovação.
- O timeout JavaScript não cancela por si só uma operação nativa já iniciada. Por isso, uma conexão/socket de resultado indeterminado continua sujeita ao bloqueio de concorrência já existente; timeout não é evidência de que o recurso nativo foi liberado.
- O teste físico no Galaxy A06/Android 16 com ELM327 real, incluindo resposta válida a `010C`, permanece pendente.

### Fontes técnicas
- Android Developers — conexão Bluetooth Classic: https://developer.android.com/develop/connectivity/bluetooth/connect-bluetooth-devices
- Android `BluetoothSocket` — RFCOMM é streaming e `connect()` pode bloquear; `close()` libera recursos: https://developer.android.com/reference/android/bluetooth/BluetoothSocket
- Linux Kernel — protocolo ELM327, comandos terminados em CR e prompt `>`: https://cdn.kernel.org/doc/html/latest/networking/device_drivers/can/can327.html

---

## DB-164 · 2026-10-29 — Limitar sondas nativas na preparação e ativação Bluetooth

### Causa
Após DB-163, ainda havia operações nativas sem prazo em `src/obd/bluetoothManager.ts`: `isBluetoothAvailable()`, `isBluetoothEnabled()`, o pedido de ativação do rádio e o pedido de permissões Android. Elas ocorrem antes da abertura RFCOMM; portanto, o timeout interno do transporte não as cobre.

### Alterações
- `src/obd/bluetoothManager.ts`: incluiu `runWithTimeout` para estado/disponibilidade do rádio (1,5 s) e para pedidos de permissões/ativação mediados pelo Android (30 s). Um timeout encerra a espera JavaScript e aborta o fluxo antes de abrir RFCOMM; isso não afirma que a chamada do sistema operacional foi cancelada.
- `tests/bluetoothLifecycle.test.js`: adicionadas asserções para exigir os prazos e impedir o retorno dos awaits nativos diretos.
- Mantidas as permissões BLUETOOTH_CONNECT/SCAN, o único dono da conexão e os estados distintos Bluetooth → ELM → ECU.

### Validação
- Esta alteração deve ser validada no novo HEAD por TypeScript, suíte completa e build Android.
- Não houve teste físico no Galaxy A06/Android 16. A resposta `010C` da ECU permanece por confirmar.

## DB-165 · 2026-10-29 — Limitar a consulta HTTP opcional de clima e cancelar requisição vencida

### Causa
`src/weather/currentConditions.ts` aguardava `fetch()` e a leitura do JSON sem timeout. Se a rede celular ficasse instável e a requisição nunca concluísse, `startCurrentConditionsRefresh()` manteria `inFlight=true` e bloquearia as próximas atualizações opcionais até que a Promise resolvesse.

### Alterações
- `src/weather/currentConditions.ts`: criada `fetchWeatherPayload()`, com limite padrão de 8 s para a requisição e a leitura do corpo JSON. O timeout chama `AbortController.abort()` quando disponível; o fallback mantém a espera do chamador limitada.
- `tests/onlineConditions.test.js`: adicionada regressão simulando fetch sem resposta e verificando timeout + sinal de abort.
- Esta camada só enriquece cidade/clima; ela não envia telemetria veicular. O inventário da branch não contém cliente de sincronização de telemetria/cloud nem outbox persistente conectado a servidor. Não foi criada uma fila órfã sem endpoint/contrato definido; isso continua como lacuna arquitetural para uma integração explícita.

### Referências técnicas
- Android Developers — conexão RFCOMM bloqueante, cancelamento de descoberta e fechamento de socket: https://developer.android.com/develop/connectivity/bluetooth/connect-bluetooth-devices
- Android Developers — permissões Bluetooth em Android 12+: https://developer.android.com/develop/connectivity/bluetooth/bt-permissions
- Linux Kernel — comandos ELM terminados em CR e prompt `>`: https://cdn.kernel.org/doc/html/latest/networking/device_drivers/can/can327.html
- Expo Location — documentação oficial da biblioteca: https://docs.expo.dev/versions/v51.0.0/sdk/location/

### Validação e limites
- A nova CI no SHA que inclui DB-164/DB-165 é obrigatória; o resultado verde de `validate` no SHA anterior não valida estas alterações.
- O timeout HTTP não transforma dados antigos em atuais. Falha de clima segue como indisponível, sem bloquear o motor OBD local.
- O teste físico de Bluetooth/ECU permanece pendente.

## DB-166 · 2026-10-29 — Limitar sonda de rádio no monitor de saúde Bluetooth/ECU

### Causa
`src/obd/sharedConnection.ts` consultava `RNBluetoothClassic.isBluetoothEnabled()` sem prazo no monitor de saúde. Se a Promise nativa travasse, `monitorBusy` poderia permanecer verdadeiro e os checks futuros seriam abandonados; uma falha no estado do rádio também não deve ser interpretada como falha da ECU.

### Alterações
- Reutiliza `runWithTimeout` com 1 s para a verificação do rádio.
- Reutiliza uma Promise nativa ainda pendente para evitar múltiplas sondas simultâneas após timeout. Quando o estado é desconhecido, mantém o estado ECU separado e ainda permite que o monitor tente consultar a ECU.
- `tests/bluetoothLifecycle.test.js` protege a presença do limite e proíbe o retorno do `await` nativo direto.

## DB-167 · 2026-10-29 — Expirar velocidade GPS antiga sem perder distância acumulada

### Causa
`src/gps/gpsTracker.ts` atualizava velocidade e qualidade apenas quando recebia um callback de localização. Se as atualizações parassem, o último valor GPS podia continuar visível e ser reutilizado pelo serviço de viagem, embora nenhum fix novo tivesse chegado. Também se rotulava `OBD` uma velocidade que ainda podia vir do campo `speed` do GPS.

### Alterações
- Adicionado watchdog único, ativo apenas enquanto o rastreador está em execução, que marca o fix como `SEM_FIX` após 5 s sem posição precisa e reinicia a referência/segmentos pendentes. A distância acumulada é preservada; não são criadas posições nem segmentos artificiais.
- Timestamp do hint OBD separado e finito (5 s). A fonte `OBD` passa a apresentar o valor OBD de fato; quando o hint vence e o GPS também está sem fix atual, a velocidade expira para zero/`PARADO`.
- `tests/gps.test.js` usa relógio/temporizador controlados para testar perda do GPS, preservação de distância, continuidade de um hint OBD atualizado e expiração de hint obsoleto.

### Validação e limites
- As referências de Android orientam atualizações por callback, timestamps e remoção de updates para controlar ciclo de vida/energia; a falta de callbacks não pode ser tomada como prova de movimento atual. Ver: https://developer.android.com/develop/sensors-and-location/location/request-updates
- A CI para o SHA novo precisa executar TypeScript, suíte completa, gate anti-regressão e build APK. Nenhum teste físico foi executado nesta sessão.
- O watchdog corrige frescor do estado apresentado; o GPS continua sendo a fonte de distância e o OBD continua sendo a fonte de velocidade quando há uma leitura OBD válida. Ele não estima distância durante interrupções.

## DB-168 · 2026-10-29 — Neutralizar fórmulas em campos textuais de exportação CSV

### Causa
A exportação CSV de viagens escapava aspas, mas não neutralizava campos textuais iniciados por operadores que planilhas podem interpretar como fórmula (`=`, `+`, `-` ou `@`, inclusive depois de espaços/controle). Dados importados ou persistidos poderiam virar fórmulas ao abrir o arquivo em software de planilha.

### Alterações
- Criado `src/storage/csvEncoding.ts` com `escapeCsvCell()`: mantém o quoting/escape de aspas e prefixa texto formula-like com apóstrofo. Valores numéricos continuam numéricos, inclusive os negativos.
- `src/storage/exportDiagnostics.ts` passa a usar o codificador compartilhado nas sete colunas exportadas.
- Criado `tests/csvEncoding.test.js` para texto normal, aspas, fórmula direta, fórmula após espaços/tab, valores negativos numéricos e nulos; ligado a `npm test`.
- `tests/projectBaseline.test.js` agora exige o teste no script e o uso do codificador pelo exportador.
- Não foi alterado JSON de diagnóstico nem o formato/ordem das colunas CSV.

### Validação e limites
- Este commit exige nova execução do gate anti-regressão, TypeScript e suíte completa. O resultado da CI anterior não o valida.
- O codificador reduz o risco de formula injection em planilhas comuns; não pretende validar o significado semântico de todos os campos de origem.

## DB-169 · 2026-10-29 — Impedir que a inicialização GPS bloqueie polling OBD

### Causa
`autoTripService.runLoop()` aguardava `ensureGpsForEcu()` antes de iniciar o próximo ciclo de consulta. A preparação de permissão, `startLocationUpdatesAsync` ou `watchPositionAsync` pode demorar por causa do sistema operacional; uma Promise suspensa podia interromper consultas OBD válidas mesmo com Bluetooth/ECU funcionais.

### Alterações
- O polling agenda a inicialização GPS sem `await`, usando uma única Promise em voo para evitar watchers/solicitações simultâneas.
- A inicialização revalida o `generation` e o estado ECU antes/depois da operação; se o GPS terminar de iniciar após o ciclo/ECU já ter terminado, solicita a limpeza em vez de manter monitoramento órfão. Se outra sessão ECU já estiver ativa, a tentativa antiga não para o tracker compartilhado.
- O retry de GPS é limitado a uma nova tentativa a cada 15 s depois de falha, evitando pedidos de permissão/start a cada ciclo OBD.
- `tests/backgroundExecution.test.js` impede a regressão para `await ensureGpsForEcu()` dentro do ciclo serial OBD.

### Validação e limites
- Esta alteração exige TypeScript, gate, suíte completa e build Android no SHA final.
- Uma operação nativa GPS que não termina permanece como a única tentativa em voo; isso preserva o polling OBD e evita duplicar tarefas, mas pode exigir resolução da chamada nativa ou reinício do app para recuperar GPS.
- Não houve teste físico GPS/ECU nesta sessão.

## DB-170 · 2026-10-29 — Atualizar gate GPS para monotonicidade após perda de fix

### Causa
CI `40869798013` falhou antes de executar `validate`: `tests/projectBaseline.test.js` ainda exigia literalmente `location.timestamp <= this.previous.timestamp`, mas DB-167 foi reforçado para comparar com `state.lastTimestamp`. A comparação mais ampla permanece depois da limpeza de `previous` e impede aceitar um fix atrasado que não seja mais monotônico.

### Correção
- O contrato estático agora exige `location.timestamp <= this.state.lastTimestamp`, alinhando o gate à regra nova sem enfraquecer a proteção contra timestamps inválidos ou fora de ordem.
- O teste funcional GPS já inclui um callback atrasado após stale-watchdog e espera que a contagem de amostras não mude.

### Validação
- A falha comprovada foi de asserção do gate; `android-build` foi ignorado por dependência do job `validate`. A nova CI deve confirmar TypeScript, gate, suíte integral e APK no mesmo SHA.

## DB-171 · 2026-10-29 — Serializar cancelamento nativo da descoberta Bluetooth

### Causa
DB-163 limitou o tempo de espera de `cancelDiscovery()`, mas um timeout JavaScript não cancela a operação nativa. Uma nova tentativa podia iniciar outra chamada de cancelamento enquanto a primeira ainda estivesse pendente, contrariando a intenção de não sobrepor operações nativas.

### Correção
- Criada `cancelBluetoothDiscovery()`, compartilhando uma única Promise nativa entre instâncias. Enquanto a Promise não resolver/rejeitar, novos `open()` reutilizam a mesma chamada e falham fechado após o timeout; não iniciam cancelamentos paralelos.
- `tests/bluetoothLifecycle.test.js` protege o uso do helper e proíbe o callback direto por tentativa.

## DB-172 · 2026-10-29 — Rejeitar coeficientes e resultados de fórmula não finitos

### Causa
O motor de fórmulas validava bytes OBD e o valor no parser, mas `applyFormula()` poderia retornar `Infinity` se o catálogo trouxesse divisor zero ou um coeficiente enorme, antes de chegar à validação de PID. Os catálogos atuais não usam divisor zero; o risco era a ausência de uma barreira no motor.

### Correção
- `src/obd/formulaEngine.ts` valida divisor positivo e coeficientes finitos e rejeita qualquer resultado que não seja finito.
- `tests/pidFormulaBoundaries.test.js` cobre divisor zero, escala infinita e o guard de resultado não finito por meio de um valor intermediário sintético; os limites válidos SAE existentes continuam intactos.

## DB-173 · 2026-10-29 — Corrigir documentação obsoleta sobre sincronização em nuvem

### Causa
`docs/ARCHITECTURE.md` afirmava que `src/cloud/bubbleWorkflowClient.ts`, `src/cloud/bubbleWorkflowContract.ts` e `docs/BUBBLE_WORKFLOW_PORT.md` estavam disponíveis, mas esses arquivos não existem na árvore atual. Isso criava uma falsa expectativa de upload/outbox de telemetria.

### Correção
- A arquitetura e a auditoria de rede agora afirmam explicitamente que só existe status de rede e enriquecimento opcional de clima; não há cliente de upload nem fila persistente de telemetria nesta branch.
- O requisito futuro foi registrado com dependências claras: contrato do backend, autenticação, idempotência, consentimento/retenção e fila durável com replay. Nenhum fluxo cloud sem consumidor foi inventado.

### Validação e limites
- Esta rodada exige nova CI no HEAD final. Não houve teste físico no Galaxy A06/Android 16, conexão ELM327/ECU, nem inspeção visual de telas no hardware.

## DB-174 · 2026-10-29 — Consumir tokens compartilhados para a paleta base das telas

### Causa
As telas importavam `src/ui/theme.ts`, mas repetiam diretamente as cores base do cockpit. Isso permitia que mudanças de paleta se desviassem gradualmente e impedia testes estáticos de garantir o uso efetivo dos tokens.

### Alterações
- As 14 rotas funcionais cobertas por `tests/screenTheme.test.js` agora referenciam `COLORS.*` para os valores base idênticos à paleta comum.
- Incluído o token `COLORS.white` para preservar o branco puro (`#fff`) em texto/ícones sobre botões e superfícies de destaque, sem substituí-lo por um quase-branco.
- O teste de tema agora reprova a reintrodução dos literais base nas telas; cores semânticas especiais e cores de gráfico fora da paleta comum permanecem explícitas quando são realmente distintas.

### Validação e limites
- Mudança de referência de cores, sem alteração de fórmulas, navegação ou ciclo OBD; a CI precisa validar TypeScript, gate, suíte e build Android no novo SHA.
- Não houve inspeção visual física em retrato/paisagem no Galaxy A06. O teste estático não substitui essa etapa.

## DB-175 · 2026-10-29 — Limitar localização para clima e aplicar backoff exponencial

### Causa
A consulta de clima era limitada no `fetch()` HTTP, mas as chamadas Expo anteriores — permissão, posição e geocodificação reversa — não tinham prazo. Uma Promise nativa lenta podia deixar o atualizador opcional em `inFlight`. O retry de rede usava cooldown fixo, sem aumentar a espera após falhas consecutivas.

### Alterações
- `src/weather/currentConditions.ts`: timeout de 3 s para consultar permissão, 8 s para posição de baixa precisão, 4 s para geocodificação reversa e mantém HTTP/JSON limitado a 8 s. A falha retorna indisponibilidade de clima, não bloqueia o loop OBD e não fabrica posição.
- `src/weather/conditionsRefresh.ts`: backoff exponencial por falha (60 s inicial padrão) com teto de 15 min; reconexão pode iniciar refresh imediato e sucesso zera a contagem.
- `tests/onlineConditions.test.js` e `tests/weatherRefresh.test.js`: testes para timeout de operação que não responde e para o aumento/reinício do backoff.
- `docs/AUDITORIA_REDE_MOVEL_E_LOCALIZACAO_2026-10-28.md`: documenta prazos, teto e escopo local do recurso.

### Limites
- Timeouts JavaScript limitam a espera do chamador; não garantem cancelamento de chamadas nativas Expo que não ofereçam cancelamento explícito. As operações expiram para o fluxo de enriquecimento sem criar coordenadas ou dados de clima.
- Essa política é somente para clima/localidade; não implementa upload de telemetria, porque a branch não contém cliente/outbox cloud.

## DB-176 · 2026-10-29 — Atualizar contrato visual térmico para o token de tema

### Causa
A troca de `danger` no cockpit da literal `#fb7185` para `COLORS.danger` preservou o valor exato, mas `tests/orientationLayout.test.js` continuava procurando a literal antiga e falhou durante `npm test`.

### Correção
- A asserção agora exige `danger:{color:COLORS.danger}` em vez da representação literal da cor.
- O layout, tamanho e regra de apresentação do valor térmico não foram alterados; apenas o contrato estático foi atualizado para o design system.

### Validação
- `typecheck` passou no SHA `ce77a177d36322b1c5aee6b9dfcc80e3df39c1ed`; `npm test` falhou na asserção textual identificada. Nova CI completa no HEAD posterior é obrigatória.

## DB-177 · 2026-10-29 — Limitar timeout da limpeza nativa de socket RFCOMM

### Causa
`safeDisconnect()` aguardava `device.disconnect()` sem timeout. Embora a limpeza compartilhada já bloqueie um novo socket enquanto a Promise não termina, um caminho de falha que aguardasse diretamente essa função podia permanecer pendente. Um timeout externo sem preservar o estado de limpeza poderia permitir conexão concorrente.

### Correção
- `src/obd/bluetoothClassicTransport.ts`: desconexão nativa agora passa por `runWithTimeout` usando o limite de conexão configurado. Timeout é registrado separadamente e rejeita sem tratar a chamada nativa como cancelada; o registro de limpeza compartilhada permanece pendente e bloqueia RFCOMM substituto.
- Se a chamada de desconexão terminar com erro normal, a sonda `isConnected()` também é limitada a 1 s; só o estado explicitamente desconectado é tratado como cleanup concluído.
- `tests/bluetoothLifecycle.test.js` exige timeout na desconexão e proíbe retorno ao `await device.disconnect()` sem limite.

### Validação e limites
- DB-177 exige uma nova execução de TypeScript, gate, suíte completa e build Android no mesmo SHA.
- O código não pode cancelar à força uma Promise nativa que não oferece API de cancelamento. A política segura é manter o bloqueio até a limpeza realmente assentar; se o módulo nativo nunca resolver, o app não abrirá um socket concorrente para o mesmo adaptador.


## DB-178 · 2026-10-29 — Preservar bloqueio RFCOMM quando a sonda de estado do socket expira

### Causa
A sonda nativa `device.isConnected()` era limitada por timeout em leituras e escritas, mas, se expirasse ou rejeitasse, `assertDeviceConnected()` apenas lançava erro. O timeout JavaScript não cancela a chamada nativa e não comprova que o socket foi fechado. Sem registrar limpeza compartilhada nesse caminho, uma reconexão poderia tentar abrir outro RFCOMM para o mesmo endereço enquanto o estado anterior ainda era desconhecido.

### Correção
- `src/obd/bluetoothClassicTransport.ts`: falha/timeout de `isConnected()` agora registra `DEVICE_CONNECTED_CHECK_CLEANUP` na trava global antes de limpar o estado local e lançar erro. A nova conexão só pode prosseguir após a limpeza nativa ser confirmada; a operação pendente continua sem ser considerada cancelada.
- `tests/bluetoothLifecycle.test.js`: adicionadas asserções para garantir a ordem de registro da limpeza compartilhada e descarte do estado local no caminho de estado desconhecido.

### Validação e limites
- Commit de implementação: `877778ab667ff82ea0d3fcf9fa8002f4e7db9a90`.
- Commit de regressão: `053fa4a5f8c93592c3b7a5559027a6165d49e691`.
- A CI ainda precisa executar typecheck, gate anti-regressão, suíte completa e build Android no mesmo SHA final. Não houve teste físico do Galaxy A06/Android 16 com ELM327/ECU nesta alteração.


## DB-179 · 2026-10-29 — Serializar tentativas nativas de desconexão após timeout

### Causa
DB-177 adicionou timeout a `device.disconnect()` e preservou a trava de socket, mas a rotina de recuperação tentava novamente qualquer limpeza rejeitada. Se a rejeição fosse apenas o timeout JavaScript, a chamada nativa original poderia continuar pendente; chamar `disconnect()` outra vez criaria operações nativas sobrepostas para o mesmo adaptador.

### Correção
- `src/obd/bluetoothClassicTransport.ts` mantém a Promise nativa original em `pendingNativeDisconnectOperations` por endereço. Enquanto a chamada não resolver/rejeitar de verdade, qualquer tentativa de cleanup reutiliza a mesma Promise em vez de iniciar outra desconexão.
- A trava global `pendingNativeSocketCleanups` continua ativa até que o fluxo de limpeza seja confirmado; timeout JavaScript não é tratado como cancelamento da operação nativa.
- `tests/bluetoothLifecycle.test.js` verifica que a Promise nativa é rastreada e reutilizada durante retries, evitando concorrência de cleanup.

### Validação e limites
- Commit de implementação: `01cebfe60d7b7eb7a76dd18249762395a1a0e574`.
- Commit de regressão: `08835c1f8dd5b343155c9cabeab71d1df50f2853`.
- A CI precisa validar o HEAD final, incluindo typecheck, gate, suíte completa e build Android. Teste físico Bluetooth/ELM327/ECU no Galaxy A06 permanece pendente.


## DB-180 · 2026-10-29 — Impedir que resposta ELM atrasada contamine o próximo PID

### Causa
Quando `readUntilPrompt()` expirava sem receber `>`, limpava o buffer e devolvia timeout, mas mantinha o stream disponível para o comando seguinte. Uma resposta atrasada do comando anterior podia chegar após a limpeza e ser interpretada como resposta do próximo PID, violando o framing serial e criando telemetria atribuída ao comando errado.

### Correção
- `src/obd/bluetoothClassicTransport.ts` agora marca o stream como dessincronizado quando a leitura expira sem prompt. Antes de transmitir um novo comando, a camada registra a limpeza compartilhada do socket, invalida o estado local e rejeita a escrita; a nova sessão só pode começar depois da limpeza RFCOMM confirmada.
- O estado de dessincronização é reinicializado apenas ao abrir uma nova sessão ou concluir o fechamento. Não se tenta inferir o fim de uma resposta que não trouxe o delimitador real `>`.
- `tests/bluetoothLifecycle.test.js` protege a marcação do timeout, o bloqueio de TX subsequente e a limpeza antes da reconexão.

### Justificativa técnica
A documentação Android informa que `BluetoothSocket.connect()` bloqueia e recomenda cancelar descoberta antes da conexão, além de fechar sockets para liberar recursos. A camada JS não pode assumir que um timeout cancela a operação nativa ou restaura o limite de mensagens. Referências oficiais: https://developer.android.com/develop/connectivity/bluetooth/connect-bluetooth-devices e https://developer.android.com/reference/android/bluetooth/BluetoothSocket.

### Validação e limites
- Commit de implementação: `4ee98580ca7542bd25bf7043a16c412ed6838d54`.
- Commit de regressão: `711c8153f7a013ce75848466544157a00b86f7ca`.
- A CI precisa validar typecheck, gate, suíte completa e build Android no HEAD final. O ensaio físico com Galaxy A06/Android 16, ELM327 real e ECU continua necessário para confirmar a recuperação no hardware.


## DB-181 · 2026-10-29 — Atualizar asserção de timeout após serializar desconexão nativa

### Causa
DB-179 mudou corretamente o caminho de limpeza para aplicar timeout à Promise nativa compartilhada, mas `tests/bluetoothLifecycle.test.js` ainda exigia a forma textual antiga `() => device.disconnect()`. A validação CI de `npm run validate` falhou nessa asserção, embora a intenção do teste — garantir timeout finito — continue válida.

### Correção
- A asserção agora exige que `runWithTimeout()` aguarde `nativeDisconnect`, a Promise original rastreada por endereço. As verificações adicionais continuam garantindo que retries não iniciem outra chamada nativa enquanto a primeira estiver pendente.
- A falha anterior foi uma incompatibilidade do teste com a implementação refatorada; não foi removida a exigência de timeout nem a proteção de concorrência.

### Validação
- Falha observada em `npm run validate` no SHA `2441a48131517cf5dda600eb9ab2ec15c69ccfd4`: `tests/bluetoothLifecycle.test.js:109`, mensagem `native socket disconnect must have a finite timeout`.
- Commit de ajuste do teste: `fbc510857fb75a83fb638bcf7effd7609d07ab1c`.
- A validação completa precisa ser reexecutada no HEAD posterior, incluindo gate e build Android.


## DB-182 · 2026-10-30 — Corrigir fixture de timestamp GPS e mockar ciclo de vida nativo em segundo plano

### Falha confirmada
- Em `tests/gps.test.js`, após o fix preciso de 29.000 ms, a suíte aceitava amostras com timestamps 31.000 e 32.000 ms, embora a precisão estivesse ausente. O rastreador preserva o último timestamp aceito mesmo quando a amostra não é precisa o suficiente para compor distância.
- A asserção de recuperação enviava 30.000 ms e esperava nova amostra. Esse valor é regressivo perante 32.000 ms e deve ser rejeitado pelo contrato monotônico. O defeito estava no fixture/expectativa do teste, não no filtro temporal da aplicação.
- O mock `expo-location` não implementava `hasStartedLocationUpdatesAsync`, `startLocationUpdatesAsync` e `stopLocationUpdatesAsync`. O código de produção capturava a exceção, mascarando a ausência desses métodos no mock e deixando o ciclo de vida de background sem cobertura.

### Correção aplicada
- A amostra de recuperação foi avançada para 33.000 ms e a mensagem da asserção explicita que precisa superar o último timestamp aceito.
- O mock passou a representar as três APIs de background do Expo Location.
- Incluídos testes para iniciar e parar o serviço de localização em segundo plano e para reutilizar uma tarefa nativa já ativa após recriação do contexto JS, sem registro duplicado.

### Fundamentação e limites
- A API `hasStartedLocationUpdatesAsync(taskName)` é documentada pelo Expo como `Promise<boolean>`; sua presença no rastreador é válida e não foi removida. A falha artificial era a implementação incompleta do mock.
- A documentação Android separa `BLUETOOTH_CONNECT` para comunicação com dispositivos já pareados de `BLUETOOTH_SCAN` para descoberta; o app declara e solicita ambas, sem concluir que isso comprova conexão com ELM327.
- Fontes: Expo Location API (hasStartedLocationUpdatesAsync) e Android Developers — Bluetooth permissions / Connect Bluetooth devices.

### Validação
- Commit desta correção GPS: `408cb7a558c069afeb3de446c08207be1df5f019`.
- A validação automatizada no novo HEAD precisa concluir `validate` e `android-build`. Nenhuma aprovação de CI é presumida neste registro.
- Não houve teste físico de GPS nem conexão real Bluetooth/ELM327/ECU no Galaxy A06 / Android 16. Nenhum merge foi realizado.


## DB-183 · 2026-10-30 — Confirmar movimento urbano sem exigir 8 m em cada callback GPS

### Defeito confirmado
- A lógica anterior exigia `MIN_MOVEMENT_DISTANCE_M = 8` em cada segmento de dois fixes. Com atualização configurada a cada 1 s e deslocamento de 10 km/h, o veículo percorre cerca de 2,8 m por segmento; nenhum segmento alcançava 8 m e o contador nunca chegava aos três segmentos necessários.
- A branch histórica `fix/gps-movement-confirmation-20261027` continha uma correção direcionada para o problema, mas ela não estava presente no código da PR #96.

### Correção portada
- O limite mínimo por segmento passou a considerar o tempo decorrido e uma fração do limite de precisão; cada segmento ainda precisa indicar velocidade coerente e não pode exceder 250 m.
- A confirmação exige três segmentos válidos consecutivos (quatro posições) e deslocamento líquido acumulado pelo menos igual ao limite de precisão entre o início e o fim da janela.
- Segmento fora do limite, intervalo excessivo ou fix sem precisão aceitável reinicia a janela, impedindo acumular jitter em distância real.
- A velocidade apresentada continua separando fonte OBD e GPS; a mudança não trata uma amostra GPS como resposta da ECU.

### Regressões adicionadas
- Cenário de 10 km/h com quatro posições separadas por 1 s e cerca de 2,8 m por segmento.
- A suíte existente continua cobrindo zigue-zague parado, amostras sem precisão, timestamp inválido/regressivo, salto geográfico e expiração de fix.

### Validação e limites
- Implementação: `9b318122ce353279a0f2b3de6672c835772ef2dc`.
- Teste de movimento urbano: `9213dc5d6fe9f164425d9c2e9c858b1d0403986d`.
- A CI completa deve validar o HEAD final; testes automatizados não equivalem a percurso real.
- Continua pendente ensaio físico no Galaxy A06 / SM-A065M / Android 16, comparando distância GPS com trajeto/odômetro conhecido, incluindo baixa velocidade e parada. Nenhuma validação física foi declarada e nenhum merge foi realizado.


## DB-184 · 2026-10-30 — Sincronizar índice DB-NNN com as novas entradas de auditoria

### Falha observada
- A CI #4034 / run `40999871511`, SHA `8cd885fc4d8fe12501e58dfb297f1a717ee62964`, passou Expo Doctor (17/17), mas falhou em `tests/projectBaseline.test.js:345`.
- A validação estrita encontrou as entradas DB-182 e DB-183 no corpo do diário, mas o índice em bullets terminava em DB-181. A verificação protege a correspondência exata e a continuidade da sequência; não deve ser afrouxada.

### Correção aplicada
- Adicionadas ao índice as entradas DB-182, DB-183 e DB-184, mantendo a sequência contínua.
- Atualizado o bloco operacional inicial para registrar a falha real do gate e o novo estado de validação.

### Validação
- O próximo push deve disparar a CI para o HEAD atualizado. Ainda não há resultado de `validate` nem de `android-build` para esse novo SHA.


## DB-185 · 2026-10-30 — Separar visualmente os botões inferiores do cockpit em retrato

### Causa
- Em retrato, as cinco rotas inferiores eram exibidas dentro de um único contêiner com fundo e borda compartilhados. Os itens não tinham superfície individual, o que reduzia a separação visual entre ações.
- A navegação em paisagem já estava organizada como uma raia vertical compacta e foi considerada adequada; alterar suas dimensões ou distribuição criaria risco sem benefício comprovado.

### Alterações
- O contêiner de navegação em retrato passou a ser transparente e sem borda, com espaçamento uniforme entre as abas.
- Cada uma das cinco abas recebeu fundo, borda e raio próprios, mantendo altura mínima de 60 dp.
- A aba ativa recebeu borda de destaque, sem alterar destinos, ícones, rótulos ou propriedades de acessibilidade.
- Os novos estilos são aplicados exclusivamente em retrato. As definições de largura, posicionamento, espaçamento e alvos da raia em paisagem foram preservadas.
- O ajuste não altera a grade de indicadores, fórmulas, leituras OBD, conexão Bluetooth ou lógica de viagens.

### Regressões adicionadas
- Verificação das cinco abas com estilo individual em retrato.
- Verificação do estado ativo e da seleção condicional do contêiner.
- Asserções explícitas para garantir que os estilos da navegação em paisagem permaneçam idênticos.

### Validação e limites
- Alterações registradas na branch `fix/cockpit-portrait-navigation-20261030`.
- A CI e o build Android precisam validar o HEAD final desta branch antes de qualquer merge.
- A aparência precisa ser conferida no Galaxy A06 em retrato e paisagem; os testes estáticos não substituem a inspeção visual no aparelho.
