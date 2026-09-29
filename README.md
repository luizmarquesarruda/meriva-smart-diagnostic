# MERIVA SMART DIAGNOSTIC

Aplicativo offline de diagnóstico automotivo para Chevrolet Meriva Maxx 1.4 8V.

## Fases Implementadas

### Fase 1: Bluetooth Classic Real ✅
- Transporte abstrato para ELM327
- Descoberta de dispositivos Bluetooth pareados
- Conexão real com inicialização AT
- Diferenciação entre BLUETOOTH, ELM e ECU

### Fase 2: Armazenamento Local ✅
- Estrutura MERIVA_SMART em DocumentDirectory
- Pastas: CONFIG, BANCO, LOGS, APRENDIZADO, DTC, LEITURAS, VIAGENS, BACKUP
- CSV para leituras e RAW OBD
- JSON para configuração de veículo e aprendizado
- TXT para banco de PIDs confirmados

### Fase 3: Sistema de Quota ✅
- Limite padrão: 2 GB
- Aviso em 90% de uso
- Limpeza automática preservando BANCO, APRENDIZADO, CONFIG, DTC
- Retenção de logs: 7 dias
- Retenção de leituras: 30 dias

### Fase 4: Registros Duplos (Raw e Interpretado) ✅
- TX/RX guardados em CSV
- Valores interpretados em CSV separado
- Fonte identificada (REAL vs SIMULACAO)
- Status de comando preservado

### Fase 5: Banco de PIDs Confirmados ✅
- Registro de PIDs que responderam da ECU
- Classificação obrigatória
- Timestamp de primeira e última visualização
- Contagem de ocorrências
- Confiança acumulada

### Fase 6: Perfil do Veículo ✅
- Armazenamento de dados básicos (Meriva Maxx, ano, VIN)
- Protocolo baseline
- Endereço da ECU

### Fase 7: Aprendizado Local (DNA da Meriva) ✅
- RPM por contexto (marcha lenta, aceleração, cruzeiro, desaceleração)
- Temperatura por fases (partida, aquecimento, normal)
- Mínimo, máximo, média por contexto
- Total de amostras
- Última atualização

### Fase 8: Backup ✅
- Backup automático de BANCO, APRENDIZADO, DTC, CONFIG
- Timestamp no nome do backup
- Preservação de conhecimento

## Próximas Fases

### Fase 9: Discovery de PIDs Suportados
- Enviar 0100, 0120, 0140, 0160
- Interpretar bitmaps
- Registrar PIDs que ECU responde

### Fase 10: Histórico Completo
- Registro de leituras periódicas
- Contexto de operação
- Timestamp
- Relacionamento com DTCs

### Fase 11: DTC (Códigos de Falha)
- Leitura de códigos
- Histórico de ocorrências
- Status (confirmado, pendente, inativo)
- Armazenamento em TXT

### Fase 12: Análise e Correlação
- Comparação com padrão aprendido
- Detecção de anomalias
- Relação entre PIDs
- Níveis de diagnóstico (1-4)

## Arquitetura

```
App (UI)
  ↓
Elm327Session
  ↓
BluetoothClassicTransport / SimulatedTransport
  ↓
ELM327 / Simulação
  ↓
ECU da Meriva
  ↓
Parser (PidDefinition + formulas)
  ↓
Storage (Raw + Interpretado)
  ↓
Aprendizado (DNA da Meriva)
  ↓
Análise
```

## Regras Fundamentais

1. **Sem dados falsos**: SEM DADOS, NÃO RESPONDEU, VALOR NÃO INTERPRETADO
2. **RAW TX/RX obrigatório**: Toda leitura preserva resposta original
3. **Simulação isolada**: Marcada explicitamente, não alimenta aprendizado
4. **Confirmação real**: PID PADRAO_OBD ≠ MERIVA_CONFIRMADO
5. **Diagnóstico cauteloso**: Evidência antes de conclusão

## Como Testar

1. Pareie o ELM327 nas configs Bluetooth do Android
2. `npm install && npx expo prebuild && npx expo run:android`
3. Abra Laboratório OBD
4. BLUETOOTH REAL → Listar Pareados → Conectar
5. Teste PID 010C
6. Confira ARMAZENAMENTO para logs

