# Integridade dos arquivos JSON críticos — Design

**Data:** 2026-11-03  
**Base:** `main` em `472cedf215e2d4e0fd18331196946cf256e2d7c4`  
**Entrega:** fase 1 — proteção dos arquivos estruturados críticos.

## Intenção

Impedir que uma leitura inválida seja interpretada como ausência de dados e que o próximo salvamento substitua arquivos JSON corrompidos, estruturalmente inválidos ou criados por uma versão futura do aplicativo. O objetivo é preservar registros do veículo, configurações, aprendizado, manutenção e autosave, permitindo recuperação somente de cópias que passaram por validação.

## Estado atual observado

A persistência continua local em JSON/TXT/CSV. O autosave já usa arquivo temporário e cópia anterior, mas não valida principal e backup antes de substituí-los. Configurações recriam defaults após erro de parse; veículo trata perfil inválido como inexistente; aprendizado recria um perfil vazio quando a leitura retorna `null`; manutenção devolve estrutura vazia e permite que uma gravação posterior substitua o original.

## Abordagens consideradas

1. **Proteção independente em cada módulo.** Menor mudança inicial, mas mantém implementações divergentes e repetição de erros.
2. **Utilitário compartilhado de leitura/recuperação e gravação atômica.** Um contrato comum valida o documento novo, inspeciona principal/backup/temporários, grava temporário, faz read-back, preserva cópia anterior e só então substitui. Cada módulo fornece seu validador e sua regra de schema.
3. **Migrar para SQLite.** Não resolve automaticamente a integridade dos arquivos já existentes e amplia o risco de migração sem medições no Galaxy A06.

**Decisão de implementação:** abordagem 2. É compatível com a arquitetura existente e limita a alteração ao armazenamento JSON. O autosave mantém seu contrato específico porque o temporário pendente dele tem semântica própria de recuperação.

## Regras de comportamento

- Arquivo ausente é diferente de arquivo corrompido.
- Arquivo ausente pode receber valores iniciais.
- Arquivo corrompido, inválido, em schema futuro ou caminho convertido em diretório nunca é sobrescrito automaticamente.
- Uma cópia anterior só pode alimentar a leitura depois de validar o documento completo. Recuperação por cópia anterior é somente leitura até reparo explícito do principal.
- Qualquer temporário pendente é preservado e bloqueia uma nova gravação sobre o mesmo recurso.
- Escrita nova: serialização, validação do payload, gravação temporária, leitura de retorno, cópia anterior validada, substituição e validação final.
- O status de integridade deve ser exposto na Central de Saúde sem apresentar dados de fallback como se tivessem sido gravados.
- Documentos legados sem `schemaVersion` continuam aceitos quando satisfazem o validador atual. Novas gravações incluem schema 1.

## Escopo

**Incluído:** `autosave.json`, `app-settings.json`, `veiculo.json`, `APRENDIZADO/dna_meriva.json`, `MANUTENCAO/registros.json`; validação de recuperação, proteção de temporários, indicadores em memória e testes.

**Fora desta fase:** SQLite, hash SHA-256 de backups, mudanças na retenção, spool CSV durável, reconciliação de viagens/DTC, mudanças Bluetooth/ELM327/ECU/GPS/autonomia, comandos OBD e alteração de `meriva_smart_daily_obd_history.txt`.

## Restrições de segurança e compatibilidade

- Preservar todos os arquivos originais em erro.
- Não descartar nem limitar o histórico TXT diário ECU.
- Não alterar regras de origem REAL/SIMULAÇÃO/seed.
- Não introduzir dependências ou migrar Expo SDK 51.
- Nenhum teste físico no Galaxy A06/ELM327 será declarado sem execução real.
- Nenhuma alteração será mesclada automaticamente em `main`.
