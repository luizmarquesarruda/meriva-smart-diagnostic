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
