# Auditoria comparativa de aplicativos OBD-II — 2026-10-27

## Objetivo e limites

Consolidar a pesquisa anterior sobre Car Scanner, Torque, OBDLink, OBD Auto Doctor, OBD Fusion, ScanMyOpel, python-OBD/OBDvis, OBD Metrics e OBD-Droid, convertendo os padrões úteis em requisitos verificáveis para o Meriva Smart Diagnostic. Esta auditoria não copia código, protocolos proprietários ou interfaces protegidas; compara padrões funcionais e formatos observados/documentados.

## Matriz comparativa e decisões

| Referência | Padrão útil observado na pesquisa | Decisão para o Meriva Smart Diagnostic | Estado no repositório |
|---|---|---|---|
| Car Scanner | Exportação CSV e logs de sessão; separação de dados de referência | Preservar exportação CSV interoperável, cabeçalho consistente e origem explícita dos dados; dados de exemplo nunca entram como viagens reais | Implementado: `src/database/csvLogger.ts`, `src/storage/driveCycleStorage.ts`; filtros de `CARSCANNER_SEED` |
| Torque | CSV e PIDs customizados | Manter catálogo de PID declarativo, fórmula/unidade/faixa e fluxo de consulta manual; validar bytes e resposta antes de calcular | Implementado: catálogo JSON, motor de fórmulas, consulta manual e testes de integridade |
| OBDLink | Diagnóstico do adaptador/conexão e registros exportáveis | Tornar observáveis timeout, erro, tempo de resposta, fila e recuperação; não confundir Bluetooth aberto com ECU respondendo | Implementado: `Elm327Session`, snapshot de saúde, fila serial e classificação de erros |
| OBD Auto Doctor | Leitura de DTC e diagnóstico orientado a evidências | Preservar DTC atual separado do histórico; resposta vazia só é válida com quadro positivo completo ou resposta explícita sem códigos | Implementado: scanner/engine DTC e RG-21 |
| OBD Fusion | Logs e relatórios de diagnóstico | Manter relatório TXT legível para suporte e CSV para análise tabular; registrar timestamps, unidade, origem e ausência como N/D | Implementado: autosave TXT e CSV, com testes de escaping |
| ScanMyOpel | Especialização por fabricante/veículo (detalhes públicos de formato são limitados) | Usar perfis Opel/Meriva somente para priorizar candidatos; nunca marcar suporte de PID sem resposta RAW_ECU válida | Parcial: catálogo Meriva e evidência RAW; somente PID 010C tem resposta específica documentada no Diário |
| python-OBD / OBDvis | Implementação transparente por comando, parser e telemetria | Preservar TX/RX, validar bytes, tamanho e cabeçalho, distinguir timeout/NO DATA/unsupported e evitar valores sintéticos | Implementado em parser, camada ELM, logs e testes de limites |
| OBD Metrics | Catálogo estruturado de PID em JSON | Continuar usando JSON para catálogo, fórmulas, unidades, faixas e políticas estáticas; versionar e validar integridade no CI | Implementado em `src/knowledge/*.json` e testes de consistência |
| OBD-Droid | CSV para intercâmbio e SQLite para dados estruturados/customizados | Manter CSV como exportação e estudar SQLite para o histórico operacional de viagens, não para substituir todos os formatos | **DB-170 implementado em branch isolada; CI final pendente**: SQLite passa a ser fonte de verdade de viagens; `index.json` fica como espelho/recuperação. Ainda não incorporado à `main`. |

## Arquitetura de formatos aprovada

- **JSON**: catálogo de PIDs, fórmulas, ranges, políticas, configurações e manifesto/versionamento. É declarativo e fácil de validar; não deve ser usado para reescrever um histórico crescente a cada viagem.
- **SQLite**: destino recomendado para o histórico operacional estruturado de viagens, consultas por data, gráficos e integridade transacional. Escopo delimitado à tabela de viagens e, se necessário, metadados/schema; não armazenar cada ponto de alta frequência no banco sem requisito medido.
- **CSV**: exportação interoperável de viagens e telemetria. Escapar vírgulas, aspas, LF/CR e manter cabeçalho por segmento; CSV não é o banco de dados autoritativo.
- **TXT**: diagnóstico legível, relatório de autosave e pacote de suporte. Ausências aparecem como N/D; não é fonte de verdade para cálculos.
- **RAW/TX-RX**: evidência de diagnóstico e depuração com timestamp, comando, resposta e status. Separar da interpretação calculada.
- **Binário**: não introduzir para o histórico atual; não há evidência de benefício que justifique custo de migração e inspeção.

