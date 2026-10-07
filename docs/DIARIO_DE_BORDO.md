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


## 2026-10-06 - Diagnóstico físico Bluetooth: tentativa RFCOMM duplicada

### Problema
Relatório físico do Android 36, gerado às 13:13:05Z:
- Bluetooth disponível e ligado.
- Permissões BLUETOOTH_SCAN/CONNECT e localização concedidas.
- O relatório mostrou `PAIRED DEVICES: 0`.
- A conexão falhou com: `Already attempting connection to device 01:23:45:67:89:BA`.

### Diagnóstico
A causa mais provável foi identificada no fluxo de conexão, e não nas permissões.
O `BluetoothClassicTransport` tinha proteção de concorrência apenas por instância (`openPromise`). Porém cada nova tentativa de conexão cria uma nova instância do transporte. Após o timeout JavaScript, a operação nativa `connectToDevice()` pode continuar pendente. A próxima tentativa podia então chamar `connectToDevice()` novamente para o mesmo endereço antes de a primeira operação nativa terminar.

Isso explica diretamente o erro `Already attempting connection to device ...`.

Também foi encontrado um segundo problema de fluxo: a tela chamava `ensureBluetoothReady()` e depois `discoverPairedDevices()`, enquanto `discoverPairedDevices()` chamava `ensureBluetoothReady()` novamente. O trace confirmou duas sequências `BLUETOOTH_READY_START` quase simultâneas.

### Correção
1. Criado bloqueio global por endereço MAC em `src/obd/bluetoothClassicTransport.ts`.
2. Uma nova instância agora aguarda a tentativa RFCOMM nativa anterior terminar antes de chamar `connectToDevice()` para o mesmo endereço.
3. O comportamento de timeout foi preservado: a tentativa JavaScript pode terminar por timeout, mas a tentativa nativa tardia continua sob controle e é desconectada quando resolve.
4. Removida a chamada redundante de `ensureBluetoothReady()` da tela `app/bluetooth.tsx`.
5. Removida a chamada redundante dentro de `discoverPairedDevices()`, mantendo a função responsável apenas pela descoberta após o fluxo de prontidão do chamador.
6. Adicionado teste de regressão com duas instâncias do transporte usando o mesmo endereço, verificando que nunca existem duas tentativas RFCOMM nativas simultâneas.

### Arquivos afetados
- `src/obd/bluetoothClassicTransport.ts`
- `src/obd/bluetoothManager.ts`
- `app/bluetooth.tsx`
- `tests/regression.test.js`

### CI anterior
- CI #662, run `37465291527`: **sucesso**.
- CI #663, run `37466052711`: **cancelada** durante a sequência de commits de documentação.

### Próximo passo
Executar a nova CI desta correção. Se falhar, registrar a causa neste diário antes de outra alteração. Se passar, testar novamente no telefone com o ELM327 pareado e verificar especialmente a ausência de `Already attempting connection` no relatório.

---

## 2026-10-06 - Correção de framing Bluetooth para ELM327

### Problema
Relatório físico das 13:33:45Z:
- Bluetooth disponível e ligado.
- BLUETOOTH_SCAN/CONNECT concedidos.
- localização concedida.
- 1 dispositivo pareado encontrado: OBDII.
- a sessão chegou a `ELM_INITIALIZATION_START`.
- o primeiro teste físico retornou `ECU NÃO RESPONDEU AO 010C: OK | RX=OK`.

### Diagnóstico
O pareamento e o RFCOMM não eram mais o primeiro gargalo. A biblioteca `react-native-bluetooth-classic` usa por padrão conexão delimitada, mas permite delimiter vazio para entregar o conteúdo recebido sem segmentação. O código do projeto estava usando delimiter `\\r`.

O ELM327 usa CR (`0x0D`) para terminar comandos e pode produzir CR/linefeed nas respostas. O prompt `>` marca que o ELM voltou ao estado ocioso. Para uma ponte RFCOMM, não é seguro assumir que cada evento recebido representa uma resposta OBD completa.

