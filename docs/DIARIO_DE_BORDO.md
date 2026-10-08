# Diário de Bordo - Meriva Smart Diagnostic

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

## 2026-10-06 - Correção do carregamento do catálogo de combustível

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

## 2026-10-07 — Continuidade do fluxo Bluetooth

- **Diagnóstico:** o fluxo `sharedConnection` podia iniciar uma nova rodada completa de descoberta após esgotar todos os candidatos. Como `maxConnectionAttempts` tinha valor padrão 0, isso podia resultar em reconexão indefinida.
- **Correção:** removida a repetição externa. O controle de tentativas permanece concentrado no fluxo do ELM327: até **20 tentativas por candidato**, intervalo de **8 segundos** e parada imediata no primeiro sucesso.
- **Correção adicional:** o log de timeout do transporte agora captura `bufferedLength` antes de limpar o buffer, evitando registrar sempre zero.
- **Teste:** adicionada regressão estática para impedir o retorno do laço infinito em `sharedConnection`.
- **Regra preservada:** ELM327 Mini é tratado como adaptador genérico; a conexão só vira OBD válido após resposta real `010C` com `41 0C`.

## 2026-10-07 - Primeira camada do motor de raciocínio diagnóstico local

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

## 2026-10-07 — Integração e apresentação do diagnóstico local

- LastPidReading preserva REAL/SIMULACAO.
- A tela de laboratório mostra hipóteses, score, confiança, evidências e próximos testes.
- O TXT inclui diagnóstico local e o que o aplicativo aprendeu.
- Evidências estruturadas são renderizadas por `evidence.text`.
- Figma foi criado para as telas secundárias, mas a edição MCP ficou indisponível; a melhoria visual foi aplicada diretamente em `app/configuracoes.tsx` e `app/armazenamento.tsx`.

## 2026-10-07 — Auditoria da CI #731: falha real no teste, não no motor

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


## 2026-10-07 — Reconciliação do lockfile e reprodutibilidade da CI

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


## 2026-10-07 — Correção revelada pela validação com `npm ci`

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

## 2026-10-07 — Consolidação final no main e CI verde

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

## 2026-10-07 — Verificação do package-lock.json

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



## 2026-10-07 — Persistência automática de Bluetooth/ECU e histórico TXT rotativo

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


## 2026-10-07 — Auditoria e centralização das permissões Android

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

## 2026-10-07 — Implementação das fases 1, 2 e 3 da nova experiência de telas

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

## 2026-10-07 — Consolidação do Diário após as fases 1, 2 e 3

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

## 2026-10-07 — Auditoria da CI #901/#902 + pesquisa de referências OBD

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

## 2026-10-07 — Incorporação de funções de referência OBD + auditoria pré-CI

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

## 2026-10-07 — Correção revelada pela CI #926 antes do fechamento

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

## 2026-10-07 — Correção do harness DTC revelada pela CI #929

### Falha
A CI #929 (run 37707396660), no commit `38911b8e79b43dcdfcdc18b18cca39c1a138151c`, passou por `npm ci`, Expo Doctor e **typecheck**. A nova suíte `liveTelemetry.test.js` também passou. O primeiro teste DTC falhou por infraestrutura do próprio teste: o loader CommonJS transpila `parser.ts` isoladamente, mas o parser depende em runtime de `pidDefinition.ts` e `formulaEngine.ts`, que continuam como TypeScript e não podem ser resolvidos pelo `require` padrão do harness.

### Correção
A lógica de parsing DTC foi extraída para `src/obd/dtcParser.ts`, que não possui dependências de runtime. `parser.ts` continua exportando `parseDtcResponseForService` para preservar a API existente, enquanto `dtcScanner.ts` e o teste passam a usar o módulo isolado.

### Estado
A falha não alterava a lógica de produção do parser OBD; o problema era a estratégia de carregamento do teste. A nova CI deve confirmar a suíte completa e liberar o Android build.

## 2026-10-07 — Correção final do parser DTC revelada pela CI #930

### Falha
A CI #930 (run 37707510064), no commit `87571e97d68ea993222dbb03b229fdffba17ba20`, confirmou `npm ci` e Expo Doctor **17/17**. O `liveTelemetry.test.js` havia passado e a suíte chegou ao `typecheck`, mas `parser.ts(155,10)` falhou com `TS2304: Cannot find name 'parseDtcResponseForService'`.

### Causa raiz
Ao extrair o parser DTC para `src/obd/dtcParser.ts`, `parser.ts` ficou apenas com o `export { ... }` e perdeu o import local necessário para a função legada `parseDtcResponse()` continuar delegando ao novo módulo.

