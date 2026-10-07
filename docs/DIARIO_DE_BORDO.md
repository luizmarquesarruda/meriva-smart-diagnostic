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

## 2026-10-07 — Correção do carregamento do JSON no teste do motor diagnóstico

### Problema

A CI #722 falhou na etapa npm test em tests/diagnosticEngine.test.js com:

RangeError: Maximum call stack size exceeded

A causa estava no mock global de Module._load usado para interceptar diagnostic_rules.json. A implementação podia entrar em recursão durante o carregamento de módulos.

### Auditoria

Foi revisado o teste, o motor diagnóstico, o catálogo JSON, o package.json e o workflow da CI.

Conclusões:
- diagnostic_rules.json existe e contém as regras esperadas.
- diagnosticEngine.ts usa o catálogo real e não precisava de alteração.
- tsconfig.json já possui resolveJsonModule: true.
- O problema era isolado ao mecanismo de carregamento do teste.
- A CI usa Node 20 + Java 17 em Ubuntu x64, coerente com o ambiente Android esperado.
- A suíte completa já inclui o novo teste no npm test.

### Correção

O teste foi reescrito para:
- verificar explicitamente a existência do diagnostic_rules.json;
- carregar o JSON real diretamente;
- remover o monkey-patch global de Module._load;
- usar um localRequire apenas no módulo TypeScript transpileado;
- manter os demais require() no carregamento normal do Node;
- continuar testando as regras reais, e não uma cópia delas.

### Commit

- af6849b4dd2bfa31e986552309e27ad93e07cb5e
- fix: load diagnostic rules json directly in test

### Auditoria final do estado

Foram revisados os arquivos críticos da integração:
- tests/diagnosticEngine.test.js
- src/diagnostics/diagnosticEngine.ts
- src/knowledge/diagnostic_rules.json
- src/obd/exportBluetoothDiagnosticTxt.ts
- app/laboratorio.tsx
- package.json
- .github/workflows/ci.yml

Nenhuma outra falha bloqueadora foi identificada nessa revisão estática. A separação REAL/SIMULAÇÃO permanece preservada, o relatório usa evidence.text, e a regra de não tratar DTC/PID isolado como condenação de peça permanece documentada.

### Figma

Foi criado o arquivo de design MERIVA SMART — Telas Secundárias.

File key: xCTeaUHVEG0oc7tq3sp08A.

A criação do arquivo foi concluída, mas a edição das telas foi bloqueada pelo limite de chamadas do Figma MCP no plano Starter nesta sessão. Portanto, nenhuma tela foi declarada como concluída sem ter sido realmente gravada e validada.

### CI

O commit de correção deve disparar a CI automática restaurada. Conforme autorização explícita do usuário, a próxima etapa é executar/acompanhar a CI e corrigir qualquer falha comprovada pelo log.

### Próximo passo

1. Verificar a nova CI.
2. Se validate passar, verificar android-build.
3. Se houver falha, corrigir pela causa do log e registrar nova entrada.
4. Retomar a criação das telas secundárias no Figma quando o limite do MCP permitir.