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
- Se uma tentativa for bem-sucedida, encerra imediatamente e não executa as demais.
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
Instalar o APK da CI e gerar um novo relatório TXT. Em caso de falha persistente, o relatório deve conter até 20 blocos `BLUETOOTH_ATTEMPT_START`, cada um separado por aproximadamente 8 segundos, além dos erros RX/TX correspondentes.
