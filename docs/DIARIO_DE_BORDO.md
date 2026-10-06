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