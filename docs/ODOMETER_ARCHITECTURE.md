# Hodômetro e quilometragem de manutenção

## Regra técnica

O hodômetro total exibido no painel da Meriva registra a quilometragem total do veículo. O padrão OBD-II/SAE J1979 não define um PID universal para retornar esse valor.

O PID 0131 é **Distance traveled since DTCs cleared**. Ele mede a distância desde o apagamento dos códigos, não a quilometragem total do carro. Por isso não deve ser usado como hodômetro.

A manutenção usa duas métricas separadas:

1. **Hodômetro do painel**: fonte oficial para a quilometragem do veículo e para calcular vencimentos por km.
2. **Distância monitorada pelo GPS**: métrica de acompanhamento do que o aplicativo observou durante as sessões. Ela pode ficar incompleta quando o telefone não acompanha o veículo e **nunca incrementa o hodômetro**.

Portanto, se o telefone ficar em casa, o hodômetro continua correto. O aplicativo não transforma uma distância GPS parcial em quilometragem oficial.

## OBD específico do fabricante

A ECU/cluster podem possuir dados proprietários ou diagnósticos estendidos que exponham quilometragem, mas isso não deve ser assumido como disponível na Meriva sem uma resposta real confirmada no veículo. Se futuramente encontrarmos um DID/serviço GM ou KWP que retorne a quilometragem total, ele será tratado como uma nova fonte e comparado com o valor do painel.

## Consequência para o projeto

- Nunca chamar PID 0131 de hodômetro.
- Nunca substituir a quilometragem do painel por PID 0131.
- GPS é apenas uma métrica monitorada e pode ficar incompleta.
- GPS nunca altera `vehicleOdometerKm`.
- O usuário deve atualizar o hodômetro do painel quando necessário.
- Quando houver divergência, preservar ambos os valores e sinalizar a diferença.
- Um eventual PID/DID proprietário só entra na base confirmed_pids depois de resposta RAW_ECU reproduzível.

## Referências

- SAE J1979: Service 01 PID 31 = distance since DTCs cleared.
- Manual do Proprietário Chevrolet Meriva 2012: o painel possui hodômetro total que registra o total de quilômetros percorridos.


## Investigação do painel GM

Pesquisa de referências públicas encontrou evidência de diagnóstico separado do PAINEL da Meriva. Uma tabela Kaptor de 2012 lista `Meriva 02 -> MA#1 PAINEL 7 23`, enquanto Corsa C/Montana aparecem em outra configuração com BCM. Isso confirma que o painel é um módulo de diagnóstico, mas não fornece uma rotina segura de leitura do hodômetro para a Meriva brasileira 1.4 8V 2011/2012. citeturn0search5

Documentação Tech2 para Opel descreve uma função de verificação do hodômetro que consulta IPC e ECU e mostra os dois valores para comparação. É evidência de que GM/Opel pode manter a quilometragem em mais de um módulo, mas não prova que o mesmo serviço, DID ou endereço seja aplicável ao veículo brasileiro alvo. citeturn0search1

Documentação pública do OP-COM também registra suporte de diagnóstico para Meriva e leitura de dados do painel, mas novamente não fornece uma sequência RAW KWP reproduzível para leitura do hodômetro deste veículo. citeturn0search3turn0search6

### Regra de segurança

O aplicativo não deve enviar DIDs proprietários de hodômetro por tentativa aleatória. Uma rotina só entra na base confirmada depois de captura RAW_ECU no veículo alvo, identificação do módulo e repetição bem-sucedida.

### Próximo teste no veículo

- identificar o painel como módulo separado;
- capturar inicialização KWP e endereço de destino;
- executar somente identificação/leitura não destrutiva;
- registrar TX/RX bruto;
- procurar resposta de identificação e dados de quilometragem;
- comparar com o número mostrado no painel;
- só então implementar leitura automática.
