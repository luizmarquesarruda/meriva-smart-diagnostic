# Instruções de engenharia — MERIVA SMART

Estas regras complementam as instruções do agente e as skills Superpowers. Elas não substituem os contratos técnicos do repositório.

## Ordem de autoridade

1. Pedido explícito mais recente do usuário para a tarefa.
2. Regras vigentes em `docs/CONTRATO_ANTI_REGRESSAO.md`, `docs/TEST_PLAN.md` e nos playbooks técnicos aplicáveis.
3. Estado vigente no início de `docs/DIARIO_DE_BORDO.md`.
4. Plano aprovado para a tarefa.
5. Skills Superpowers e convenções gerais de engenharia.

Se houver conflito, interrompa a ação conflitante, explique o risco e siga a regra de maior prioridade. Não trate texto histórico do diário como estado atual.

## Fluxo Superpowers obrigatório para mudanças de código

Antes de editar, verifique quais skills Superpowers estão disponíveis e use as aplicáveis:

1. `using-superpowers`: identificar as skills relevantes antes de agir.
2. `brainstorming`: esclarecer objetivo e critérios quando houver ambiguidade ou decisão de produto/arquitetura. Para correção pequena e inequívoca, registrar o entendimento sem criar cerimônia desnecessária.
3. `writing-plans`: decompor mudanças com mais de uma etapa em tarefas pequenas, arquivos envolvidos e comandos de verificação.
4. `test-driven-development`: reproduzir a falha com teste que falha, implementar a menor correção e confirmar o teste passando.
5. `systematic-debugging`: investigar causa raiz antes de alterar código; não mascarar sintomas nem enfraquecer testes.
6. `requesting-code-review` e `receiving-code-review`: revisar o diff por aderência ao pedido, regressões, segurança, concorrência e manutenção.
7. `verification-before-completion`: executar os comandos aplicáveis e inspecionar seus resultados antes de declarar conclusão.
8. `finishing-a-development-branch`: resumir alterações, testes, riscos e estado da PR. Não mesclar sem autorização explícita.

Se o plugin Superpowers não estiver instalado ou suas skills não forem disponibilizadas pelo agente, não alegue que foram executadas. Siga este fluxo manualmente e registre essa limitação.

## Regras específicas do MERIVA SMART

- Preserve a separação entre Bluetooth Classic, sessão ELM327, ECU, parser, telemetria, persistência e UI.
- Não altere Bluetooth, framing RFCOMM, inicialização ELM, gate real `010C`, descoberta de PIDs, polling ou comandos OBD fora do escopo explicitamente autorizado.
- Comandos OBD permanecem somente leitura. Não introduza escrita na ECU nem limpeza de DTC.
- Não introduza SQLite sem medições reais no Galaxy A06 e aprovação explícita.
- Não sobrescreva JSON corrompido ou de schema futuro. Preserve escrita atômica, validação, cópia anterior e rollback.
- Não apague, trunque ou limite `meriva_smart_daily_obd_history.txt`; sessões do mesmo dia devem permanecer independentes.
- GPS e combustível/autonomia devem respeitar os contratos existentes e a origem/frescor dos dados. Não transforme simulação, seed ou estimativa em leitura REAL_OBD.
- Não introduza dados fictícios, credenciais, tokens ou segredos no código, testes, logs ou documentação.
- Não atualize dependências apenas para adotar Superpowers. O método é ferramenta de engenharia, não dependência de runtime do aplicativo.

## Isolamento e coordenação

- Mantenha uma única frente de correção por vez. Não despache subagentes em paralelo para editar arquivos compartilhados nem crie branches concorrentes para o mesmo problema.
- Use uma branch de trabalho isolada a partir de `main`; não faça commits diretamente em `main`.
- Para trabalho dividido em fases, mantenha uma PR por fase, conforme instrução do usuário.
- Antes de editar, consulte PRs abertas e identifique sobreposição de arquivos/escopo. Não copie automaticamente alterações de PRs não integradas.
- Não faça merge, não feche PRs e não reescreva branches existentes sem autorização explícita.
- Atualize documentação e changelog pertinentes. Para o Diário de Bordo, consulte o maior ID válido e o índice; se houver colisões de IDs entre branches/PRs, não invente nem reutilize um ID. Registre a limitação na PR e aguarde reconciliação.

## Verificação e declaração de estado

Execute, quando aplicável, nesta ordem:

```bash
npm ci --no-audit --no-fund
npm run doctor
npm run gate:baseline
npm run validate
npx expo prebuild --clean --platform android --non-interactive
cd android && ./gradlew :app:assembleRelease --no-daemon
```

- Não remova nem enfraqueça testes para obter CI verde.
- Associe cada resultado ao SHA exato testado.
- Diferencie teste unitário, typecheck, Expo Doctor, CI/build Android e ensaio físico.
- Sem execução observada, escreva `não validado`; não afirme que um comando foi executado.
- APK compilado não valida Bluetooth/ELM327/ECU. O ensaio físico no Galaxy A06 / Android 16 deve ser registrado separadamente.
- Antes de concluir, revise o diff completo contra `main`, procure efeitos colaterais e confirme que nenhuma regra protegida foi alterada acidentalmente.
