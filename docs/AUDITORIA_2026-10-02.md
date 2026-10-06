# Auditoria do repositório: 2026-10-02

## Escopo

Revisão do código rastreado no branch principal e da integração GPS subsequente, incluindo UI Expo Router, Bluetooth Classic, sessão ELM327, parser e PIDs, DTC, persistência, autosave, ciclos, storage, testes, CI e documentação.

## Problemas encontrados e corrigidos

### Autosave
- Corrigida condição de corrida que podia perder uma mutação durante uma gravação assíncrona.
- O autosave controla uma versão de mutação e agenda nova gravação quando necessário.
- Troca de basePath força descarte seguro do runtime anterior.
- Falhas de gravação mantêm o estado marcado como pendente.

### Bluetooth e ELM327
- Protocolo deixou de ser gravado como valor fixo.
- A sessão consulta ATDP e expõe o protocolo detectado.
- Comandos ELM agora são serializados.
- A inicialização concorrente compartilha a mesma Promise.
- A tela de laboratório encerra a sessão de forma explícita.
- O transporte Bluetooth usa somente recepção por eventos. A leitura manual `available()/read()` foi removida para evitar duas fontes concorrentes de dados.
- Ações OBD ficam bloqueadas até o armazenamento inicial estar pronto.
- O transporte reage a desconexão inesperada do dispositivo em vez de esperar apenas um timeout.
- Escritas CSV para o mesmo arquivo são serializadas para impedir perda de linhas por concorrência.

### Parser, PIDs e DTC
- Mantida a distinção entre resposta real, ausência de dados e valor não interpretado.
- Adicionados PIDs padrão úteis, incluindo PID 015E para taxa de combustível.
- Descoberta de PIDs passou a decodificar os bitmaps padrão e foi exposta no laboratório.
- DTCs padrão do modo 03 passaram a ser decodificados e persistidos quando a fonte é REAL_OBD.
- `DtcRecord` foi centralizado em `src/types/sourceTypes.ts`.

### GPS
- GPS do celular inicia automaticamente no Root Layout.
- O rastreador é singleton e permanece ativo ao navegar entre telas.
- Permissão existente é consultada antes de pedir novamente.
- Falhas de serviço/permissão/watch são reportadas ao usuário.
- Distância usa Haversine com filtro de precisão, salto máximo e velocidade implausível.
- Velocidade usa o valor do provedor e pode cair para velocidade derivada por posição quando necessário.
- Velocidades acima do limite de saneamento não entram na máxima.
- GPS sozinho não é tratado como medidor de litros.

### Storage e limpeza
- Quota passa a respeitar o limite configurado.
- Perfil do veículo valida JSON e garante a criação do diretório.
- Histórico de viagens usa o módulo `driveCycleStorage` em vez de leitura manual duplicada na tela principal.
- Removidos módulos legados sem uso no caminho de execução: `merivaLearning.ts`, `seedImporter.ts` e `txtDatabase.ts`.
- Removidos pacotes diretos sem uso: AsyncStorage, DocumentPicker e Expo Splash Screen.
- Expo Linking e Expo Status Bar permanecem como dependências diretas exigidas pelo expo-router e pelo runtime Expo.

### UI
- Removido botão placeholder de veículo "em desenvolvimento".
- Removida classe `UnavailableTransport` sem uso.
- A lista de dispositivos seleciona automaticamente o primeiro dispositivo disponível.
- A tela de armazenamento evita limpeza concorrente.
- Versão do export é obtida do Expo config.

### Testes
- Cobertura expandida para DTC, descoberta de PIDs, serialização de comandos, transporte Bluetooth por eventos e ciclo de vida do GPS.
- Testes de seed legado removidos junto com os módulos eliminados.

## Estado técnico

- Expo SDK 51.
- React Native 0.74.5.
- Android nativo validado no CI com Java 17.
- `android/` continua gerado pelo Expo e não versionado.
- Sem `package-lock.json`; o CI usa `npm install --no-audit --no-fund`.

## Resultado esperado

O repositório deve permanecer sem valores simulados no caminho REAL_OBD. O modo de simulação existe apenas no laboratório e nos testes.

## Validação

A nova rodada deve passar por:

1. `npm run doctor`;
2. `npm run typecheck`;
3. `npm test`;
4. `npx expo prebuild --clean --platform android --non-interactive`;
5. `./gradlew :app:assembleRelease --no-daemon --stacktrace`.

A confirmação do Bluetooth Classic, GPS e ECU continua sendo feita em aparelho físico.
