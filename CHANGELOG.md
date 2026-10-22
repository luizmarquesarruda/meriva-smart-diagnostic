# Changelog

## Unreleased

### Confiabilidade e aceitação
- Criado `docs/TEST_PLAN.md` com cenários críticos para ECU/ELM327, frescor de dados, autonomia, navegação, DTC, splash e validação de release.
- Adicionado o contrato RG-20 e uma verificação no gate para manter o plano de aceitação junto ao código.
- Os casos pendentes permanecem identificados como pendentes; não se presume teste físico nem recurso futuro implementado.

### Splash screen e documentação
- Restaurada a dependência `expo-splash-screen@~0.27.7` e alinhado o lockfile.
- Restaurada a configuração `expo.splash` em `app.json` com fundo escuro `#07111f` e `resizeMode: contain`.
- Adicionada proteção antirregressão para a dependência e configuração nativa da splash.
- Atualizados README, arquitetura, desenvolvimento, contribuição, auditoria e contrato antirregressão para refletir o estado atual e diferenciar configuração de splash de confirmação de uma imagem/logotipo.
- Validação automatizada e build Android pendentes até a CI do SHA final.

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
