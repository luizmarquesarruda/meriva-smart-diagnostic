# Build Android

## Fluxo oficial de APK

O fluxo suportado nesta etapa não usa EAS Build nem atualização OTA. A CI gera um APK standalone a partir da configuração Expo e do projeto Android nativo:

1. instala dependências com `npm ci --no-audit --no-fund`;
2. executa Expo Doctor, baseline anti-regressão, TypeScript e todas as suítes;
3. gera o projeto Android com `npx expo prebuild --clean --platform android --non-interactive`;
4. monta `android/app/build/outputs/apk/release/app-release.apk` com Gradle;
5. publica o arquivo como artefato `meriva-smart-diagnostic-standalone-apk` por 14 dias.

O download fica na seção **Artifacts** da execução da CI correspondente ao SHA desejado. Não use APK de execução anterior como se contivesse alterações ainda não compiladas.

## Toolchain

- Node.js: 20.x
- Java/JDK: 17
- Expo SDK: 51.0.39
- React Native: 0.74.5
- Android nativo: gerado pelo Expo prebuild

Java 21 não é a referência deste projeto. O build CI usa Java 17. Em Termux/ARM, erros do Gradle envolvendo `SystemInfo` não devem ser corrigidos trocando aleatoriamente a versão do Gradle.

## Validação local

```bash
npm ci --no-audit --no-fund
npm run doctor
npm run gate:baseline
npm run validate
npx expo prebuild --clean --platform android --non-interactive
```

Para montar o APK localmente após o prebuild, com Android SDK e Java 17 configurados:

```bash
cd android
./gradlew :app:assembleRelease --no-daemon
```

O APK esperado é `android/app/build/outputs/apk/release/app-release.apk`. O projeto Android é gerado pelo prebuild e não é versionado no Git.

## Executar no aparelho

Para desenvolvimento nativo com dispositivo Android conectado:

```bash
npx expo run:android
```

O app usa `react-native-bluetooth-classic`; Expo Go não substitui um build nativo Android para validar Bluetooth Classic.

## Estado e limites

- Distribuição de teste: APK produzido pelo Gradle na CI.
- EAS Build: não faz parte do fluxo atual e não deve ser usado como instrução operacional.
- Atualização OTA: removida temporariamente; alterações de código exigem gerar e instalar um novo APK.
- Validação física: instalar o APK no Android real e testar inicialização fria, permissões, conexão RFCOMM, inicialização ELM e resposta real da ECU. CI verde não comprova comunicação com hardware.
- SDK 51 / React Native 0.74.5 permanecem dívida de modernização; não atualizar junto da limpeza de EAS sem plano incremental e baseline físico.