### Correção
1. Mantido Bluetooth Classic/RFCOMM e charset ASCII.
2. Alterado o framing do transporte para `connectionType: delimited` com **delimiter vazio**.
3. O transporte agora recebe fragmentos sem impor uma fronteira artificial por CR.
4. `readUntilPrompt()` continua sendo o enquadrador da aplicação e somente conclui uma resposta ao encontrar `>`.
5. O trace passou a registrar cada `RX_CHUNK` com conteúdo, tamanho e representação hexadecimal ASCII para diagnosticar fragmentação real.
6. O timeout agora registra também o buffer parcial e a expectativa do prompt.
7. O teste de regressão foi atualizado para fixar o contrato de delimiter vazio e manter o teste de resposta fragmentada.

### Base técnica
- Datasheet ELM327: comandos terminam em CR; o prompt `>` indica prontidão.
- `react-native-bluetooth-classic`: delimiter vazio é suportado para enviar o buffer completo em `read()`/`onDataReceived`; o modo `binary` usa Base64 na ponte Android.
- Android RFCOMM: a leitura é orientada a fluxo, portanto eventos não devem ser tratados como mensagens OBD inteiras.

### CI
- Commit anterior de código: `5f45382ffe06c23f220e4466ac2d0211fecf4f91`.
- Commit de teste: `c8665b15f558cb7e14dd201141590628ba18aaa4`.
- Commit de documentação: `41eeb1668eff1f01942faf971000c1da3c9848ff`.
- CI será verificada após o estado final do conjunto de alterações.

### Resultado físico
Ainda **não confirmado** no ELM327 real. O próximo relatório deve mostrar `RX_CHUNK` e, idealmente, `RESPONSE_COMPLETE` contendo `41 0C ...`.

### Próximo passo
Executar a CI do estado final e instalar o APK gerado no telefone. O teste físico decisivo é `010C -> 41 0C XX XX`, sem aceitar `OK` isolado como resposta da ECU.

---

## 2026-10-06 - Política automática de 20 tentativas Bluetooth

### Solicitação
Para o teste físico do ELM327, a conexão Bluetooth deve tentar automaticamente até **20 vezes**, com **intervalo de 8 segundos** entre uma tentativa e a próxima. Cada tentativa deve deixar sua própria trilha no relatório TXT.

### Correção
- `MAX_BLUETOOTH_ATTEMPTS = 20`.
- `BLUETOOTH_RETRY_INTERVAL_MS = 8000`.
- Cada ciclo registra `BLUETOOTH_ATTEMPT_START`, inicialização, trace bruto do ELM327 e `BLUETOOTH_ATTEMPT_RESULT`.
- Entre falhas, registra o início e o fim da espera de 8 segundos.
- Ao atingir 20 falhas, encerra com `BLUETOOTH_TEST_SESSION_END` e motivo `MAX_ATTEMPTS_REACHED`.
- Mesmo que uma tentativa seja bem-sucedida, o teste continua até completar as 20 tentativas. Cada tentativa é independente, fecha sua sessão ao terminar e registra SUCCESS ou FAILURE. Ao final, se houve pelo menos um sucesso, uma nova sessão é aberta para devolver uma conexão utilizável ao aplicativo.
- O fechamento da sessão continua sendo feito em cada falha, evitando deixar uma conexão anterior aberta para a próxima tentativa.
- O trace é acumulado no relatório TXT, preservando a evidência de cada tentativa.

### Testes
O teste de regressão agora fixa os valores de 20 tentativas e 8000 ms, evitando que uma alteração futura reduza ou aumente silenciosamente a janela do teste físico.

### Arquivos afetados
- `src/obd/bluetoothManager.ts`
- `tests/regression.test.js`
- `docs/DIARIO_DE_BORDO.md`

### CI
A CI será disparada pelos commits desta alteração. A correção só será considerada concluída após a validação da CI.

