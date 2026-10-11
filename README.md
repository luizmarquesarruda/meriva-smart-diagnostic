# MERIVA SMART DIAGNOSTIC

Aplicativo Android offline de diagnóstico OBD-II para Chevrolet Meriva Maxx 1.4L 8V ECONO.FLEX.

As especificações físicas e de manutenção do veículo são mantidas em `src/database/merivaManual.ts`, com referência ao Manual do Proprietário Chevrolet Meriva 2012.

Versão: 1.0.1 | Plataforma: Android | Transporte: Bluetooth Classic | ECU: OBD-II/ELM327

## Estado atual

O projeto prioriza dados reais, rastreabilidade e diagnóstico explicável. Uma resposta ausente não vira um valor inventado.

A distância da viagem vem do GPS filtrado; o GPS não mede combustível. A taxa de combustível prefere o PID OBD 015E (medida pela ECU). Se ele não fornecer valor válido, o aplicativo tenta estimar a taxa pelo MAF (PID 0110) e, se não for possível, por MAP + RPM + IAT (PIDs 010B, 010C e 010F). A interface distingue taxa medida de taxa estimada. Essas estimativas dependem de hipóteses físicas e podem divergir do consumo real, especialmente em motor flex. Se não houver distância e combustível válidos, o consumo aparece como N/D. O app não aceita litros digitados manualmente na tela principal.

Bluetooth Classic exige build nativo Android. Expo Go não é o ambiente de validação do transporte.

## Estrutura

```text
app/             telas e navegação
src/obd/         Bluetooth, ELM327, parser, DTC, PIDs e telemetria
src/data/        tipos e ciclos de condução
src/database/    persistência, DTC, PIDs, aprendizado e veículos
src/meriva/      autosave e estado persistido
src/gps/         rastreamento de velocidade e distância
src/storage/     quota, backup, limpeza e ciclos
src/types/       contratos compartilhados
tests/           testes automatizados
docs/            arquitetura, desenvolvimento e auditorias
.github/         CI e governança
```

## Fluxo OBD

```text
UI
 ↓
Bluetooth Manager
 ↓
BluetoothClassicTransport (eventos)
 ↓
Elm327Session (fila de comandos)
 ↓
Discovery / PID / DTC
 ↓
Parser
 ↓
RAW + interpretado
 ↓
Banco / Histórico / DNA / Autosave
```

O sistema diferencia Bluetooth, ELM327 e ECU. Estar conectado ao ELM327 não significa que a ECU respondeu.

## GPS

```text
Root Layout
 ↓
GpsTracker singleton + tarefa global TaskManager
 ↓
watchPositionAsync (primeiro plano)
ou Location.startLocationUpdatesAsync (segundo plano)
 ↓
precisão <= 30 m + segmentos plausíveis + evidência de velocidade GPS/OBD
 ↓
distância filtrada
 ↓
distância GPS / combustível integrado = km/L
```

O rastreador é compartilhado entre telas. Depois da validação real da ECU, o Android tenta manter o GPS em segundo plano por meio de uma tarefa Expo Location/TaskManager e um Foreground Service com notificação persistente. Isso exige build nativa e permissões concedidas; economia de bateria do fabricante pode limitar a coleta, e o modo não garante recuperação após force-stop. A tarefa em segundo plano e o watcher de primeiro plano não devem coletar em paralelo.

## Regras de dados

- REAL_OBD: veio da ECU através do transporte real.
- SIMULACAO: usado apenas para testes.
- CARSCANNER_BASELINE: referência externa, não é leitura atual da ECU.
- Dados simulados ou de referência não alimentam o aprendizado REAL_OBD.
- TX/RX original deve ser preservado quando houver logging.
- Respostas sem interpretação ficam como NÃO RESPONDEU, VALOR NÃO INTERPRETADO ou SEM DADOS.
- Nunca inventar valores.

## Privacidade e exportação

- O autosave operacional permanece local no armazenamento privado do aplicativo; ele não é um mecanismo de upload para o repositório GitHub.
- Novos snapshots TXT omitem VIN, nome do adaptador, identificadores da ECU e configurações com chaves que aparentem conter identificadores pessoais.
- Exportações manuais TXT/JSON e o relatório Bluetooth aplicam redação adicional a VINs, endereços Bluetooth e nomes/endereço dos adaptadores; o trace Bluetooth também mascara nomes e endereços antes de mantê-los em memória.
- Os snapshots TXT antigos já armazenados localmente não são apagados automaticamente. A exportação manual os sanitiza ao gerar o arquivo.
- O backup manual copia diretórios locais de logs, configuração, viagens e aprendizado; esses arquivos podem conter dados brutos. Revise o backup antes de compartilhar.

## PIDs e combustível

A base inclui PIDs como velocidade (010D), RPM (010C), temperatura do líquido (0105), MAF (0110), MAP (010B), IAT (010F), nível de combustível (012F) e taxa de combustível do motor (015E). O PID 012F informa percentual de nível; para a Meriva, a capacidade total é 56 L e já inclui aproximadamente 5 L de reserva (cerca de 51 L antes da reserva). Litros restantes são estimados sobre os 56 L totais; o alerta de reserva começa perto de 5 L (8,93%). A autonomia calculada com o combustível restante inclui a reserva. O PID 015E representa taxa em L/h e é a fonte preferida para integrar combustível. Quando não há taxa 015E válida, o serviço tenta estimar por MAF; se isso falhar, tenta MAP + RPM + IAT. A estimativa MAP usa a cilindrada configurada ou a especificação da Meriva 1.4 (1389 cm³), além de hipóteses padrão de AFR, densidade e eficiência volumétrica. Origem medida/estimada fica marcada no registro da viagem; esses cálculos não devem ser tratados como medição direta da ECU.

