# Changelog

## Unreleased

### Auditoria de obsolescência
- Esclarecida a distinção entre o nome do projeto MERIVA SMART e o rótulo genérico `Smart OBD Diagnostic` do app Expo; corrigidas descrições antigas de navegação e framing Bluetooth.
- Registrado débito de modernização do Expo SDK 51 e da API antiga de FileSystem; upgrade permanece separado até existir baseline físico de Bluetooth/GPS e plano de migração validado.

### Cockpit
- Removido o resumo de falhas/DTC do cockpit para evitar duplicação com a página Saúde.
- O terceiro cartão agora mostra pressão do coletor (PID 010B) apenas com leitura real e recente; sem leitura válida, mostra N/D.
- A navegação inferior do cockpit agora exibe rótulos visíveis para Painel, Diagnóstico, Dados, Viagens e Mais, mantendo nomes acessíveis e alvos de toque existentes.

### Integridade de telemetria GPS
- Timestamps inválidos, repetidos ou regressivos são descartados sem fabricar uma marca temporal atual.

### Atualização de localização e clima online
- Localidade/clima opcional atualizados na abertura, a cada 15 minutos e quando a conectividade volta; funciona tanto em Wi-Fi quanto em dados móveis 4G/5G.
- Consultas respeitam disponibilidade de internet, impedem chamadas simultâneas, têm intervalo mínimo de repetição e limpam inscrições/temporizadores ao desmontar.
- Falha de rede invalida a temperatura antiga e preserva apenas a última localidade identificada; permissões de localização continuam não sendo solicitadas automaticamente.

### Estabilidade Bluetooth Classic
- Estado do rádio revalidado antes de cada socket RFCOMM; fallback/retry interrompido quando o Bluetooth está desligado ou o estado é indeterminado.
- Espera por conexões nativas pendentes revalida rádio e bloqueio compartilhado após cada await, impedindo sockets simultâneos entre múltiplas instâncias.
- Causa nativa preservada na splash com opção de abrir o painel; CI não substitui teste físico do ELM327.

### Integridade OBD-II
- Portada do protótipo Floot para a tela nativa `app/laboratorio.tsx` a seção visual de validação de fórmulas; a interface reutiliza `decodeFormula` e sinaliza que os valores-limite são casos matemáticos, não telemetria real.
- Corrigidas as faixas máximas de plausibilidade dos PIDs 0106, 0107, 012D e 015D para aceitar os máximos matemáticos exatos das fórmulas padronizadas, sem arredondamento que rejeite uma resposta válida.
- O motor de fórmulas agora rejeita bytes de entrada não inteiros ou fora de 0–255; adicionados testes de regressão para limites e bytes inválidos.

### Manutenção e combustível
- Adicionada página local para registrar quilometragem, histórico de serviços, lembretes por km/data (considerando uso normal ou severo) e abastecimentos por combustível/litros/valor.
- Persistência isolada dos autosaves OBD: abastecimentos manuais não alimentam as estimativas nem os cálculos de consumo do motor diagnóstico.
- Testes de regras de calendário, intervalos, dados ausentes e acesso à tela incluídos na validação e no gate antirregressão.

### Confiabilidade e aceitação
- O cockpit alterna cidade/bairro a cada 10 s somente quando os rótulos estão disponíveis sob permissão de localização já concedida; alerta térmico a partir de 110 °C mantém prioridade no indicador central durante a anomalia. Testes de geocodificação e layout ampliados.
- Permissão de localização deixa de bloquear a preparação do diagnóstico OBD; GPS, clima e captura de percurso permanecem degradáveis quando o usuário não autoriza localização. O teste de permissões foi reforçado e incluído no gate antirregressão.
- Criado `docs/TEST_PLAN.md` com cenários críticos para ECU/ELM327, frescor de dados, autonomia, navegação, DTC, splash e validação de release.
- Adicionado o contrato RG-20 e uma verificação no gate para manter o plano de aceitação junto ao código.
- Os casos pendentes permanecem identificados como pendentes; não se presume teste físico nem recurso futuro implementado.
- A autonomia atual descarta nível de combustível PID 012F sem timestamp válido ou com mais de 30 s, inclusive após perda de resposta da ECU; testes de validade temporal ampliados.
- O serviço de viagens filtra a autonomia em seu estado público e a tela Dados usa apenas estimativa atual, impedindo que o valor persistido de viagens anteriores apareça como atual.
- Telemetria ao vivo rejeita timestamps inválidos ou futuros antes de produzir tendências e contexto operacional.
- Leitura de DTC diferencia quadro positivo válido de NO DATA/timeout/quadro incompleto; falha de leitura não é exibida como ausência de códigos.

### Splash screen e documentação
- A splash operacional respeita `autoConnectObd=false` e permite abrir o cockpit após falhas repetidas, evitando bloquear configurações e conexão manual quando não há ECU disponível.
- O teste antirregressão e `docs/TEST_PLAN.md` agora cobrem o caminho alternativo de inicialização sem conexão.
- Restaurada a dependência `expo-splash-screen@~0.27.7` e alinhado o lockfile.
- Adicionado `assets/splash.png` (PNG transparente 512×512) com a marca MERIVA SMART e configurado no plugin nativo `expo-splash-screen` com largura de 280 dp, fundo `#07111f` e `resizeMode: contain`.
- Mantida a configuração `expo.splash` legada apontando para o mesmo asset e reforçado `tests/projectBaseline.test.js` para exigir o plugin, o caminho e a assinatura PNG real.
- Atualizados README, arquitetura, desenvolvimento, contribuição, auditoria e contrato antirregressão para refletir o estado atual e diferenciar configuração de splash de confirmação de uma imagem/logotipo.
- Validação de CI/build e inspeção visual de inicialização fria ainda pendentes para o SHA que contém o asset.

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