### Próximo teste físico
Instalar o APK da CI e gerar um novo relatório TXT. O teste esperado é completar as 20 tentativas, mesmo que a primeira seja SUCCESS, com cada resultado gravado no TXT e intervalo de 8 segundos entre tentativas. Em caso de falha persistente, o relatório deve conter até 20 blocos `BLUETOOTH_ATTEMPT_START`, cada um separado por aproximadamente 8 segundos, além dos erros RX/TX correspondentes.


---

## 2026-10-06 - Correção da exportação das constantes de retry Bluetooth

### Problema
A CI #680 falhou no `npm run typecheck`. O TypeScript acusou `TS1184: Modifiers cannot appear here` nas linhas 185 e 186 de `src/obd/bluetoothManager.ts`.

### Diagnóstico
As constantes da política de retry foram inseridas por engano dentro do corpo da função `createRealElmSession` usando `export const`. O TypeScript não permite modificadores de exportação nesse ponto.

### Correção
As constantes foram movidas para o escopo do módulo, antes de `createRealElmSession`:
- `MAX_BLUETOOTH_ATTEMPTS = 20`
- `BLUETOOTH_RETRY_INTERVAL_MS = 8000`

O teste de regressão continua podendo importar os valores e a função usa exatamente a mesma política de 20 tentativas com 8 segundos entre falhas.

### CI anterior
- CI #680, run `37473634724`: **falhou no typecheck** por TS1184.
- `npm run doctor`: **17/17 passou**.
- `npm test`: não chegou a executar porque o typecheck falhou primeiro.

### Publicação
A documentação fica sincronizada com a correção de código. O commit de código será o último da sequência para disparar a CI do estado final.


---

## 2026-10-06 - Correção da exportação das constantes de retry Bluetooth

### Problema
A CI #680 falhou no `npm run typecheck`. O TypeScript acusou `TS1184: Modifiers cannot appear here` nas linhas 185 e 186 de `src/obd/bluetoothManager.ts`.

### Diagnóstico
As constantes da política de retry foram inseridas por engano dentro do corpo da função `createRealElmSession` usando `export const`. O TypeScript não permite modificadores de exportação nesse ponto.

### Correção
As constantes foram movidas para o escopo do módulo, antes de `createRealElmSession`:
- `MAX_BLUETOOTH_ATTEMPTS = 20`
- `BLUETOOTH_RETRY_INTERVAL_MS = 8000`

O teste de regressão continua podendo importar os valores e a função usa exatamente a mesma política de 20 tentativas com 8 segundos entre falhas.

### CI anterior
- CI #680, run `37473634724`: **falhou no typecheck** por TS1184.
- `npm run doctor`: **17/17 passou**.
- `npm test`: não chegou a executar porque o typecheck falhou primeiro.

### Publicação
A documentação fica sincronizada com a correção de código.


---

## 2026-10-06 - Regra final do retry Bluetooth: parar no primeiro sucesso

A política foi corrigida conforme o teste desejado:
- máximo de 20 tentativas;
- intervalo de 8 segundos somente entre falhas;
- SUCCESS encerra o ciclo imediatamente;
- a sessão que obteve sucesso é devolvida ao aplicativo;
- não há nova tentativa nem reabertura após sucesso;
- se todas as 20 falharem, o erro final é retornado.


---

## 2026-10-06 - Adaptação ao ELM327 Mini genérico

### Problema observado
Relatório físico de 2026-10-06 14:25:48Z:
- Android 36.
- BLUETOOTH_SCAN/CONNECT concedidos.
- Bluetooth disponível e ligado.
- 1 dispositivo pareado encontrado.
- A primeira tentativa chegou ao transporte RFCOMM, mas terminou em `TIMEOUT CONEXÃO BLUETOOTH` após aproximadamente 5 segundos.
- Nenhum comando AT foi transmitido, portanto a falha ocorreu antes da validação do adaptador.

### Regra de projeto
O adaptador usado no teste é um **ELM327 Mini genérico/clonado**. O software não deve tratá-lo como um ELM327 original da Elm Electronics, nem depender de versão de firmware, fabricante ou conjunto completo de comandos AT.

