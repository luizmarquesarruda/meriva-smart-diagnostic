# MERIVA SMART DIAGNOSTIC

Aplicativo offline de diagnóstico automotivo para Chevrolet Meriva Maxx 1.4 8V 2011/2012.

## Stack
- Expo
- React Native
- TypeScript
- Expo Router
- armazenamento local e offline

## Estrutura principal
- `app/` — telas e rotas do app
- `src/obd/` — protocolo, parser e detecção ELM327
- `src/database/` — arquivos TXT/CSV/JSON
- `src/learning/` — aprendizado local e DNA da Meriva
- `src/diagnostics/` — regras e correlações
- `src/storage/` — quota, limpeza e backup

## Primeira fase implementada
- interface inicial
- navegação básica
- layout de home e painéis de diagnóstico
- módulos de banco local e armazenamento
- estrutura de diretórios esperada para a Meriva Smart

## Observações importantes
- Sem uso de IA externa
- Sem dependência de internet
- Sem mock de dados reais
- Os valores devem ser obtidos da ECU/ELM327 em operação real

