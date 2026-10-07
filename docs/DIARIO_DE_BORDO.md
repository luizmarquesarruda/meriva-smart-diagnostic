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