A documentação oficial da Elm Electronics confirma que o ELM327 é uma família de interpretadores OBD com diferentes versões e conjuntos de recursos. Para o projeto, isso é referência de protocolo, não uma prova de que o hardware físico seja um CI original.

### Evidência técnica
- ELM327 trabalha como interface serial e usa CR para finalizar comandos; o prompt `>` indica que voltou a aceitar comandos.
- `react-native-bluetooth-classic` suporta Bluetooth Classic e modo de conexão delimitado. O próprio projeto da biblioteca registra que delimiter vazio pode ser usado para receber dados sem impor uma fronteira artificial.
- Em Bluetooth Classic/RFCOMM, o aplicativo deve tratar a comunicação como fluxo, não presumir que cada evento recebido seja uma mensagem OBD completa.

### Correção
1. Mantido Bluetooth Classic/RFCOMM/SPP como transporte.
2. Mantido framing ASCII com delimiter vazio e enquadramento da resposta pelo prompt `>`.
3. A conexão agora usa **perfil adaptativo para ELM327 Mini genérico**:
   - primeiro tenta RFCOMM inseguro;
   - se falhar, tenta RFCOMM seguro;
   - registra qual modo funcionou.
4. O estado de timeout de uma tentativa nativa foi isolado por tentativa, evitando que uma tentativa anterior atrasada perca a indicação de timeout ao iniciar o fallback.
5. O bloqueio global por endereço MAC continua impedindo duas chamadas RFCOMM nativas simultâneas para o mesmo adaptador.
6. O `ATI` deixou de ser requisito obrigatório de vida do adaptador. Ele continua sendo tentado como comando opcional.
7. A validação real do caminho OBD continua sendo feita pelo `010C` e por uma resposta `41 0C ...` válida. Isso evita aceitar um clone apenas porque respondeu a um comando AT.
8. O relatório continua registrando os dados brutos de conexão e RX/TX para diagnóstico físico.

### Arquivos afetados
- `src/obd/bluetoothClassicTransport.ts`
- `src/obd/elm327.ts`
- `docs/DIARIO_DE_BORDO.md`

### Commits
- `c8a234add426adc777ab05558ba9a286abdc4d3d` - fallback de socket para ELM327 Mini genérico.
- `c8d56e2e80c49552e05dbb7f9180c270d4d73f5d` - isolamento do timeout tardio por tentativa.
- `ff317cf9e972e3f751ccd4b06b31acb8891cbae9` - ATI opcional para clones genéricos.

### Próximo teste físico
Reinstalar o APK produzido pela CI e repetir o teste com o ELM327 Mini pareado.

O trace esperado deve mostrar:
`CONNECT_PROFILE` → `CONNECT_ATTEMPT secureSocket:false` → sucesso, ou fallback para `secureSocket:true`.

Depois da conexão, o marco decisivo é:
`TX ATZ` → resposta → demais comandos AT → `TX 010C` → `RX 41 0C XX XX`.

Não considerar `OK` isolado como prova de comunicação com a ECU.


---

## 2026-10-06 - JSON Bluetooth e aprendizado no relatório TXT

### Solicitação
O usuário pediu:
1. atualizar o JSON específico do Bluetooth;
2. fazer o relatório TXT mostrar o que o aplicativo já aprendeu.

### Diagnóstico
O projeto ainda não possuía um JSON dedicado para a política de conexão Bluetooth. Os valores de 20 tentativas e 8 segundos estavam no código.
O aprendizado já era persistido em `APRENDIZADO/dna_meriva.json`, mas o exportador Bluetooth TXT não lia esse perfil. Assim, o relatório mostrava o trace técnico, porém não mostrava o conhecimento acumulado.

