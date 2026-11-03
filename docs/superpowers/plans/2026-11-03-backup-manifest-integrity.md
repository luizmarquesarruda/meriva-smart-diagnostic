# Integridade do manifesto de backup — Plano de implementação

> **Para agentes de implementação:** seguir a skill `superpowers:executing-plans` e manter a execução isolada em branch. Cada tarefa deve provar RED → GREEN antes de concluir.

**Objetivo:** garantir que backups novos tenham manifesto verificável por arquivo e que a restauração rejeite corrupção, substituição ou caminhos inseguros.

**Arquitetura:** `src/storage/backup.ts` mantém a API pública existente; manifestos schema 2 registram caminhos relativos, tamanhos e SHA-256 UTF-8. Leitura/restauração schema 1 permanece compatível.

**Stack:** React Native, Expo SDK 51, TypeScript, Expo FileSystem e testes Node em `tests/regression.test.js`.

## Restrições globais
- Preservar os oito diretórios: BANCO, APRENDIZADO, DTC, CONFIG, LEITURAS, LOGS, VIAGENS e MANUTENCAO.
- Não truncar, limitar ou sobrescrever `meriva_smart_daily_obd_history.txt`.
- Não mudar Bluetooth, ELM327, ECU, GPS, autonomia, UI ou comandos OBD.
- Não introduzir SQLite ou dependências sem aprovação.
- Não alterar `main`, não mesclar PR automaticamente.
- Não declarar teste físico no Galaxy A06/ELM327 sem evidência.
- Compatibilidade de manifesto schema 1 deve permanecer.

## Estado das tarefas

### Tarefa 1 — Testes de integridade
- [x] Exigir schema 2 para novos backups.
- [x] Verificar inventário de arquivos e SHA-256 por arquivo.
- [x] Rejeitar alteração de conteúdo com tamanho idêntico.
- [x] Rejeitar caminhos de traversal no manifesto.
- [x] Executar teste RED antes da implementação.

### Tarefa 2 — Implementação
- [x] Implementar SHA-256 UTF-8 sem dependência adicional.
- [x] Criar inventário recursivo com caminho relativo, tamanho e hash.
- [x] Validar caminhos e unicidade.
- [x] Verificar manifesto em listagem, staging e restauração.
- [x] Manter leitura/restauração schema 1.
- [x] Executar suíte completa e build Android.

### Tarefa 3 — Documentação e revisão
- [x] Atualizar changelog, plano de testes e contrato anti-regressão.
- [ ] Revisar diff final e confirmar apenas código de backup/testes/documentação.
- [ ] Abrir PR contra main após CI do SHA documental final.
- [ ] Manter PR aberta, sem merge, até revisão/autorização.

## Evidência já obtida
- Branch: `fix/phase2-backup-manifest-integrity-20261103`
- Commit de implementação: `13d22004563cbf516a6d3f82cd9213d927dee43d`
- CI run: `41618859707`
- `validate`: sucesso.
- `android-build`: sucesso; APK standalone montado e verificado, checksum gerado.
- Upload do APK: pulado pelo workflow nesta branch; não há artefato de APK publicado por esta execução.
- Teste físico Galaxy A06 + ELM327/ECU: **não validado**.

## Foco de revisão
- Confirmar hash UTF-8 correto para caracteres não ASCII e pares surrogate.
- Confirmar detecção de arquivos extras, ausentes, duplicados e caminhos inseguros em todas as rotas de restauração.
- Confirmar que manifestos schema 1 não são regravados silenciosamente como schema 2.
- Confirmar que SHA-256 é descrito como integridade contra corrupção, não como assinatura/autenticidade.
- Confirmar que o backup continua cobrindo LOGS e LEITURAS e não interfere no histórico diário TXT.
- Verificar consistência do snapshot: esta fase ainda não pausa polling nem descarrega filas Learning/CSV de forma transacional; tratar isso em fase separada.

## Risco conhecido
O manifesto e os arquivos residem juntos. Um agente capaz de alterar ambos pode recalcular os hashes; portanto, SHA-256 não substitui assinatura/HMAC nem proteção de acesso. A implementação atual é uma barreira de detecção de corrupção e divergência, não uma garantia de autenticidade.
