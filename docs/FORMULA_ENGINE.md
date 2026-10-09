# Banco de Fórmulas OBD-II

O Meriva Smart Diagnostic agora separa conhecimento técnico de aprendizado do veículo.

## Fontes pesquisadas

Foram comparadas implementações abertas que usam fórmulas SAE J1979/ISO 15031-5, incluindo:

- HaulLogic/obd2-core: tabela funcional de PIDs e fórmulas.
- Sherin-SEF-AI/CanLab: 78 PIDs Mode 01 com fórmulas determinísticas.
- Libre-Diagnosctic/libre-automotive-diagnostic: engine de fórmulas OBD.
- lahirunirmalx/esp-obd-ii: decodificadores de PIDs em C/C++.
- muki01/OBD2_K-line_Reader: decodificação SAE J1979 após transporte K-Line.
- OBDex/UCANLAB: referência de dados de PIDs com proveniência/licença.

## Regra do projeto

A aplicação não copia código externo para o motor de cálculo.

Ela mantém um banco próprio em JSON:

- src/knowledge/formulas.json: operações matemáticas determinísticas.
- src/knowledge/pids.json: PIDs com decodificadores executáveis validados no motor local.
- src/knowledge/pid_reference_catalog.json: 56 referências padrão adicionais, nomes/unidades/descrições para consulta da IA; são referências genéricas, não confirmação de compatibilidade da Meriva nem fórmulas de decodificação.
- src/knowledge/units.json: catálogo de unidades.
- src/knowledge/ranges.json: faixas de plausibilidade.
- src/knowledge/fuel_types.json: enumeração do PID 0151, separada das fórmulas numéricas.
- src/obd/formulaEngine.ts: executor seguro das fórmulas, sem eval.

## Catálogo de referência e banco aprendido

O catálogo de referência foi montado a partir da lista pública [OBD2 PID Knowledge — Standard PIDs](https://obd2pid.com/pids) e cruzado conceitualmente com o escopo de [SAE J1979 / ISO 15031-5](https://saemobilus.sae.org/standards/j1979_201408-e-e-diagnostic-test-modes). Ele contém metadados de referência para PIDs padrão adicionais, sem copiar fórmulas de execução.

O banco local em `BANCO/pids_meriva_confirmados.txt` guarda status, origem, protocolo, ocorrências, unidade, fórmula conhecida e descrição. O formato novo aceita as 11 colunas antigas e 15 colunas enriquecidas, preservando compatibilidade de leitura.

Ao descobrir PIDs:
1. O app consulta o banco local e os catálogos JSON antes de classificar cada ID.
2. PIDs do catálogo executável podem usar somente as fórmulas implementadas e validadas.
3. PIDs encontrados apenas no catálogo de referência são marcados como `REFERENCE_ONLY`; a resposta bruta continua sem valor físico interpretado.
4. PIDs que aparecem no mapa de suporte da ECU são registrados como `DESCOBERTO`, não como `CONFIRMADO`.
5. A lógica de descoberta local pode reconsiderar PIDs registrados anteriormente, mas não promove automaticamente uma hipótese nem inventa fórmulas.

A lista pública é genérica: a ECU da Meriva pode suportar apenas parte dela. A única confirmação específica do veículo continua sendo a evidência real em `meriva_confirmed_pids.json` e no banco local; os dados de baseline do Car Scanner permanecem candidatos, nunca prova de resposta atual da ECU.

## Fluxo

resposta ELM327
  -> bytes brutos
  -> PID conhecido?
  -> fórmula do banco
  -> valor físico
  -> faixa de plausibilidade
  -> RESPONDEU / VALOR NÃO INTERPRETADO
  -> aprendizado posterior

## Regra de segurança

O motor nunca deve inventar uma fórmula para um PID desconhecido.

Se o PID não tiver definição, a resposta bruta é preservada e o valor fica como não interpretado.

Enums, como o PID 0151, não devem ser tratados como valores físicos contínuos. Uma faixa de plausibilidade também não é diagnóstico. Ela serve para impedir que um valor absurdo entre no aprendizado como se fosse verdadeiro.

## IA burrinha, versão 2

A inteligência local pode ficar mais forte sem virar uma caixa-preta:

1. Descobre PIDs suportados pelo bitmap da ECU.
2. Confirma o PID com uma resposta real.
3. Decodifica usando fórmula conhecida.
4. Rejeita valor implausível.
5. Mede confiança.
6. Guarda evidência.
7. Aprende somente com dados válidos.
8. Nunca transforma hipótese em fato automaticamente.

O próximo nível é adicionar regras de comportamento por contexto, como marcha lenta, motor frio, motor quente, carga, aceleração e desaceleração.