### Correção
1. Criado `src/knowledge/bluetooth_config.json` com:
   - perfil `ELM327_MINI_GENERICO`;
   - Bluetooth Classic/RFCOMM/SPP;
   - tentativa INSECURE seguida de SECURE;
   - framing delimitado com delimiter vazio e ASCII;
   - máximo de 20 tentativas;
   - intervalo de 8000 ms;
   - parada no primeiro sucesso;
   - validação `010C -> 41 0C`;
   - `ATZ` obrigatório e `ATI` opcional.
2. `bluetoothManager.ts` passou a ler do JSON os valores de quantidade máxima de tentativas e intervalo.
3. O exportador `exportBluetoothDiagnosticTxt.ts` passou a ler `APRENDIZADO/dna_meriva.json` e incluir no TXT:
   - status do aprendizado;
   - fonte e versão do seed Car Scanner;
   - amostras seed, reais e totais;
   - última atualização;
   - peso do seed;
   - simulações detectadas/filtradas;
   - condições aprendidas;
   - estatísticas por PID: média, mínimo, máximo, desvio, amostras, amostras reais, seed, confiança e fonte.
4. Criado `tests/bluetoothConfig.test.js` para validar o JSON e a integração do relatório.
5. O teste foi incluído no `npm test`.

### Commits
- `7da4b2746afaf5355e0225e070eff62481bcc100` - JSON Bluetooth.
- `ae48a325afae51bba921ce5915d5af172e698e22` - Bluetooth lendo política do JSON.
- `3cf8bdd11f774f6a0157df6105ff51493dc8a972` - aprendizado incluído no TXT.
- `28bd582c8558f537cbb2f16a78fd47fc944339c4` - teste do JSON e relatório.
- `5ad69c9dab86a74a38d3a07369aece43def378e1` - teste integrado ao `npm test`.

### Resultado esperado no TXT
O relatório agora terá uma seção:

`--- O QUE O APLICATIVO APRENDEU ---`

Ela representa o conteúdo persistido do perfil de aprendizado, sem transformar dados de simulação em aprendizado real.

### CI
A CI ainda precisa ser executada sobre o estado final desta alteração. A correção não será considerada concluída antes da validação.

### Próximo passo
Executar a suíte completa e a CI. Depois, gerar um novo TXT no telefone para confirmar que a seção de aprendizado aparece junto do trace Bluetooth.


## 2026-10-06 - Correção do fluxo duplicado de prontidão Bluetooth

### Evidência física
O relatório de 2026-10-06 14:50:57Z mostrou:
- permissões Bluetooth e localização concedidas;
- Bluetooth disponível e ligado;
- 1 dispositivo pareado;
- ELM_SESSION_START seguido novamente por BLUETOOTH_READY_START;
- ELM_INITIALIZATION_START seguido de novo PAIRED_DISCOVERY_START;
- adaptador não conectado e LAST ERROR: NENHUM.

### Diagnóstico
createRealElmSessionAttempt() chamava ensureBluetoothReady() dentro de cada tentativa. O fluxo superior (sharedConnection) já fazia a preparação e a descoberta antes de iniciar a sessão ELM. Isso misturava responsabilidades e podia reiniciar o fluxo Bluetooth no meio da inicialização do adaptador.

Além disso, o relatório usava somente o erro compartilhado. Em algumas rotas de teste físico, o trace já continha a falha real, mas o campo LAST ERROR continuava como NENHUM.

### Correção
1. Removida a chamada redundante de ensureBluetoothReady() de createRealElmSessionAttempt().
2. A preparação Bluetooth e a descoberta de pareados continuam no fluxo chamador, antes dos retries.
3. Cada retry passa diretamente por RFCOMM → inicialização ELM → 010C, sem reabrir permissões ou repetir a descoberta.
4. O relatório TXT agora usa o último erro do trace como fallback quando o erro compartilhado não estiver disponível.
5. Mantida a política de 20 tentativas, 8 segundos entre falhas e parada no primeiro sucesso.
6. Mantida a validação real da ECU somente com 41 0C válido.

### Arquivos afetados
- src/obd/bluetoothManager.ts
- src/obd/exportBluetoothDiagnosticTxt.ts
- docs/DIARIO_DE_BORDO.md

