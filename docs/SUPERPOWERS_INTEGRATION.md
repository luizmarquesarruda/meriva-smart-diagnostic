# Integração do Superpowers ao fluxo MERIVA SMART

## Objetivo

Adotar a metodologia Superpowers no desenvolvimento do MERIVA SMART sem incorporar código de runtime, dependências npm ou alterações no comportamento do aplicativo.

Repositório upstream: https://github.com/obra/superpowers

O Superpowers fornece skills de engenharia para descoberta de requisitos, planejamento, TDD, depuração sistemática, revisão e verificação. A integração do projeto é feita por instruções locais em `AGENTS.md`, que adaptam essas práticas aos contratos específicos do aplicativo.

## Instalação no agente de programação

O README upstream documenta o Codex App por meio do marketplace oficial de plugins:

1. Abra o Codex App.
2. Entre em **Plugins**.
3. Localize **Superpowers** na seção Coding.
4. Selecione **+** e conclua a instalação.
5. Inicie uma nova sessão de programação no repositório.

A instalação no Codex App é uma ação da interface do usuário. A criação deste arquivo no GitHub não instala nem autoriza o plugin na conta do usuário.

Referência de instalação e fluxo: https://github.com/obra/superpowers#installation

## Mapeamento das skills para o projeto

| Etapa | Skill Superpowers | Aplicação no MERIVA SMART |
|---|---|---|
| Entendimento | `brainstorming` | Delimitar problema, dados observáveis, restrições e critério de aceitação. |
| Planejamento | `writing-plans` | Plano por tarefa, arquivos, riscos e verificações. |
| Implementação | `test-driven-development` | Reproduzir falha, teste RED, correção mínima, teste GREEN e refatoração. |
| Diagnóstico | `systematic-debugging` | Investigar causa raiz sem mascarar sintomas. |
| Revisão | `requesting-code-review` / `receiving-code-review` | Revisar regressões, segurança, concorrência, arquitetura e escopo. |
| Conclusão | `verification-before-completion` | Comprovar cada comando e associar resultados ao SHA exato. |
| Encerramento | `finishing-a-development-branch` | Preparar PR e relatório; merge continua condicionado à autorização explícita. |

O agente deve consultar as skills disponíveis antes de começar. Se não estiverem carregadas, deve seguir o procedimento de `AGENTS.md` manualmente e declarar que a execução das skills não foi confirmada.

## Adaptações obrigatórias

O fluxo padrão do Superpowers pode sugerir worktrees, agentes paralelos e autonomia prolongada. No MERIVA SMART, essas opções ficam subordinadas à coordenação definida pelo usuário:

- uma única frente de correção ativa;
- nenhuma edição paralela de arquivos compartilhados;
- branch isolada a partir de `main`;
- uma PR por fase quando o trabalho for faseado;
- nenhuma mesclagem sem autorização explícita;
- não incorporar automaticamente commits de PRs abertas ou não integradas;
- não declarar validação física com base em testes automatizados ou build.

As regras de domínio e segurança permanecem as do contrato anti-regressão, plano de testes, playbooks técnicos e estado vigente do Diário de Bordo. Em particular, a integração não autoriza alterações no Bluetooth/ELM327, comandos ECU, GPS, fórmulas de autonomia, histórico diário, persistência ou política de SQLite.

## Escopo desta integração

- Adiciona instruções de agente na raiz e esta documentação.
- Não altera código React Native/Expo, dependências, lockfile, CI, configuração Android ou comportamento em runtime.
- Não instala o plugin na conta do Codex.
- Não executa testes de aplicativo nem ensaio físico.
- Não atualiza o Diário de Bordo com um novo DB-NNN enquanto a reconciliação de IDs indicada na auditoria documental/PR aberta não estiver concluída. O registro desta integração fica nesta documentação e na descrição da PR até a reconciliação.

## Critério de aceitação

1. O agente encontra `AGENTS.md` ao abrir o repositório.
2. As skills Superpowers são consultadas quando disponíveis; ausência é declarada, não simulada.
3. O fluxo preserva os contratos específicos do MERIVA SMART.
4. Nenhuma dependência de runtime ou alteração funcional é introduzida por esta integração.
5. A PR recebe CI do seu HEAD final; teste físico continua pendente até ser executado no hardware real.
