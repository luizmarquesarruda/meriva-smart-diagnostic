# Build Android

## Fluxo oficial pela CI

O workflow `.github/workflows/ci.yml` executa:

1. instalação reproduzível com `npm ci --no-audit --no-fund`;
2. Expo Doctor, gate anti-regressão, TypeScript e suíte completa;
3. `npx expo prebuild --clean --platform android --non-interactive`;
4. build standalone com Gradle em Java 17;
5. verificação do APK e geração de `app-release.apk.sha256`.

## Política de distribuição

- Não existe publicação automática de GitHub Release nem URL pública estável de APK.
- O artefato é enviado somente quando `repository.visibility` é `private` e a referência é `refs/heads/main`.
- Eventos `pull_request`, builds de outras branches e execuções enquanto o repositório for público compilam e validam, mas não enviam o APK como artefato.
- O artefato contém o APK e seu checksum SHA-256 e expira após três dias.
- O download exige autenticação e permissão de leitura no repositório privado.
- O workflow usa `contents: read`; não recebe permissão `contents: write`.

**Importante:** na data desta alteração, o GitHub ainda informa o repositório como público. A condição do workflow impede novos uploads de APK enquanto isso não for corrigido, mas não torna privado o código-fonte nem revoga artefatos antigos. O proprietário precisa mudar a visibilidade do repositório para `Private` nas configurações do GitHub e revisar artefatos já existentes.

## Toolchain

- Node.js: 20.x
- Java/JDK: 17
- Expo SDK: conforme `package.json` e `app.json` versionados
- Android nativo: gerado pelo Expo prebuild; o diretório `android/` não é versionado.

## Validação local

```bash
npm ci --no-audit --no-fund
npm run doctor
npm run gate:baseline
npm run validate
npx expo prebuild --clean --platform android --non-interactive
cd android && ./gradlew :app:assembleRelease --no-daemon
```

O APK esperado é `android/app/build/outputs/apk/release/app-release.apk`. O checksum pode ser criado/verificado com `sha256sum app-release.apk`.

## Executar no aparelho

```bash
npx expo run:android
```

O app usa `react-native-bluetooth-classic`; Expo Go não substitui um build nativo Android para validar Bluetooth Classic.

## Limites de validação

CI verde comprova validação automatizada e compilação, não conexão física RFCOMM, inicialização ELM, resposta real `010C`, leitura `012F/015E`, GPS ou autonomia. Esses pontos exigem ensaio separado no Galaxy A06/Android 16 e no veículo.

SDK 51 / React Native 0.74.5 permanecem dívida de modernização. Não combinar uma atualização de SDK com a estabilização Bluetooth sem migração incremental e baseline físico.