### Correção
Restaurado o import local de `parseDtcResponseForService` em `src/obd/parser.ts`. A API de export permanece compatível e `dtcScanner.ts` continua usando o módulo isolado para evitar dependências de runtime no harness.

### Estado
A próxima CI deve confirmar TypeScript + testes completos e, em caso de sucesso, liberar o job Android Release.

## 2026-10-07 — Correção final do loader de testes DTC revelada pela CI #931

### Falha
A CI #931 (run 37707607771), no commit `dbada2ded42be53a67a89644c2073bcd6385bbd0`, passou por `npm ci`, Expo Doctor e **typecheck**. A falha ocorreu no primeiro teste DTC, com `MODULE_NOT_FOUND: ./dtcParser`.

### Causa raiz
O novo `dtcParser.ts` está corretamente resolvido pelo bundler TypeScript/Metro, mas o harness JavaScript transpila `dtcScanner.ts` isoladamente e o `require` CommonJS não resolve automaticamente um módulo relativo `.ts` sem extensão.

### Correção
O loader de `tests/dtcScanner.test.js` agora intercepta apenas o import relativo `./dtcParser` quando a origem é `dtcScanner.ts`, transpila esse módulo e restaura o loader global imediatamente após o carregamento. A lógica de produção não foi alterada.

### Estado
A próxima CI deve repetir a suíte a partir do mesmo ponto, agora com o harness capaz de carregar a dependência TypeScript isolada.


## 2026-10-08 — Rotação livre do Android + proteção responsiva do cockpit

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


## 2026-10-08 — Auditoria de integridade: Safe Area, JSON e retry Bluetooth

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

## 2026-10-08 — Adaptação completa das telas à rotação do celular

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

## 2026-10-08 — Auditoria e correção do autosave/persistência

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


## 2026-10-08 — Auditoria sênior: identificação de PIDs e DTCs na interface

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


## 2026-10-08 — Auditoria sênior documental de PIDs, DTCs e motor diagnóstico

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


## 2026-10-08 — Resultado da auditoria documental de PIDs, DTCs e motor diagnóstico

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


## 2026-10-08 — Auditoria profunda pré-CI: correção crítica do retry Bluetooth/ELM327

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


## 2026-10-08 — CI #1038: falha de TypeScript na camada de permissões

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


## 2026-10-08 — CI #1045: regressão de teste de permissões

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


## 2026-10-08 — CI #1051: teste apontando arquivo SAF incorreto

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


## 2026-10-08 — CI #1057: teste de rotação desatualizado

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


## 2026-10-08 — CI #1063 verde e consolidação da auditoria

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


## 2026-10-08 — Registro complementar: status confirmado da CI #1063

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
## 2026-10-08 — Autosave vinculado à sessão real da ECU

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
## 2026-10-08 — Correção: histórico e dados não eram alimentados pela telemetria automática

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

## 2026-10-08 — Auditoria: duplicação na telemetria automática

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

## 2026-10-08 — CI #1235: regressão estática no teste de ciclo Bluetooth
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

## 2026-10-08 — CI #1236: validação verde da correção de telemetria automática

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

## 2026-10-08 — Execução em segundo plano com tela apagada

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

## 2026-10-08 — Varredura de conhecimento OBD e enriquecimento do banco local

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

## 2026-10-08 — TXT de PIDs compactado e descoberta persistente

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


## 2026-10-08 — Pacote prioritário: saúde da ECU, DTC, identificação, consumo e persistência

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


## 2026-10-08 — Auditoria pós-implementação: correções de integração

- Corrigida a validação de respostas de Mode 02 para aceitar o cabeçalho positivo 42; antes, o parser ainda exigia 41 e poderia rejeitar freeze frame válido.
- O cockpit e a tela Bluetooth passaram a usar o estado de resposta da ECU, evitando exibir ECU como conectada quando somente o enlace Bluetooth permanece ativo.
- Defaults de reconexão foram reduzidos para 3 tentativas e limiar de 4 falhas consecutivas; as opções da tela de configurações foram alinhadas.
- Persistência de validação ECU recebeu lista de evidências verificadas.
- Exportação JSON/CSV foi adicionada à tela de armazenamento.
- O relatório TXT passou a incluir descrição, causas prováveis e freeze frame dos DTCs quando disponíveis.
- Nenhuma dependência nova foi adicionada nesta etapa.
- CI continua deliberadamente não disparada até concluir a revisão estática.

