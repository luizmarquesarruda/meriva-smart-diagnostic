# Changelog

## 1.0.1

### Bluetooth
- verificação do Bluetooth na abertura;
- solicitação de permissões Android;
- solicitação de ativação;
- reconexão da verificação ao voltar para o app;
- transporte Bluetooth Classic real.

### OBD
- classificação explícita das respostas do ELM327;
- descoberta de PIDs;
- preservação da distinção entre resposta, erro e ausência de dados.

### Persistência
- autosave com validação;
- recuperação do arquivo anterior;
- migração de schema;
- correção do cálculo de tamanho de backup;
- quota baseada no tamanho real dos arquivos.

### Engenharia
- CI inicial;
- documentação de arquitetura;
- guia de desenvolvimento;
- política de segurança;
- CODEOWNERS;
- .gitignore.
