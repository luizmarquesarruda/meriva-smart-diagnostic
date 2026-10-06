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
- src/knowledge/pids.json: PID, bytes, unidade e fórmula.
- src/knowledge/units.json: catálogo de unidades.
- src/knowledge/ranges.json: faixas de plausibilidade.
- src/obd/formulaEngine.ts: executor seguro das fórmulas, sem eval.

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

Uma faixa de plausibilidade também não é diagnóstico. Ela serve para impedir que um valor absurdo entre no aprendizado como se fosse verdadeiro.

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
