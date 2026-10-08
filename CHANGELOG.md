# Changelog

## 1.0.1

### Bluetooth
- verificação do Bluetooth na abertura;
- solicitação de permissões Android;
- solicitação de ativação;
- reconexão da verificação ao voltar para o app;
- transporte Bluetooth Classic real;
- recepção por evento sem mistura com leitura manual;
- serialização de comandos ELM327.

### OBD
- classificação explícita das respostas do ELM327;
- descoberta de PIDs com decodificação de bitmap;
- PIDs padrão adicionais, incluindo nível de combustível 012F e taxa de combustível 015E;
- leitura e persistência de DTCs do modo 03;
- preservação da distinção entre resposta, erro e ausência de dados.

### GPS
- GPS do celular iniciado automaticamente;
- velocidade e distância em primeiro plano;
- filtros de precisão e saltos;
- cálculo de km/L somente quando litros válidos são fornecidos.

### Combustível
- remoção da entrada manual de litros na tela principal;
- PID 012F para nível/reserva/autonomia;
- integração temporal da taxa OBD PID 015E em L/h;
- rejeição de amostras inválidas e intervalos longos;
- teste automatizado do acumulador de combustível.

### Persistência
- autosave com validação e recuperação;
- migração de schema;
- quota baseada no tamanho real dos arquivos;
- histórico de ciclos usando o storage dedicado;
- tipo de DTC centralizado.

### Limpeza
- remoção de módulos legados sem caminho de execução;
- remoção de dependências diretas sem uso.

### Engenharia
- CI com Expo Doctor, TypeScript, testes e build Android release standalone;
- documentação de arquitetura, desenvolvimento e auditoria.


## 2026-10-08 — Validação de infraestrutura

- A nota operacional de gatilho da CI foi movida do README para este changelog.
- O script de validação passou a executar TypeScript, ESLint e os 19 testes pelo runner nativo do Node.
- A suíte mantém o carregamento em memória dos módulos TypeScript e ganhou um helper único para resolução de imports relativos e JSON.
- Foram corrigidas inconsistências do catálogo de conhecimento detectadas pela suíte: unidade `status`, alias `km/h` e tratamento do PID 0101 como bitfield sem faixa escalar.
- A configuração Android removeu os scripts web/ios e fixou `@babel/core` em 7.29.7.
- A infraestrutura de lint usa `eslint-config-expo@7.1.2`, compatível com o fluxo legado do Expo SDK 51, e Prettier permanece disponível como formatter.
- A estimativa de consumo passou a considerar composição de combustível por PID 0152, configuração manual ou fallback explicitamente estimado, sem dados de abastecimento.
