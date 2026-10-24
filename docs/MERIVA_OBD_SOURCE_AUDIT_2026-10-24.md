# Auditoria de fontes da Meriva e compatibilidade OBD — 2026-10-24

## Objetivo e conclusão

Esta nota separa três evidências diferentes que não podem ser misturadas:

1. **Documentação do veículo**: confirma a variante, operação, advertências e manutenção descritas pela Chevrolet.
2. **Definição SAE de um PID**: define o significado dos bytes, fórmula e unidade de um parâmetro padronizado.
3. **Suporte na ECU deste carro**: exige bitmap de suporte observada na sessão e resposta individual válida, com bytes completos. A leitura repetida e plausível é necessária para elevar a confiança; uma resposta isolada não certifica a saúde física do sensor.

O Manual do Proprietário Meriva 2011/2012 **não fornece uma tabela de PIDs OBD-II nem uma bitmap de suporte da ECU**. Portanto, ele não pode ser usado para declarar que a Meriva suporta todos os PIDs catalogados. O catálogo de 34 PIDs do aplicativo é uma seleção de definições SAE, não uma lista OEM garantida para o veículo.

No inventário atual do projeto, somente PID `010C` (RPM) possui evidência `RAW_ECU` específica documentada: resposta `41 0C 1A F8`, interpretada como 1726 rpm. Outros parâmetros permanecem candidatos, definições genéricas ou descobertas de runtime até ser obtida resposta válida da ECU.

## Fontes consultadas e limites de inferência

