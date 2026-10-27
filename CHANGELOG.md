# Changelog

## Unreleased

### Guarda de tipo no parser KWP — DB-169
- Corrigido erro TypeScript por acesso potencialmente indefinido a `tokens[0]` durante validação do cabeçalho KWP; a CI anterior detectou a falha antes dos testes.

### Correção do parser KWP — DB-167
- Reconhecido o quadro compacto KWP com cabeçalho de três bytes e checksum, incluindo o RX real `84F111410C0000D3` do teste Bluetooth.
- O parser agora valida o comprimento declarado e a soma de verificação antes de aceitar a resposta; checksum incorreto, bytes extras e quadros incompletos continuam rejeitados.
- Incluídos casos compactos/espaçados em `pidParserIntegrity.test.js`, contrato RG-58 e plano BT-CONN-06. A CI anterior não valida esta alteração; o ensaio físico pós-correção permanece pendente.

### Correções de revisão DB-166
- Alinhado o limite efetivo de retry Bluetooth: sem override, usa a política do catálogo (3 tentativas); as opções explícitas 3/10/20 continuam configuráveis.
- O buffer de consumo agora integra o combustível durante baixa velocidade e marcha lenta sem acrescentar distância quando o veículo está parado.
- O balanço de tanque cheio rejeita viagens com validade do combustível ausente/desconhecida.
- A reconciliação de DTC ausente preserva `lastSeen`, mantendo o horário da última observação real.


### Conexão Bluetooth Classic / ELM327
- Reduzido o padrão de retry de conexão de 20 tentativas com intervalo de 8 s para 3 tentativas por adaptador com intervalo de 1,5 s, mantendo os limites configuráveis.
- Depois que todos os protocolos de fallback falham em obter resposta ECU válida ao PID 010C, a aplicação registra o esgotamento e avança ao próximo dispositivo pareado, sem repetir a mesma varredura completa no adaptador atual.
- A tabela de fallback agora inclui os protocolos SAE J1850 VPW/PWM (IDs 2 e 1); ATSP0 continua sendo a tentativa automática inicial e 41 0C continua sendo o gate de ECU.
- Adicionados testes de política de retry/fallback e contrato anti-regressão RG-52. A validação física e qualquer ganho de estabilidade/latência continuam pendentes de teste no Galaxy A06/Android 16 com ELM327/ECU real.
- A recuperação do ELM327 agora exige payload completo de `010C` validado pelo parser canônico; `41 0C` isolado ou payload malformado não confirma recuperação. Adicionados teste dinâmico com sessão ELM e contrato RG-53.

### Comparativo de apps OBD-II e saúde Bluetooth
- Consolidada a auditoria comparativa de Car Scanner, Torque, OBDLink, OBD Auto Doctor, OBD Fusion, ScanMyOpel, python-OBD/OBDvis, OBD Metrics e OBD-Droid, mapeando funções úteis para recursos já existentes e registrando a lacuna de SQLite para o histórico operacional.
- A tela Bluetooth agora exibe profundidade/pico/recusas da fila ELM327 e espera média/máxima. Recusas ou espera máxima de pelo menos 5 s geram aviso; métricas inválidas são neutralizadas.
- Incluído teste unitário de apresentação das métricas e proteção no gate de baseline. A validação de DB-162 deve ocorrer na CI do novo SHA; a CI verde anterior não se transfere.
- Não houve teste físico no Galaxy A06/Android 16 com ELM327/ECU real. A migração SQLite ainda não foi implementada.


### CI e controle de regressões
- Evitada a execução duplicada da mesma CI em branches que já possuem PR para `main`: commits de branches são validados pelo evento `pull_request`, e o evento `push` fica reservado a `main`. O despacho manual permanece disponível.

### Autonomia com fallback controlado e tela dedicada
- A tela nativa de autonomia segue a referência grafite/âmbar, mostra estado real da ECU, origem do cálculo, idade do PID 012F, consumo usado e regras de segurança; os valores demonstrativos do protótipo não foram portados para produção.
- A mediana do PID 012F continua sendo considerada atual até 30 s. Entre >30 s e 60 s, uma estimativa temporária só é autorizada com pelo menos duas amostras reais no buffer, ECU e sessão conectadas, timestamp não futuro e consumo válido. Após 60 s, o buffer não sustenta autonomia.
- A tela e o cockpit rotulam separadamente leitura atual, ESTIMADA · BUFFER, balanço de tanque cheio e N/D; a tela Dados usa a mesma regra de cálculo. O fallback por tanque cheio permanece sujeito à validação independente existente.
- A interface não presume suporte/calibração física do PID 012F e declara que a capacidade nominal de 56 L não comprova linearidade percentual→litros na ECU específica.

### Autonomia: continuidade do consumo e integridade do balanço
- A mediana de nível de combustível tem limite simultâneo de 10 leituras e 60 segundos, para que um valor extremo antigo não sobreviva só porque cada consulta chegou em menos de 30 segundos.
- O consumo móvel perde sua janela quando a taxa é inválida, a origem muda, o timestamp sai de ordem, o intervalo supera 10 segundos ou a taxa deixa de atualizar por mais de 10 segundos; exige dez novos intervalos válidos antes de voltar a alimentar autonomia.
- Viagens com lacuna de combustível superior a 30 segundos ficam com consumo N/D, mesmo quando há litros acumulados suficientes numericamente.
- O fallback por tanque cheio rejeita viagens com menos de 0,05 L, média incoerente com distância/litros ou períodos sobrepostos; o estado da viagem ativa só conta se a própria média atual passar na validação de confiabilidade.
- Não houve alteração da capacidade nominal de 56 L nem declaração de que o PID 012F esteja calibrado para a ECU específica. A linearidade percentual→litros e a precisão física ainda exigem comparação com o carro.

