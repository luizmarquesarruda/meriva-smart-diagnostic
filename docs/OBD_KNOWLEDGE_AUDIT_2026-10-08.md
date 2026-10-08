# Auditoria documental OBD/PID/DTC — 2026-10-08

## Escopo
Auditoria do conhecimento usado pelo Meriva Smart Diagnostic para o veículo documentado no projeto: Chevrolet Meriva Maxx 1.4 8V ECONO.FLEX, MY 2012 / referência 2011/2012.

A documentação oficial Chevrolet é usada para configuração do veículo e contexto operacional. O mapa de PIDs e fórmulas é baseado no padrão OBD-II SAE J1979 / ISO 15031-5. As definições padronizadas de DTC usam SAE J2012. Compatibilidade de ECU/protocolo específica da Meriva é mantida separada da definição OBD genérica.

## Fontes pesquisadas
1. Chevrolet Brasil — manuais de proprietários de anos anteriores: Meriva 2008–2012.
2. Manual do Proprietário Chevrolet Meriva MY12, Brasil.
3. SAE J1979_202505 / SAE J1979-DA — serviços OBD-II, mensagens e registro global de identificadores de dados.
4. SAE J2012 — formato e definições padronizadas de DTC.
5. Referências abertas de implementação OBD-II foram usadas somente para conferência cruzada, não como autoridade de compatibilidade da Meriva.

## Resultado da auditoria de PIDs

| PID | Fórmula / interpretação | Bytes | Situação |
|---|---|---:|---|
| 0104 | A × 100 / 255 | 1 | correto |
| 0105 | A − 40 °C | 1 | correto |
| 0106 | (A − 128) × 100 / 128 | 1 | correto |
| 0107 | (A − 128) × 100 / 128 | 1 | correto |
| 010B | A kPa | 1 | correto |
| 010C | (256A + B) / 4 rpm | 2 | correto |
| 010D | A km/h | 1 | correto |
| 010E | A / 2 − 64 ° | 1 | correto |
| 010F | A − 40 °C | 1 | correto |
| 0110 | (256A + B) / 100 g/s | 2 | correto |
| 0111 | A × 100 / 255 % | 1 | correto |
| 0114 | A / 200 V; B é dado adicional de ajuste O2 | 2 | CORRIGIDO |
| 012F | A × 100 / 255 % | 1 | correto |
| 0131 | 256A + B km | 2 | correto |
| 0142 | (256A + B) / 1000 V | 2 | correto |
| 0151 | código enumerado de combustível | 1 | correto; não é medição de composição |
| 0152 | A × 100 / 255 % | 1 | correto |
| 015E | (256A + B) / 20 L/h | 2 | correto |

### Correção crítica encontrada
O PID 0114 estava declarado com somente 1 byte. Isso fazia o parser aceitar uma resposta truncada para um PID cuja resposta padronizada possui dois bytes. A tensão usa o byte A; o byte B contém informação adicional de ajuste de curto prazo do sensor.

Correção:
- pids.json: 0114.bytes = 2;
- meriva_confirmed_pids.json: candidato 0114.bytes = 2;
- fórmula O2_VOLTS continua usando o byte A para a tensão;
- regressão adicionada para resposta 41 14 6A 80 → 0,53 V.

## Descoberta de PIDs
O aplicativo mantém a descoberta por bitmaps OBD (0100, 0120, 0140, 0160 etc.) separada da confirmação individual. Um PID anunciado pelo bitmap é apenas suportado pela ECU; não é automaticamente uma evidência de valor válido.

Regra: bitmap → consulta individual → resposta positiva → payload completo → fórmula → plausibilidade → REAL_OBD.

A lista meriva_confirmed_pids.json continua sendo a autoridade local para o que foi realmente observado na Meriva alvo. Seed CarScanner não é promovido a confirmação.

## Resultado da auditoria de DTCs
O catálogo foi alinhado ao padrão SAE J2012 e agora explicita standardized: true.

DTCs catalogados no aplicativo:
- P0123 — sinal alto do circuito A de posição da borboleta/pedal;
- P0133 — resposta lenta do O2 Banco 1 Sensor 1;
- P0135 — circuito do aquecedor do O2 Banco 1 Sensor 1;
- P0301 — falha de combustão no cilindro 1;
- P0420 — eficiência do catalisador abaixo do limite no Banco 1.

