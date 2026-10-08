# Fórmula de AFR para estimativa de consumo

O estimador de consumo é **estimativo** quando não recebe o PID 015E. Ele não usa abastecimento, tanque cheio ou calibração por litros abastecidos.

## Prioridade de composição

1. PID 0152 real da ECU, quando responder com percentual válido de 0–100%.
2. Percentual manual informado pelo usuário.
3. Tipo manual ETANOL.
4. Tipo manual GASOLINA, tratado como gasolina C comum brasileira E32 enquanto a regra temporária vigente estiver em vigor.
5. Sem composição válida, gasolina A como fallback explícito de baixa confiança; o AFR assumido é registrado.

A ANP informa que a gasolina C é gasolina A acrescida de etanol anidro. A regra temporária vigente desde 1º de agosto de 2026 elevou a gasolina C comum para E32. Verifique a legislação vigente antes de reutilizar esse percentual depois do término da vigência.

Fontes oficiais:
- ANP — E32: https://www.gov.br/anp/pt-br/canais_atendimento/imprensa/noticias-comunicados/e32-gasolina-com-32-de-etanol-passa-a-valer-temporariamente-a-partir-de-amanha-1-8
- ANP — gasolina A/C: https://www.gov.br/anp/pt-br/assuntos/producao-de-derivados-de-petroleo-e-processamento-de-gas-natural/producao-de-derivados-de-petroleo-e-processamento-de-gas-natural/gasolina
- NREL — propriedades de etanol, gasolina e E85: https://docs.nrel.gov/docs/fy13osti/57590.pdf

## AFR da mistura

O NREL registra, por massa, aproximadamente:
- gasolina: 14,7:1 ar/combustível;
- etanol: 9,0:1 ar/combustível.

O mesmo documento fornece gravidade específica aproximada de 0,72–0,78 para gasolina e 0,794 para etanol. O estimador usa 0,750 kg/L como densidade estimada da gasolina A; essa escolha é explicitamente uma estimativa porque a densidade real da gasolina varia.

Para uma mistura com x de etanol em volume:

1. Ve = x
2. Vg = 1 - x
3. me = Ve × rho_e
4. mg = Vg × rho_g
5. we = me / (me + mg)
6. wg = 1 - we
7. AFR_mix = 1 / (wg / AFR_gasolina + we / AFR_etanol)

A densidade estimada usada no cálculo é:

rho_mix = Vg × rho_g + Ve × rho_e

Isso evita tratar uma porcentagem volumétrica de etanol como se fosse diretamente uma fração mássica.

## Confiança e evidência

- REAL_OBD_0152: composição direta da ECU; confiança DIRETA.
- ESTIMATED_MANUAL_*: composição informada manualmente; confiança BAIXA.
- ESTIMATED_BRAZIL_GASOLINE_E32: hipótese baseada na composição legal vigente; confiança BAIXA.
- ESTIMATED_DEFAULT_GASOLINE_A: fallback quando não existe composição válida; o aplicativo registra explicitamente o AFR assumido.

Nenhum desses caminhos usa litros abastecidos, tanque cheio ou calibração por abastecimento.