## Identificação de combustível

A versão de validação passou a reconhecer os PIDs padrão **0151 (Fuel Type)** e **0152 (Alcohol Fuel Percentage)**.

- **0151**: identifica o tipo de combustível declarado pela ECU. Não deve ser tratado como leitura da mistura atual do tanque.
- **0152**: quando suportado e respondido validamente, informa o percentual de álcool fornecido pela ECU.
- O aplicativo **não estima** a mistura usando STFT, LTFT, lambda, MAF ou consumo.
- Respostas TX/RX continuam sendo preservadas para conferência.
- Um valor fora da faixa de 0–100% é marcado como incoerente e não é usado.
- A Meriva real ainda precisa responder aos PIDs para que eles sejam considerados **confirmados para este veículo**.

O módulo src/obd/fuelIdentification.ts é deliberadamente conservador. Ele separa TIPO_VEICULO, COMPOSICAO_ECU, SEM_DADOS e DADO_INCOERENTE. Não altera a tela principal nem declara automaticamente o combustível até haver evidência real suficiente.

### Critério para avançar

1. Consultar 0151 e 0152 na ECU real da Meriva.
2. Registrar várias respostas reais, incluindo TX/RX e protocolo.
3. Verificar estabilidade e coerência dos valores.
4. Só depois considerar qualquer uso do resultado no diagnóstico ou na autonomia.
5. Se a ECU não suportar os PIDs, manter a funcionalidade como investigação e não substituir por uma estimativa silenciosa.

## Persistência

O aplicativo mantém CONFIG, BANCO, LEITURAS, APRENDIZADO, DTC, LOGS, VIAGENS e BACKUP.

O autosave usa arquivo temporário, valida o conteúdo e mantém uma cópia anterior para recuperação.

## Bluetooth

Na abertura do aplicativo, o sistema verifica suporte, solicita permissões, verifica o estado do Bluetooth, solicita ativação quando necessário e repete a verificação ao retornar ao aplicativo.

O ELM327 deve estar previamente pareado no Android. O aplicativo escolhe automaticamente os candidatos pareados: primeiro nomes compatíveis com ELM/OBD e depois outros dispositivos Classic, aceitando somente o candidato que passa pela inicialização do ELM e pelo teste real 010C. A conexão usa Bluetooth Classic/RFCOMM e preserva o prompt > para o parser do ELM.

## Testes

```bash
npm ci --no-audit --no-fund
npm run doctor
npm run typecheck
npm test
npx expo prebuild --clean --platform android --non-interactive
npx expo run:android
```

A suíte automatizada cobre autosave, parser, DTC, descoberta de PIDs, fila de comandos, transporte Bluetooth por eventos, storage e GPS. O build nativo Android no CI usa Java 17.

## Próximos blocos técnicos

1. validar Bluetooth/ELM327, 012F e GPS em Android físico;
2. monitorar PIDs suportados em ciclo real;
3. validar a taxa do PID 015E e outros PIDs relevantes na ECU real;
4. validar o comportamento específico da ECU da Meriva com dados reais;
5. manter especificações do manual separadas das evidências atuais da ECU.

## Princípio

**Evidência antes de conclusão.**


## Engenharia ELM327

O transporte Bluetooth Classic usa `react-native-bluetooth-classic` com `connectionType: delimited`, `charset: ascii` e **delimiter vazio**. A aplicação acumula os fragmentos RX e encerra a resposta quando recebe o prompt `>`; cada comando TX termina em CR (`0x0D`). O uso de `delimiter: \\r` na configuração do transporte é documentação antiga e não representa o código atual. Detalhes em [docs/ELM327_ENGINEERING_PLAYBOOK.md](docs/ELM327_ENGINEERING_PLAYBOOK.md).

A conexão só é considerada OBD válido depois do teste de resposta real da ECU `010C -> 41 0C`. A recuperação de protocolo é serializada com a fila de comandos para evitar interleaving entre consultas e comandos AT.

## Execução em segundo plano

Após validar a ECU, o aplicativo tenta iniciar o monitoramento persistente de GPS por Expo Location + TaskManager e Foreground Service Android. Com a tela apagada, a coleta depende das permissões, da sessão ativa e das políticas do fabricante para bateria. Force-stop ou encerramento explícito não é coberto como garantia de continuidade.

## CI e validação

O workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) executa `npm ci`, Expo Doctor, TypeScript, testes automatizados e build APK Release standalone com Java 17. Commits marcados com `[skip ci]` não devem ser descritos como validados por CI. A validação física de Bluetooth, GPS, PIDs e consumo exige um Android real e a ECU da Meriva.

**Princípio de validação:** distinguir testes escritos, testes executados, CI executada e ensaio físico. Não declarar uma etapa concluída sem evidência do respectivo teste.
