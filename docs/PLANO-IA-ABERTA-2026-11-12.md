# Plano de IA aberta — MERIVA SMART

Data: 12/11/2026.

## Decisão

Separar a IA que ajuda a programar da IA que eventualmente será executada dentro do aplicativo. Não adicionar chamadas de rede, modelos ou dependências ao caminho de telemetria/diagnóstico nesta fase.

## Fontes e licenças verificadas em 12/11/2026

- **Qwen Code** — agente de desenvolvimento aberto, licença Apache-2.0; suporta provedores locais como Ollama e vLLM. É ferramenta para o ambiente de programação, não um módulo de runtime do aplicativo: https://github.com/QwenLM/qwen-code
- **Qwen3-0.6B-GGUF** — pesos oficiais sob Apache-2.0; a variante Q8_0 publicada tem aproximadamente 639 MB e a ficha indica uso com llama.cpp. O tamanho do arquivo não representa a RAM total necessária durante inferência: https://huggingface.co/Qwen/Qwen3-0.6B-GGUF
- **llama.cpp** — runtime aberto com orientação oficial para Android/NDK e exemplo de app Android; a documentação recomenda iniciar com contexto moderado (por exemplo, 4096 tokens), pois contextos grandes podem elevar bastante a memória: https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md
- **LiteRT-LM** — runtime aberto Apache-2.0 com API Kotlin para Android e opções de aceleração; requer artefato de modelo compatível .litertlm, portanto não é intercambiável diretamente com GGUF: https://github.com/google-ai-edge/LiteRT-LM e https://developers.google.cn/edge/litert-lm/android

Licenças do runtime, do agente e dos pesos são independentes. Cada arquivo de modelo incorporado ou baixado deve ter licença, origem, versão e SHA-256 registrados. Não copiar pesos grandes para o Git do aplicativo.


## Aplicação no MERIVA

A IA embarcada, quando aprovada, será uma camada de explicação sobre evidências já coletadas e validadas. O motor OBD, os decodificadores PID, as faixas de plausibilidade, a identificação de DTC e as decisões de segurança continuam determinísticos e rastreáveis. O LLM não poderá:

- gerar, enviar ou sugerir a execução de comandos de escrita na ECU;
- limpar DTC, calibrar tanque, alterar parâmetros ou controlar o veículo;
- substituir resposta real do PID por inferência, preencher valores N/D ou converter hipótese em fato;
- executar no mesmo thread/fila do Bluetooth Classic, ELM327 ou ECU;
- transmitir VIN, MAC, localização, DTC, histórico ou dados do veículo para serviço remoto.

Uso inicial permitido: explicar em português um relatório já fechado, apontando PID/DTC de origem, timestamp, estado de conexão, limites e lacunas. Cada afirmação deve citar a evidência local e ser rotulada como observada, calculada ou hipótese. Sem evidência suficiente, responder “não foi possível concluir”.

## Piloto proposto

- Modelo de triagem: Qwen3-0.6B-GGUF Q8_0, somente como candidato local e opcional; arquivo de aproximadamente 639 MB.
- Runtime preferencial para primeiro protótipo nativo Android: llama.cpp, por ter instruções Android/NDK e suporte ao formato GGUF.
- O Expo/React Native exige uma ponte nativa Android ou módulo compatível. Não adicionar essa ponte antes de um protótipo isolado compilar e medir no Galaxy A06.
- LiteRT-LM é alternativa Kotlin, condicionada à disponibilidade de conversão/exportação compatível do modelo e a benchmark.

## Critérios de entrada

Antes de integrar: confirmar RAM disponível e ABI do aparelho; medir instalação/armazenamento, carga fria e quente, latência, tokens/s, pico de RAM, travamento/ANR, aquecimento e consumo de bateria em sessão curta e longa; comprovar funcionamento offline; verificar que nenhum dado sai do aparelho; testar prompts malformados e instruções que tentem alterar regras OBD; permitir desativar/remover o modelo sem perder histórico.

A IA não pode ser condição para conexão ELM, captura de PID, diagnóstico básico ou funcionamento offline. Se o teste no A06 não for satisfatório, manter apenas explicações determinísticas.

## Estado

Pesquisa concluída; modelo e runtime selecionados apenas para protótipo. Nenhuma dependência, peso de modelo, ponte nativa ou chamada de IA foi adicionada. Compatibilidade e desempenho no Galaxy A06: **não validados**.
