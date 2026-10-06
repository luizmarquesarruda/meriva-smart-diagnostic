# Hodômetro e quilometragem de manutenção

## Regra técnica

O hodômetro total exibido no painel da Meriva registra a quilometragem total do veículo. O padrão OBD-II/SAE J1979 não define um PID universal para retornar esse valor.

O PID 0131 é **Distance traveled since DTCs cleared**. Ele mede a distância desde o apagamento dos códigos, não a quilometragem total do carro. Por isso não deve ser usado como hodômetro.

A quilometragem usada pela manutenção do aplicativo é composta por:

1. **quilometragem inicial lida no painel pelo usuário**;
2. **+ distância GPS confirmada pelo filtro de movimento**.

O valor resultante é uma **estimativa operacional para o aplicativo**, não uma leitura do hodômetro pela ECU.

## OBD específico do fabricante

A ECU/cluster podem possuir dados proprietários ou diagnósticos estendidos que exponham quilometragem, mas isso não deve ser assumido como disponível na Meriva sem uma resposta real confirmada no veículo. Se futuramente encontrarmos um DID/serviço GM ou KWP que retorne a quilometragem total, ele será tratado como uma nova fonte e comparado com o valor do painel.

## Consequência para o projeto

- Nunca chamar PID 0131 de hodômetro.
- Nunca substituir a quilometragem do painel por PID 0131.
- GPS pode alimentar a quilometragem operacional da manutenção.
- Quando houver divergência, preservar ambos os valores e sinalizar a diferença.
- Um eventual PID/DID proprietário só entra na base confirmed_pids depois de resposta RAW_ECU reproduzível.

## Referências

- SAE J1979: Service 01 PID 31 = distance since DTCs cleared.
- Manual do Proprietário Chevrolet Meriva 2012: o painel possui hodômetro total que registra o total de quilômetros percorridos.