| Fonte | O que suporta | O que não comprova |
|---|---|---|
| [Manual oficial Chevrolet Meriva 2012 (PDF)](https://www.chevrolet.com.br/content/dam/chevrolet/south-america/brazil/portuguese/index/services/owner-manuals/05-pdf/meriva/manual-meriva-2012.pdf) | Seção 6, p. 6-3: luz indicadora de anomalia no controle de emissões e orientação para verificação; seção 13, p. 13-6: uso de mistura gasolina/álcool no sistema Flexpower/ECONO.FLEX. Também fornece dados de configuração e manutenção. | Não apresenta inventário Mode 01, fórmulas de PIDs, bitmap da ECU nem confirmação de suporte para um PID específico. |
| [Manual oficial Chevrolet Meriva 2011 (PDF)](https://www.chevrolet.com.br/content/dam/chevrolet/south-america/brazil/portuguese/index/services/owner-manuals/05-pdf/meriva/manual-meriva-2011.pdf) | Contexto operacional e avisos de funcionamento/manutenção. | Não apresenta uma tabela de PIDs ou bitmap de suporte. |
| [Portal Chevrolet de manuais de anos anteriores](https://www.chevrolet.com.br/servicos/manuais-veiculos/anos-anteriores) | Lista manuais de proprietário para Meriva 2008–2012 e permite selecionar o ano. | A presença de um manual do proprietário não é prova sobre protocolo ou compatibilidade OBD. |
| [Página de manuais de reparação da Meriva — Peça Chevrolet](https://www.pecachevrolet.com.br/reparador-man/meriva) | Informa que há manuais técnicos de reparação, especificações, plano de manutenção e diagramas. | O conteúdo completo do manual de reparação não foi inspecionado integralmente nesta auditoria; não usar apenas a página de índice para afirmar uma tabela de PIDs. |
| [Índice de treinamento técnico Meriva Econo.Flex 1.4 — Mecânica 2000](https://www.mecanica2000.com.br/produto-detalhe/53/meriva-econoflex-14) | A descrição do curso cita Multec HX14YFH e temas de teste de ECT, MAP/IAT, HEGO/O2, CKP, VSS, pedal do acelerador e borboleta. Ajuda a identificar sistemas/sensores relevantes para pesquisa futura. | É material comercial secundário; a página do produto não prova que essa ECU exata esteja instalada no veículo conectado nem define quais PIDs SAE a ECU oferece. |
| [SAE J1979 — cópia pública de edição anterior (2002)](https://law.resource.org/pub/us/cfr/ibr/005/sae.j1979.2002.pdf) | Referência histórica das mensagens e dos modos de diagnóstico padronizados. | É edição antiga, não substitui a revisão SAE vigente e não confirma o equipamento instalado em uma Meriva específica. |
| [SAE J1979_202505 — E/E Diagnostic Test Modes](https://saemobilus.sae.org/standards/j1979_202505-e-e-diagnostic-test-modes) | Referência oficial atual consultada para serviços de diagnóstico e arquitetura de comunicação OBD; reafirmada em 23/05/2025. | Página pública contém metadados/resumo; não foi obtido o texto integral licenciado; não comprova suporte em uma ECU particular. |
| [SAE J1979-DA_202608 — Digital Annex](https://doi.org/10.4271/J1979DA) | Registro global mais recente consultado para identificadores de dados relacionados a emissões/propulsão; revisado em 06/08/2026. | O resumo público não substitui o anexo integral nem prova que a ECU Meriva responda a cada identificador. |
| [OBD Auto Doctor — lista de parâmetros suportados](https://www.obdautodoctor.com/help/articles/supported-obd-parameters/) | Lista IDs e nomes genéricos SAE; afirma explicitamente que o conjunto disponível depende do veículo. | Não é lista de compatibilidade OEM da Meriva. |
| [OBDLink — PIDs SAE suportados pela aplicação](https://www.obdlink.com/obd-apps/obdlink-app/) | Corrobora nomes usuais e ressalta que cada veículo suporta apenas um subconjunto. | Não confirma suporte na ECU desta Meriva. |
| [OBD2 PID Knowledge — PID 0101](https://obd2pid.com/pids/01-01) | Referência bit a bit para MIL, contagem de DTC e monitores de prontidão. | Índice secundário; usado para conferência cruzada, não como substituto da norma SAE. |

## Comparação das definições locais com o significado SAE

As fórmulas abaixo são definições genéricas do padrão. A confirmação de que a ECU da Meriva responde continua sendo uma condição separada.

| PID Mode 01 | Significado correto | Decodificação/fórmula | Estado de evidência específica da Meriva |
|---|---|---|---|
| `0101` | Status dos monitores desde a limpeza de DTCs | 4 bytes codificados em bits; A7 = MIL, A6..A0 = contagem. B identifica disponibilidade dos monitores contínuos e tipo de ignição; C/D mudam por ciclo Otto versus compressão. | Sem RAW_ECU documentada no inventário atual |
| `0104` | Carga calculada do motor | A × 100 / 255 (%) | Sem RAW_ECU específica |
| `0105` | Temperatura do líquido de arrefecimento | A − 40 (°C) | Candidato; não confirmado |
| `0106` / `0107` | STFT / LTFT, banco 1 | (A − 128) × 100 / 128 (%) | Candidatos; não confirmados |
| `010A` / `010B` | Pressão de combustível manométrica / pressão absoluta do coletor MAP | A × 3 (kPa) / A (kPa) | Sem RAW_ECU específica |
| `010C` | Rotação do motor | (256 × A + B) / 4 (rpm) | **Confirmado por RAW_ECU no inventário atual** |
| `010D` | Velocidade reportada pela ECU | A (km/h) | Sem RAW_ECU específica |
| `010E` | Avanço de ignição | A × 0,5 − 64 (°) | Candidato; não confirmado |
| `010F` | Temperatura do ar de admissão | A − 40 (°C) | Candidato; não confirmado |
| `0110` | MAF / fluxo de massa de ar | (256 × A + B) / 100 (g/s) | Candidato; não confirmado |
| `0111` | **Posição absoluta da borboleta** | A × 100 / 255 (%) | Candidato; não confirmado |
| `0114` | Tensão O₂ banco 1 sensor 1 + trim associado | A / 200 (V); B é STFT separado; B=FF indica trim não utilizado | Candidato; não confirmado |
| `012C` / `012D` | EGR comandada / erro EGR | A × 100 / 255 (%) / (A − 128) × 100 / 128 (%) | Sem RAW_ECU específica |
| `012E` | Purga EVAP comandada | A × 100 / 255 (%) | Sem RAW_ECU específica |
| `012F` | Nível de combustível | A × 100 / 255 (%) | Candidato; não confirmado |
| `0130` / `0131` | Ciclos de aquecimento / distância desde limpeza de DTCs | A (contagem de ciclos) / 256 × A + B (km) | Sem RAW_ECU específica |
| `0133` | Pressão barométrica absoluta | A (kPa) | Sem RAW_ECU específica |
| `0142` / `0143` | Tensão do módulo de controle / carga absoluta | (256 × A + B) / 1000 (V) / (256 × A + B) × 100 / 255 (%) | Sem RAW_ECU específica |
| `0145` / `0146` | Posição relativa da borboleta / temperatura ambiente | A × 100 / 255 (%) / A − 40 (°C) | Sem RAW_ECU específica |
| `0151` / `0152` | Tipo de combustível (enum) / percentual de etanol | A lookup / A × 100 / 255 (%) | Sem RAW_ECU específica |
| `0159` | Pressão absoluta do rail de combustível | (256 × A + B) × 10 (kPa) | Sem RAW_ECU específica |
| `015A` | **Posição relativa do pedal do acelerador** | A × 100 / 255 (%) | Sem RAW_ECU específica |
| `015C` | Temperatura do óleo do motor | A − 40 (°C) | Sem RAW_ECU específica |
| `015D` | Temporização da injeção | ((256 × A + B) − 26880) / 128 (°) | Sem RAW_ECU específica |
| `015E` | Taxa de combustível reportada | (256 × A + B) / 20 (L/h) | Sem RAW_ECU específica |
| `0161` / `0162` | Torque solicitado pelo motorista / torque real, percentuais relativos | A − 125 (%) | Sem RAW_ECU específica |

## Correção de bit crítica — PID 0101

No PID `0101`, a interpretação **não** deve tratar os quatro bytes como um único número:

- Byte A: bit 7 indica MIL; bits 6..0 representam a contagem de DTCs.
- Byte B: disponibilidade de monitores contínuos e indicador de tipo de ignição; bits de prontidão têm posições definidas pela norma.
- Bytes C/D: disponibilidade e incompletude de monitores não contínuos; o mapeamento muda entre ignição por centelha (SI/ciclo Otto) e ignição por compressão (CI/diesel).
- **C4 em SI é “monitor de filtro de partículas de gasolina disponível”; D4 indica que esse monitor está incompleto.** Não representa sensor de refrigeração/ar-condicionado.
- Um bit “disponível” é sinal de monitor suportado, não prova de que o filtro existe fisicamente em todas as variantes nem de que a ECU conectada expõe o PID.

## Regras obrigatórias para o aplicativo

1. Descobrir as páginas de suporte `0100`, `0120`, `0140`, `0160` apenas quando a bitmap anterior indica continuação.
2. Usar a bitmap da sessão atual para priorizar PIDs e depois validar cada PID com sua resposta individual completa. Não converter bitmap em confirmação funcional.
3. Distinguir os estados `CATALOGADO`, `ANUNCIADO`, `RESPONDEU`, `CONFIRMADO` e `NÃO CONCLUSIVO`. Um catálogo genérico ou valor seed nunca é evidência `RAW_ECU`.
4. Preservar resposta bruta, número de bytes esperado/recebido, timestamp, sessão e protocolo para auditoria.
5. Não transformar falta de resposta em zero; não usar o valor para diagnóstico se a resposta não passou no parser e na validação de plausibilidade.
6. Aumentar confiança apenas com amostras reais repetidas, coerentes com a condição de teste; um PID que responde não prova a exatidão física do sensor.
7. Para Flex, não confundir o enum de tipo de combustível `0151` com percentual de etanol `0152`; ausência de `0152` não significa combustível fixo.
8. Nunca declarar que o veículo suporta todos os 34 PIDs do catálogo.

## Fontes da documentação do app

- Mapa completo de bytes, fórmulas, unidades, faixas e polling: [`PID_FORMULA_MAP_2026-10-24.md`](PID_FORMULA_MAP_2026-10-24.md).
- Relatório analítico de PIDs: [`RELATORIO_PIDS_E_FORMULAS.md`](RELATORIO_PIDS_E_FORMULAS.md).
- Base em runtime: `src/knowledge/pids.json`, `formulas.json`, `ranges.json`, `units.json`, `fuel_types.json`, `polling_policy.json`, `meriva_confirmed_pids.json`.
- Testes de regressão: `tests/knowledgeJson.test.js`, `tests/regression.test.js`, `tests/projectBaseline.test.js`.

## Limitações abertas

- O manual de reparação completo deve ser consultado para confirmar os detalhes de ECU, identificação do módulo, protocolo/pinos e tabelas de valores da variante exata. A página pública do catálogo de manuais não foi suficiente para verificar todos esses detalhes nesta auditoria.
- O inventário deve ser atualizado após capturar e revisar RAW TX/RX reais com motor/ignição em condições de teste documentadas.
- Teste físico e comparação com scanner independente continuam necessários; CI verde confirma código/testes, não calibração do sensor nem suporte físico.
