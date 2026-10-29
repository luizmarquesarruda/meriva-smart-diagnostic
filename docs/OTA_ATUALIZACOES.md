# Atualizações OTA — Meriva Smart

## O que pode ser atualizado sem reinstalar

O EAS Update distribui código JavaScript/TypeScript e assets compatíveis com o runtime nativo instalado. Ele **não** instala nem altera o módulo Bluetooth nativo, permissões Android, código Java/Kotlin, plugins nativos ou dependências nativas. Alterações nativas exigem APK novo.

## Configuração registrada no repositório

- Expo SDK permanece em 51; `expo-updates` está fixado em `~0.25.27`.
- O projeto está configurado com slug `meriva`, owner `luizarruda` e project ID `013db816-eec1-4406-8952-d6c0731cf461`, conforme os dados fornecidos.
- O endpoint de update é `https://u.expo.dev/013db816-eec1-4406-8952-d6c0731cf461`.
- O runtime segue `appVersion`; a versão nativa atual é `1.0.1`. Não publique código que exija nova API nativa mantendo a mesma versão de runtime.
- O canal escolhido para a distribuição pessoal é `production`. O header está no app config porque a CI gera o APK com `expo prebuild` + Gradle, sem EAS Build.

## Ativar publicação automática

A publicação está deliberadamente bloqueada por padrão. Para habilitar, na configuração do repositório GitHub, cadastre:

1. **Secret** `EXPO_TOKEN`: token de acesso da conta Expo proprietária do projeto. Não inserir o token no código, commit, issue ou chat.
2. **Repository variable** `EAS_UPDATE_ENABLED` com valor exato `true`.
3. Confirme que o canal EAS `production` existe e aponta para o branch de updates desejado. No terminal autenticado na conta Expo, use `npx eas-cli@latest channel:list` e `npx eas-cli@latest channel:view production`. Se necessário, crie-o com `npx eas-cli@latest channel:create production` e confirme o vínculo do branch no dashboard/CLI.

Com essa chave habilitada, a workflow só tenta publicar em push para `main`, depois de `validate` e `android-build` passarem. Publica apenas alterações em `app/`, `src/`, `assets/`, `components/` ou `hooks/`; mudanças em configuração, dependências ou código nativo fazem o gate ignorar o OTA. Se houver código do app para publicar, a ausência de `EXPO_TOKEN` falha explicitamente.

## Primeiro APK obrigatório

O APK instalado antes desta alteração não contém o módulo nativo `expo-updates` e não pode ganhar esse módulo por OTA. Depois de integrar esta configuração, gere e instale uma nova APK via CI. Só então habilite `EAS_UPDATE_ENABLED=true`. Essa primeira reinstalação é necessária; alterações futuras apenas JS/TS/assets poderão chegar via OTA.

## Limitações que permanecem

- O estado de autenticação, slug/owner e canal no serviço Expo não foi consultado por API nesta sessão; os identificadores no repositório são os dados fornecidos pelo proprietário.
- Esta alteração não publica nenhum update ao criar PR ou ao executar CI numa branch diferente de `main`.
- Não foi realizado teste em aparelho Android real após a instalação da nova APK. A publicação automática deve permanecer desativada até conferir o canal e fazer esse teste inicial.
