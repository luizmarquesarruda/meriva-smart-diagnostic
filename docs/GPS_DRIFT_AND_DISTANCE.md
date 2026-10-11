# GPS: controle de deriva e distância da viagem

## Problema

O GPS do Android pode entregar pequenas mudanças de latitude/longitude mesmo com o veículo parado. Somar cada segmento bruto transforma ruído em distância fantasma; exigir que cada segmento isolado supere a margem de erro, por outro lado, pode zerar a distância real em deslocamentos curtos ou com precisão mediana.

## Regra adotada no Meriva Smart Diagnostic

1. Só são usadas posições com precisão declarada de até 30 m.
2. A velocidade do PID OBD 010D confirma movimento quando válida; sem ela, é exigida velocidade reportada pelo GPS. A velocidade derivada das coordenadas é usada como validação adicional do segmento, nunca como única evidência de movimento.
3. A velocidade derivada deve ficar entre 5 e 220 km/h, o intervalo entre fixes não pode superar 5 s e cada segmento bruto deve ter no máximo 250 m.
4. O movimento só é confirmado após pelo menos três segmentos consecutivos plausíveis e um deslocamento acumulado de pelo menos max(12 m, 1,5 × a pior precisão informada).
5. Depois de confirmado o movimento, os segmentos plausíveis são acumulados em um buffer. A distância só é adicionada ao total quando o deslocamento entre a âncora de distância e o fix atual supera o limite adaptativo. Isso permite contar vários segmentos curtos sem reduzir o filtro a uma soma de jitter.
6. Ao parar, um trecho final só é descarregado se o movimento já estava confirmado e seus segmentos passaram pelos filtros; uma tentativa de movimento ainda não confirmada é descartada.
7. Sem posições GPS aceitáveis, não é inventada distância. Se o GPS perder sinal por um intervalo longo, o rastreador reinicia a janela em vez de interpolar o trecho ausente.
8. O gravador da viagem rejeita timestamps inválidos, duplicados ou atrasados antes de alterar qualquer acumulador.
9. A distância acumulada não pode retroceder se o contador cumulativo do GPS reiniciar. Uma amostra de distância inválida não substitui a última referência válida.
10. A distância mantém precisão completa internamente e é arredondada apenas ao expor o estado; isso evita descartar sucessivos segmentos pequenos por arredondamento prematuro.
11. Viagens reais curtas ou sem combustível integrado suficiente permanecem no histórico como `REAL_OBD` com `dataQuality: INCOMPLETE`. A média km/L não é calculada como válida nessas condições; a interface deve mostrar N/D, não apresentar o sentinela zero como consumo medido.

## Consumo: fontes separadas

- **Distância:** GPS filtrado do telefone.
- **Combustível:** taxa válida do PID 015E (L/h), integrada ao longo do tempo. Se o PID não estiver disponível, o serviço tenta estimativas por MAF ou MAP + RPM + IAT e marca a origem como estimada.
- **Consumo médio da viagem:** distância GPS acumulada dividida pelos litros integrados. A média só é considerada confiável com distância mínima, pelo menos duas amostras válidas e volume integrado mínimo de 0,05 L. Se qualquer requisito faltar, a viagem é mantida como incompleta e a tela deve mostrar N/D.
- Os ciclos de referência CARSCANNER_SEED não alimentam o indicador de consumo real nem são usados como média real inicial.
- O limite de 0,05 L é um critério conservador de qualidade de dados, não uma especificação mecânica da Meriva nem um limite do PID 015E.

O GPS não é um odômetro perfeito. A regra favorece distância rastreável e impede que um único salto defina a viagem. A calibração final ainda depende de um trajeto real no telefone e na Meriva.

## Referências pesquisadas

A revisão considerou padrões de filtragem adaptativa, detecção de movimento e prevenção de distância fantasma descritos em projetos públicos de rastreamento de localização. A implementação do Meriva Smart Diagnostic permanece própria e não copia código dessas bibliotecas.

## Testes automatizados

`tests/gps.test.js` verifica distância com fixes limpos, rejeição de deriva parado, movimento com precisão mediana e rejeição de distância quando falta evidência de velocidade do GPS/ECU.

`tests/tripRecorder.test.js` cobre timestamps fora de ordem/duplicados, reset da distância cumulativa, distância inválida, preservação de viagens curtas/incompletas e prevenção de perda por arredondamento de segmentos pequenos.

**Status desta revisão:** os testes foram adicionados/atualizados no código, mas não foram executados nesta etapa. CI, TypeScript, suíte completa, build Android e validação física permanecem pendentes.

## Revisão de integração — 2026-10-11

- O integrador de combustível rejeita timestamps inválidos, repetidos e atrasados sem alterar o estado. `markGap()` encerra a janela de integração quando uma amostra de taxa falta, preservando o volume já integrado e evitando interpolação através de um período desconhecido.
- Estimativas MAF/MAP rejeitam parâmetros fisicamente impossíveis (AFR/densidade fora da faixa, temperatura abaixo do zero absoluto, MAP/RPM/cilindrada/VE fora dos limites de plausibilidade e taxa resultante excessiva). Esses limites são guardas de entrada, não especificações OEM.
- As estimativas usam a preferência de combustível configurada: etanol (AFR 9,0; densidade 0,789 kg/L), gasolina brasileira (AFR 13,0; densidade 0,755 kg/L) e FLEX/indefinido (hipótese aproximada AFR 12,9; densidade 0,755 kg/L). São valores aproximados para cálculo, não identificação da mistura atual do tanque. Quando suportado e válido, PID 015E continua sendo a fonte preferencial.
- O snapshot síncrono de saúde OBD agora retorna os campos completos de estado da ECU e usa o mesmo critério de resposta real do emissor de eventos.
- A média de velocidade de múltiplas viagens é agregada por distância total / tempo total em movimento, não pela média aritmética das médias de cada viagem.
- O formatador TXT e a tela Viagens exibem consumo como `N/D` quando a qualidade do ciclo é incompleta ou não atinge 0,1 km e 0,05 L integrados. Ciclos legados com valores plausíveis mas sem marca de qualidade são identificados como legado não verificado na exportação.
- O autosave agora importa explicitamente `getAutoSaveState` no serviço de viagem; a validação anterior acusou esse identificador ausente. A mesma execução acusou retorno incompleto de `getSharedObdStatus`; os campos foram adicionados.

## Status de validação

A run #1894 (commit anterior a estas correções finais) falhou no `tsc --noEmit` por dois erros: retorno incompleto de `getSharedObdStatus` e import ausente de `getAutoSaveState`. As alterações correspondentes foram gravadas depois dessa execução. Por orientação para não disparar CI, não foi solicitada nova execução; a validação da ponta atual permanece pendente. A clonagem local também não pôde ser usada porque o ambiente não conseguiu resolver `github.com`. Não declarar os testes ou o build Android como aprovados até validação posterior.