### Próximo passo
Executar a CI do estado final e repetir o teste físico. O trace esperado não deve conter BLUETOOTH_READY_START nem PAIRED_DISCOVERY_START entre ELM_SESSION_START e ELM_INITIALIZATION_START de uma mesma tentativa.

---

## 2026-10-06 - Decisão de identidade visual: MERIVA SMART

Nome visível do aplicativo aprovado e padronizado como **MERIVA SMART**. O nome anterior, **MERIVA SMART DIAGNOSTIC**, era longo para o cabeçalho das telas móveis. Os termos técnicos **DIAGNÓSTICO**, **OBD** e **GPS** continuam identificando as funções do aplicativo. Slug, pacote Android e identificadores internos permanecem inalterados.


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
- `src/knowledge/diagnostic_rules.json`: catálogo versionado de regras e próximos testes.
- `src/diagnostics/diagnosticEngine.ts`: motor de evidências local.
- `tests/diagnosticEngine.test.js`: regressões do motor.

O motor:
- aceita observações OBD e DTCs;
- separa dados reais de SIMULAÇÃO;
- gera hipóteses com score e confiança;
- registra as evidências que produziram cada hipótese;
- sugere próximos testes;
- não trata DTC ou PID isolado como prova de componente defeituoso;
- mantém CarScanner como referência e não como leitura atual.

Primeiras regras:
- P0301 -> hipótese de falha de combustão no cilindro 1;
- P0123 -> hipótese de sinal alto de posição da borboleta;
- STFT + LTFT >= 15% -> hipótese de mistura pobre;
- STFT + LTFT <= -15% -> hipótese de mistura rica;
- MAP >= 45 kPa em IDLE_WARM -> hipótese de vácuo possivelmente anormal.

### Validação
O teste foi incluído no `npm test`.

### CI
**Não iniciada.** Conforme regra de trabalho definida pelo usuário, CI só deve ser executada quando ele solicitar explicitamente.

### Próximo passo
Integrar o motor à tela de diagnóstico e ao relatório TXT, depois ampliar as regras usando o histórico real da Meriva e testes confirmatórios.

## 2026-10-07 — Integração da primeira camada de diagnóstico local

### Objetivo
Conectar o motor de evidências local à tela de diagnóstico e ao relatório TXT, mantendo a separação entre dados reais e simulação.

### Alterações
- CI temporariamente limitada a execução manual durante esta etapa, para impedir execuções automáticas a cada commit.
- LastPidReading passou a registrar a origem REAL ou SIMULACAO.
- O registro OBD passa a preservar essa origem no autosave.
- A tela DIAGNÓSTICO OBD agora exibe hipóteses locais, score, confiança, evidências e próximos testes.
- O relatório TXT agora inclui a seção DIAGNÓSTICO LOCAL / MOTOR DE EVIDÊNCIAS.
- O relatório usa o mesmo estado persistido pelo aplicativo para gerar o diagnóstico.
- tsconfig.json passou a permitir o carregamento tipado do catálogo JSON de regras.

### Regra de segurança
Dados de simulação continuam sem aumentar a confiança diagnóstica. A origem agora fica preservada também no último conjunto de leituras, evitando que uma simulação seja confundida com leitura real.

### CI
A CI **não foi iniciada**. O gatilho automático de push permanece temporariamente desativado durante a integração. A restauração do gatilho automático será feita somente conforme a autorização do usuário, pois restaurá-lo por commit pode disparar uma execução automaticamente.

### Próximo passo
Executar a validação autorizada pelo usuário, corrigir eventuais falhas encontradas e então decidir a restauração do gatilho automático.


## 2026-10-07 — Correção da apresentação das evidências da IA local

### Problema encontrado
Na revisão da integração do motor diagnóstico, as evidências eram objetos estruturados, mas a tela e o relatório TXT tentavam renderizar o objeto inteiro como texto. Isso poderia aparecer como `[object Object]` em vez da evidência real.

