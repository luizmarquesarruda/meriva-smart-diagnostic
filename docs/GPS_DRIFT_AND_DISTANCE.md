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