## Funcionalidades de alto valor a manter e expor

1. **Cockpit com leitura atual e idade da amostra**: leitura vencida vira N/D; não usar médias de buffer para esconder alerta de temperatura/tensão/reserva.
2. **Saúde da conexão**: protocolo, resposta ECU real, latência, timeouts, rejeições de fila e motivo de recuperação.
3. **Descoberta/consulta de PID por sessão**: cache apenas prioriza candidatos; a confirmação exige resposta ECU válida na sessão atual. Não reutilizar descoberta entre ECUs/sessões.
4. **Diagnóstico DTC com proveniência**: código atual, histórico, status, quadro de resposta e definição legível separados.
5. **Consumo/viagem com qualidade explícita**: viagens sem combustível confiável permanecem no histórico, mas não contaminam médias ou autonomia.
6. **Exportação e backup verificáveis**: CSV/TXT para interoperabilidade/suporte; manifesto de backup verificado. DB-170 sincroniza a cópia SQLite antes do pacote de backup e expõe restauração a partir de snapshots locais validados; a CI ainda deve confirmar a implementação antes da integração.
7. **UI nativa**: padrões visuais de MagicPath/Floot devem ser traduzidos para Expo/React Native; a tela web de protótipo não é fonte de verdade de conexão ou cálculo. Manter estados desconectado, conectando, adaptador conectado, ECU validada, dados vencidos e indisponível distintos.

## P1–P2: critérios de execução

### P1 — catálogos, fórmulas e experiência de diagnóstico
- [x] PID 0144 adicionado com fórmula/faixa/unidade e sem presumir suporte físico nem inserir na fila automática.
- [x] Inventário runtime sincronizado: 35 PIDs, 35 faixas e 21 definições de fórmula na auditoria vigente.
- [x] Correções DTC, PID 0101 e enum PID 0151 reconciliadas.
- [x] Catálogo JSON e exportações CSV/TXT mantidos em papéis separados.
- [ ] Validar DB-170: migração transacional/idempotente, backup incluindo SQLite, restauração e suíte dedicada devem passar na CI do SHA final; somente então atualizar o status. A branch ainda não foi incorporada à `main`.

### P2 — Bluetooth Classic / ELM327 e evidência real
- [x] Uma única fila serial compartilhada; no máximo 16 comandos ordinários pendentes, com rejeição explícita e acesso reservado a fechamento/recuperação.
- [x] Métricas de fila, timeout, erros e resposta disponíveis para diagnóstico.
- [x] Conexão Bluetooth não é tratada como prova de ECU conectada; confirmação depende de resposta OBD válida.
- [x] Buffer de descoberta limitado por execução/sessão; cache não comprova suporte.
- [x] Descoberta automática prioriza o último adaptador validado, depois nomes ELM/OBD e então outros dispositivos pareados; seleção explícita não troca de adaptador silenciosamente.
- [x] Retry padrão reduzido de 20 tentativas/8 s para 3 tentativas/1,5 s por candidato; uma varredura de protocolos esgotada sem resposta válida ao PID 010C avança ao próximo candidato, sem repetir a varredura longa no mesmo adaptador.
- [x] Fallback acrescentado para protocolos SAE J1850 PWM/VPW (IDs 1 e 2), mantendo ATSP0 como negociação inicial e a exigência de resposta ECU real 41 0C.
- [ ] Teste físico no Samsung Galaxy A06 / Android 16 com ELM327 e ECU real; comparar leituras com instrumento/condição conhecida. Não pode ser substituído por CI.
- [ ] Medir perfil, latência até 41 0C, timeout/NO DATA e reconexão no adaptador real; não alegar ganho de velocidade ou estabilidade sem captura física.

## Critérios de aceitação da próxima mudança

- Migração SQLite preserva IDs, timestamps, fonte e validade do combustível; migração repetida é idempotente.
- O JSON legado só é removido após importação, contagem e leitura de amostra verificadas; se a fonte estiver inválida, preservar arquivos e falhar sem apagar.
- Backup inclui o arquivo SQLite e manifesto/contagem; restauração não confunde banco ausente com histórico vazio.
- Leitura do histórico, inserção/deduplicação, recuperação e gráficos cobertos por testes; JSON/CSV/TXT continuam com compatibilidade definida.
- Gate anti-regressão, TypeScript, suíte completa e build Android passam no mesmo SHA.
- Hardware real permanece como item de validação separado.