### Correção
- A tela `app/laboratorio.tsx` passou a exibir `evidence.text`.
- O relatório `src/obd/exportBluetoothDiagnosticTxt.ts` passou a exportar `evidence.text`.
- As chaves React da lista de evidências passaram a usar o índice, evitando chave baseada na conversão do objeto.

### Commits
- `95fdc3deb9722c4d1af8f7fd95b52c24929a607a` — `fix: render diagnostic evidence text correctly`
- `f831601504ddfa12a95ec0fa54ccbd80113e5470` — `fix: render diagnostic evidence text in txt`

### Validação
Os commits de código foram publicados no repositório e devem passar pela CI automática restaurada.

### Próximo passo
Acompanhar a CI e corrigir somente falhas comprovadas pelo log.


## 2026-10-07 — Auditoria e correção do teste do motor diagnóstico

A CI #722 falhou com `RangeError: Maximum call stack size exceeded` em `tests/diagnosticEngine.test.js`. A causa foi o monkey-patch global de `Module._load` usado para interceptar o JSON de regras.

Correção aplicada: o teste agora carrega diretamente `src/knowledge/diagnostic_rules.json` e usa um `localRequire` apenas no módulo TypeScript transpileado, sem substituir o carregador global do Node.

Commit: `af6849b4dd2bfa31e986552309e27ad93e07cb5e` — `fix: load diagnostic rules json directly in test`.

Auditoria estática também revisou o motor diagnóstico, regras JSON, laboratório, relatório TXT, package.json e workflow CI. Nenhuma outra falha bloqueadora foi identificada nessa revisão. A separação REAL/SIMULAÇÃO e `evidence.text` permanecem preservadas.

Figma: arquivo `MERIVA SMART — Telas Secundárias` criado, file key `xCTeaUHVEG0oc7tq3sp08A`. A edição das telas foi bloqueada pelo limite de chamadas do Figma MCP Starter nesta sessão; não foi declarada como concluída.

A próxima CI está autorizada pelo usuário.

## 2026-10-07 — Correção do CI e unificação visual das telas secundárias

### Falha encontrada
A CI #726 falhou no teste `tests/diagnosticEngine.test.js`. TypeScript e as demais 17 regressões passaram. A falha final foi `1 !== 0` no caso em que uma observação SIMULACAO não deveria gerar hipótese.

### Correção
- O motor `src/diagnostics/diagnosticEngine.ts` agora normaliza a origem da observação e filtra SIMULACAO antes de qualquer regra.
- O contador `blockedSimulationSamples` continua preservando quantas amostras simuladas foram bloqueadas.
- Foi adicionado teste com `simulacao` em minúsculas junto com dados reais, garantindo que a simulação não contamine a hipótese real.

Commits:
- `0ef1f5514a0e9045440d4dd610277800a8b7d35b` — `fix: harden simulation isolation in diagnostic engine`
- `8b3e84576011b44d4cd49bbf5a6a8c8fc1756021` — `test: cover case-insensitive simulation isolation`

### Melhoria visual sem Figma
Como a edição pelo Figma MCP ficou indisponível nesta sessão, a melhoria visual das telas secundárias foi aplicada diretamente no aplicativo:
- `app/configuracoes.tsx`
- `app/armazenamento.tsx`

As duas telas agora seguem a mesma linguagem visual do painel principal MERIVA SMART: fundo escuro, cartões de alto contraste, azul técnico para ações e títulos, bordas discretas e melhor continuidade visual entre as rotas.

Commits:
- `92b089df17e14e58c4cb22346c04baac51b43b5d`
- `6aa454820adb33ecb16e005141f665c66c06794d`

### CI
O usuário autorizou explicitamente executar a CI após a correção. O commit de documentação abaixo é o último da sequência e deve ser usado para validar o estado final.

### Próximo passo
Aguardar a CI do estado final. Se falhar, analisar o log antes de qualquer nova alteração. Se passar, instalar o APK e revisar as telas no telefone.