A definição do DTC não é uma condenação de componente. DTCs específicos do fabricante que não tenham fonte documental adequada não são inventados no catálogo.

## Correções no motor diagnóstico local
O motor passou a:
1. aceitar DTC como evidência atual somente quando fonte = REAL_OBD e status = CONFIRMED, PENDING, PERMANENT ou CURRENT;
2. bloquear DTCs históricos/inativos de gerar hipóteses de falha atual;
3. ignorar SIMULACAO para confiança diagnóstica;
4. escolher a observação mais recente do PID, em vez da primeira ocorrência;
5. avaliar STFT + LTFT somente em contexto operacional IDLE_WARM ou CRUISE;
6. manter limiares de ±15% como heurística de triagem, não como especificação de fábrica;
7. ampliar o conjunto de regras para P0135, P0420, P0133, P0123 e P0301, sempre com próximos testes;
8. explicitar no resultado quantos DTCs foram bloqueados por não serem evidência REAL_OBD ativa.

## Contexto Meriva
O projeto documenta a Meriva Maxx 1.4 8V ECONO.FLEX MY12. O manual registrado no código informa marcha lenta nominal de 700–800 rpm para essa configuração.

Essa informação não foi transformada em regra genérica de falha de RPM porque marcha lenta depende de condições como temperatura, carga e acessórios. O motor diagnóstico não deve usar uma especificação do veículo como condenação automática sem contexto suficiente.

## Decisões de engenharia
- PIDs padrão OBD e PIDs confirmados na Meriva continuam separados.
- O catálogo não promove candidatos para confirmados sem RAW_ECU.
- Fórmulas são determinísticas e não usam eval.
- Faixas de ranges.json são de plausibilidade, não limites de diagnóstico.
- DTC padronizado descreve a condição monitorada; a causa permanece uma hipótese.
- REAL_OBD é a única fonte que pode gerar evidência atual do veículo.
- Bluetooth/ELM327 e gate ECU 010C → 41 0C não foram alterados.
- Autosave e package-lock.json não foram alterados.
- CI não foi executada nesta auditoria.

## Fontes externas
- Chevrolet Brasil — manuais: https://www.chevrolet.com.br/servicos/manuais-veiculos/anos-anteriores
- Manual Chevrolet Meriva MY12: https://meu.chevrolet.com.br/content/dam/gmownercenter/gmsa/gmbr/dynamic/manuals/2012/chevrolet/Meriva/pt/om_ng-chevrolet_Meriva_my12-pt_BR.pdf
- SAE J1979_202505 — E/E Diagnostic Test Modes: https://saemobilus.sae.org/standards/j1979_202505-e-e-diagnostic-test-modes
- SAE J1979-DA — Digital Annex: https://saemobilus.sae.org/standards/j1979da_202510-j1979-da-digital-annex-e-e-diagnostic-test-modes
- SAE J2012 — Diagnostic Trouble Code Definitions: https://saemobilus.sae.org/standards/j2012_202509-diagnostic-trouble-code-definitions
- SAE J2012 Digital Annex: https://saemobilus.sae.org/standards/j2012da_202403-digital-annex-diagnostic-trouble-code-definitions-failure-type-byte-definitions

## 2026-10-08 — Extensão para Mode 02 e Mode 09

### Mode 09 / PID 02
O aplicativo passa a oferecer leitura opcional do VIN diretamente da ECU por `0902`. A resposta multiline é remontada por índice de frame e o VIN só é aceito quando um identificador ASCII válido de 17 caracteres é encontrado. O datasheet do ELM327 documenta esse fluxo e ressalta que veículos antigos podem não suportar o recurso. citeturn462541search14

### Mode 02 / Freeze Frame
Foi adicionada uma camada opcional para consultar `02xx` usando os mesmos PIDs já catalogados, exigindo resposta positiva `42 xx`. Os snapshots são persistidos em arquivo privado separado do autosave principal e podem ser associados, na interface, a um DTC ativo selecionado. O padrão SAE J1979 define Mode 02 como solicitação de dados de Freeze Frame e Mode 09 como solicitação de informações do veículo. citeturn418806search0turn418806search8

### Limitações
A ausência de suporte da ECU para Mode 02/09 é um resultado válido e não é convertida em erro do veículo. Mode 04, Mode 06 e operações de controle permanecem fora desta implementação para evitar ações destrutivas ou interpretações não confirmadas na Meriva.
