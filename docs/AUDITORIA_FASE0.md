# AUDITORIA E CORREÇÃO - FASE 0

## ERROS ENCONTRADOS

### 1. Inconsistência de Tipos (CRÍTICO) ✅ CORRIGIDO

**Arquivo**: `src/obd/bluetoothManager.ts` linha 2
**Erro**: `import { Elm327CommandResult }`
**Realidade**: `elm327.ts` exporta `ElmCommandResult`
**Impacto**: Compilação falha
**Solução**: Renomear para `ElmCommandResult`

### 2. Imports Quebrados (CRÍTICO) ✅ CORRIGIDO

**Arquivo**: `src/database/merivaLearning.ts` linhas 1-2
**Erro**: Referencia módulos que não existem:
  - `../learning/learner`
  - `../learning/dnaMeriva`
**Impacto**: Compilação falha
**Solução**: Criar os módulos ou remover imports não utilizados

### 3. Falta de Dockerfile/Build Script

**Status**: Não há configuração de build Android nativa
**Razão**: Projeto requer `react-native-bluetooth-classic` que exige native build
**Solução**: Usar `npx expo prebuild && npx expo run:android` com Android Studio configurado

### 4. Bluetooth Classic Não Validado

**Biblioteca**: `react-native-bluetooth-classic` versão 1.73.0
**Status**: Instalada no package.json, mas não testada
**Necessário**: Executar `npm install && npx expo prebuild`

### 5. Falta de Estrutura de Dados Correta

**Problemas**:
- Nenhum arquivo de dados da Meriva real
- Nenhum baseline CAR_SCANNER
- Nenhuma separação de fontes (REAL vs SIMULACAO vs REFERENCIA)
- Nenhum arquivo de constantes do veículo

**Solução**: Criar arquivos TypeScript na pasta `src/data/`

### 6. Parser Incompleto

**Status**: Parser básico funciona, mas não suporta:
- Multi-frame
- Variações de header
- Normalização robusta
- Extração de payload garantida

**Solução**: Expandir com funções auxiliares

### 7. Falta de Command Queue

**Status**: Elm327Session envia comandos sequencialmente, mas não há fila explícita
**Problema**: Sem proteção contra concorrência
**Solução**: Implementar CommandQueue com mutex

### 8. Logger Incompleto

**Status**: `obdLogger.ts` referencia `csvLogger` que não existe
**Impacto**: Compilação falha
**Solução**: Implementar `csvLogger.ts`

### 9. DTC Manager Criado mas Não Integrado

**Status**: `dtcManager.ts` existe, mas:
- Não é importado em lugar nenhum
- Não é chamado da UI
- Não está em laboratorio.tsx

### 10. Histórico Criado mas Não Integrado

**Status**: `historyStore.ts` existe, mas:
- Não é alimentado durante leituras
- Não é exibido na UI
- Diagnóstico usa, mas lógica de alimentação está ausente

## RESULTADO DO TYPECHECK ANTES DE CORREÇÕES

Comandos que falharam:
- `src/database/merivaLearning.ts`: Módulos não encontrados
- `src/database/obdLogger.ts`: `csvLogger` não encontrado
- `src/obd/bluetoothManager.ts`: `Elm327CommandResult` não existe

## PLANO DE CORREÇÃO

**Fase 0 (Auditoria)**: ✅ Concluída

**Fase 1 (Compilação)**:
1. Corrigir `ElmCommandResult` em `bluetoothManager.ts`
2. Criar `csvLogger.ts`
3. Remover imports quebrados de `merivaLearning.ts`
4. Executar `npm run typecheck`

**Fase 2 (Dados Estruturados)**:
1. Criar `src/data/veiculo_meriva.ts`
2. Criar `src/data/baseline_car_scanner.ts`
3. Criar `src/data/pid_database.ts` (expandido)
4. Criar `src/data/protocolo_iso14230.ts`

**Fase 3 (Correção de Transporte)**:
1. Expandir `BluetoothClassicTransport`
2. Criar `CommandQueue`
3. Melhorar validação de inicialização

**Fase 4 (Parser Robusto)**:
1. Expandir `parser.ts` com funções auxiliares
2. Criar `normalizeObdResponse()`
3. Criar `extractResponseFrames()`
4. Testes completos

**Fase 5 (Integração)**:
1. Conectar Logger em queryPid
2. Conectar History em queryPid
3. Conectar DTC na tela
4. Conectar Learning quando source === REAL

**Fase 6 (Validação)**:
1. Typecheck
2. Build Android
3. Testes de compilação

## PRÓXIMO PASSO

Executar Fase 1 - Compilação imediatamente.

