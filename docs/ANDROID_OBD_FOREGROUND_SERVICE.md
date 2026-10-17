# Serviço Android em primeiro plano para a sessão OBD

## Escopo real desta etapa

O serviço Java mantém a sessão do diagnóstico visível ao Android por meio de uma notificação contínua enquanto a sessão ECU validada está ativa. O proprietário do socket Bluetooth Classic, a fila serial de comandos ELM327 e as consultas OBD continuam sendo os módulos já existentes em React Native/JavaScript.

**Esta etapa ainda não transfere o polling OBD para Java.** O serviço não abre socket RFCOMM, não envia AT/PID, não escreve na ECU e não limpa DTC. Isso evita criar um segundo proprietário do adaptador e duas filas de comandos concorrentes. A transferência futura do polling para Java exigiria migrar formalmente o transporte e remover o proprietário JS anterior; nunca deve funcionar em duplicidade.

## Arquitetura

- Config plugin: `plugins/withObdForegroundService.js`
- Templates Java gerados em prebuild:
  - `plugins/obdForegroundServiceTemplates/ObdForegroundService.java`
  - `plugins/obdForegroundServiceTemplates/ObdForegroundServiceModule.java`
  - `plugins/obdForegroundServiceTemplates/ObdForegroundServicePackage.java`
- Ponte React Native: `src/obd/nativeObdForegroundService.ts`
- Integração de início/fim da sessão: `src/obd/sharedConnection.ts`
- Teste de contrato estático: `tests/obdForegroundServicePlugin.test.js`

O plugin:
1. Acrescenta permissões de foreground service ao AndroidManifest gerado.
2. Registra um serviço não exportado do tipo `connectedDevice`.
3. Registra o módulo React Native no `MainApplication.kt` gerado.
4. Copia os arquivos Java para `android/app/src/main/java/<applicationId>/obd` na geração nativa.

Os arquivos em `android/` continuam gerados: não devem ser commitados diretamente na política CNG do projeto.

## Ciclo de vida

- Iniciar somente depois da validação de resposta real da ECU no fluxo existente.
- Exibir notificação permanente de baixa importância com o nome do adaptador.
- Solicitar encerramento em desconexão voluntária, perda de conexão e fechamento de sessão.
- Não restaurar automaticamente uma conexão falsa após reinício do processo; a solicitação sem ação válida é interrompida.
- Se o módulo estiver ausente (por exemplo, execução num ambiente que não incluiu módulos nativos), a aplicação continua com o fluxo anterior e registra aviso, sem fingir que o serviço começou.

O retorno positivo de `startNativeObdForegroundService` significa que o pedido ao Android foi aceito, não que o polling JS esteja imune a todas as restrições de segundo plano. A notificação também não significa que a ECU está respondendo; esse estado pertence ao monitor ELM/ECU existente.

## Permissões e plataforma

O plugin adiciona:
- `android.permission.FOREGROUND_SERVICE`
- `android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE`

O app existente já declara permissões Bluetooth no `app.json`. O Android exige o tipo e as permissões compatíveis para serviços em primeiro plano de dispositivos conectados nas versões modernas do sistema. A autorização de Bluetooth em runtime ainda é controlada pelo fluxo de conexão existente; a autorização de localização continua sob o módulo de permissões/Expo Location.

## Validação antes de distribuir APK

Depois de baixar/atualizar a branch num ambiente de desenvolvimento:
```bash
npm ci
npm run typecheck
npm test
npx expo prebuild --platform android --clean
```

Inspecionar o resultado gerado:
- `AndroidManifest.xml` contém o serviço `connectedDevice` e permissões necessárias.
- `MainApplication.kt` importa e adiciona `ObdForegroundServicePackage()` uma única vez.
- As três classes Java estão sob o pacote `com.meriva.smartdiagnostic.obd`.
- Gradle compila o serviço contra o compile SDK configurado pelo template SDK 51.
- Instalar num Android real e confirmar notificação, retorno de app ao foreground, stop voluntário, queda de Bluetooth, reinício do processo e ausência de duplicação de sockets.

O prebuild/build e o ensaio físico **não foram executados nesta etapa**. Não tratar o teste estático como prova de compilação ou comportamento real do Android.

## Referências oficiais

- [Expo config plugins e Continuous Native Generation](https://docs.expo.dev/config-plugins/introduction/)
- [Expo SDK 51 — SQLite](https://docs.expo.dev/versions/v51.0.0/sdk/sqlite/)
- [Android — foreground service types](https://developer.android.com/about/versions/14/changes/fgs-types-required)
- [Android — SQLiteOpenHelper, referência nativa](https://developer.android.com/reference/android/database/sqlite/SQLiteOpenHelper)