### Fila ELM327 e custo de escrita CSV
- A fila rejeita novas consultas ordinárias quando há 16 comandos aguardando; a rejeição é explícita em vez de permitir acúmulo ilimitado. Fechamento e recuperação continuam reservados e serializados.
- O snapshot de saúde expõe profundidade atual/máxima, rejeições e métricas de espera para diagnosticar rajadas e contenção.
- Logs de alto volume em LOGS/ rotacionam aproximadamente a cada 1 MiB em segmentos CSV independentes com cabeçalho; a reescrita fica limitada ao segmento ativo e os anteriores permanecem intactos.
- CSV de viagens fora de LOGS/ conserva o caminho existente; não é usado append não suportado pela API legada do Expo FileSystem.
- O gate anti-regressão foi alinhado à fila instrumentada e os literais LF/CR das fixtures foram corrigidos; a CI seguinte apontou uma guarda TypeScript em FileInfo, corrigida no DB-156.
- DB-157 distingue a operação ativa das consultas que aguardam para que o limite de 16 se aplique a operações realmente pendentes; a CI anterior exigiu correção após o teste de saturação.
- DB-158 alinha a asserção anti-regressão ao bloco `finally` multilinha da fila, sem afrouxar a verificação de serialização ou backpressure.

### Limites de memória da telemetria
- Telemetria ao vivo valida IDs Mode 01 e limita o armazenamento a 64 séries ativas, com até 120 amostras por PID; LRU mantém streams recentes e remove de forma sincronizada o índice atual.
- A auditoria de buffers não adiciona janelas a GPS, diagnóstico ou Bluetooth sem evidência; registra como candidatos distintos o backpressure da fila de comandos ELM e a escrita segmentada de logs CSV.

### Autonomia e consumo móvel
- Criado buffer real de até dez leituras do PID 012F com mediana para reduzir oscilações de nível, além de janela móvel de dez intervalos de velocidade/fluxo para calcular consumo atual por distância e combustível integrados.
- A autonomia prioriza consumo móvel recente, depois consumo confiável da viagem e média histórica; valores sintéticos, fluxo em cache reintegrado e nível vencido continuam proibidos.
- Incluídos testes determinísticos para preenchimento/rotação do buffer, outliers, lacunas, limites físicos, frescor e integração nas telas.
- Adicionado fallback de combustível restante por balanço do último tanque completo quando o PID 012F não está disponível, com validação de viagens reais, abastecimentos parciais e origem explícita da estimativa.
- A janela móvel é reiniciada quando muda a fonte de fluxo ou a configuração do combustível; falhas ao salvar abastecimento preservam os campos preenchidos.
- O fallback por tanque cheio cruza o odômetro atual com a distância rastreada desde o último abastecimento; divergência ou odômetro desatualizado invalida a estimativa em vez de superestimar o alcance.

### Layout e navegação Floot
- Alinhada a barra inferior do cockpit ao layout de referência: seis destinos com ícones de 32 dp, uniformemente distribuídos e sem legendas visíveis.
- Corrigido o mapeamento de cada ícone para sua tela funcional: Painel, Conexões, Diagnóstico, Viagem, Laboratório e Configurações; nomes acessíveis preservados.
- Mantidos Dados/Telemetria e Mais Recursos em caminhos secundários para não remover funções existentes.
- Nenhuma alteração na conexão Bluetooth Classic, fila ELM327, validação da ECU, fórmulas PID, consumo, autonomia ou histórico.

### Integridade de DTC e enum de combustível
- DTC histórico deixa de ser retornado como atual mesmo se o status persistido estiver em conflito; nova ocorrência só incrementa ao reaparecer, e Mode 03 reconcilia ausências apenas para CURRENT/CONFIRMED REAL_OBD após resposta válida.
- Campos CSV com CR isolado agora são citados corretamente, assim como campos com vírgulas, aspas e LF.
- PID 0101 separa contagem DTC, MIL e readiness com máscaras corretas para motores SI/CI; PID 0151 decodifica códigos de combustível conhecidos e rejeita códigos desconhecidos.

### Auditoria de documentação OBD/Meriva
- Incluídos links oficiais para os manuais do proprietário Meriva 2011 e 2012 e separada a documentação do veículo das definições genéricas SAE.
- Corrigido o mapa do PID 0101: C4/D4 para ciclo Otto são disponibilidade/incompletude do monitor de filtro de partículas de gasolina; nenhum dos bits significa refrigerante do ar-condicionado.
- Alinhados nomes e unidades dos PIDs 0111, 0145, 015A e 0130 em catálogo, cockpit, aprendizado e relatórios.
- Reforçados o gate anti-regressão e os testes para impedir erros de bit mapping, unidade, nomes e alegações de compatibilidade sem RAW_ECU.

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
- Reconciliado o inventário completo com o catálogo runtime: 35 PIDs, 35 faixas e 21 fórmulas; corrigidos o contrato do PID 0101, o rótulo do PID 0111, a unidade de 0130 e a inclusão do PID 0144 sem falsa confirmação.
- Integrado o PID padrão 0144 (Commanded Equivalence Ratio) com fórmula de dois bytes, unidade adimensional, faixa exata e testes de fronteira; mantido como alvo de confirmação, sem presumir suporte da ECU nem adicioná-lo ao polling automático.
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
