# Modelo de dados — proposta

Escrito em 16/11/2026. Isto é o desenho, não a migration. Os tipos e as restrições exatos ficam para a fase 0.

Postgres. Nomes em português, snake_case, singular. Toda tabela tem `id` (bigint identity), `criado_em` e `atualizado_em`. Controle de acesso por linha ligado em todas as tabelas.

## Convenções que valem para tudo

- **Dia**: a data local (America/Sao_Paulo). Todo registro tem uma `data` própria, separada de `criado_em`, porque o hábito de ontem costuma ser marcado hoje de manhã.
- **Semana**: de domingo a sábado. O `date_trunc('week', ...)` do Postgres começa na segunda, então o início da semana é calculado por uma função própria (`inicio_da_semana`), a única definição de semana no projeto.
- **Ausência não é falha.** Dia sem registro de um hábito é só um dia sem registro. Não existe estado "falhou".
- **O mínimo conta.** Hábito feito na versão mínima conta para a meta semanal igual ao feito por inteiro.
- **Meta é opcional.** Hábito ou registro sem meta só é mostrado, sem comparação.

## As seis peças e onde cada uma entra

| Peça | Tabelas | Fase |
|---|---|---|
| Estratégia | `estrategia`, `estrategia_versao`, `parametro` | 1 |
| Hábito | `habito`, `habito_registro` | 1 |
| Registro | `registro` | 1 (foco e estudo); outros tipos depois |
| Métrica | `metrica`, `metrica_registro` | 1 (o caderno já tem uma) |
| Referência | `referencia` | 2 |
| Objetivo | `ciclo`, `objetivo` | 4 |

Fora das seis peças: `area` e `dia` (fase 1); `bloco` (fase 4); `entrada`, `projeto` e `tarefa` (fase 5).

## Fase 1

**`area`** — as áreas da vida e o módulo Sistema.
`nome`, `tipo` (vida | sistema), `modo` (foco | manutencao | pausa), `padrao_minimo` (texto: o que significa "está ok"), `rever_em` (data, só para pausa), `ordem`, `ativa`.
Na fase 1 o modo é editado à mão. Na fase 4 ele passa a ser decidido por ciclo, e o histórico vai para `ciclo`.
A área de tipo `sistema` é única e não tem modo.

**`estrategia`** — o que foi decidido, em texto.
`area_id`, `titulo`, `tipo` (pilar | processo | limite | plano | regra), `corpo` (Markdown), `chave` (opcional, única), `ordem`, `ativa`.
- As estratégias da área Sistema formam a Constituição.
- `chave` deixa uma tela achar o processo que ela executa. Exemplos: `sessao_de_foco`, `ritual_inicio`, `ritual_fim`.
- Um processo pode conter uma lista de marcação em Markdown (`- [ ]`). A tela mostra essa lista como checklist.

**`estrategia_versao`** — o histórico de emendas.
`estrategia_id`, `corpo` (o texto anterior), `motivo`.
Toda edição de `corpo` grava a versão anterior aqui. O `motivo` é obrigatório nas estratégias da Constituição.

**`parametro`** — os limites numéricos da Constituição.
`chave` (única), `valor` (numeric), `unidade`, `descricao`, `estrategia_id` (o texto que explica o limite, opcional).
Valores iniciais: `areas_em_foco_max` = 2, `espacos_extras_dia` = 2, `margem_capacidade` = 0,7, `foco_duracao_minima_min` = 60. Só o último é usado na fase 1.

**`habito`**
`area_id`, `estrategia_id` (opcional), `nome`, `tipo` (sim_nao | quantidade), `unidade` (só quantidade), `comparacao` (pelo_menos | no_maximo), `meta_valor` (só quantidade; nulo = só conta), `meta_dias` (número de dias na semana; nulo = sem meta), `versao_minima` (texto, opcional), `momento` (manha | expediente | noite | qualquer), `dias_da_semana` (opcional; nulo = todos), `ordem`, `ativo`.

Dois formatos saem dessas colunas:

| Formato | Exemplo | Como se lê |
|---|---|---|
| Sim ou não | "Fiz X hoje" | O dia conta se foi marcado. |
| Quantidade por dia | "No máximo N minutos de Y", "quantas refeições dentro do plano" | Com `meta_valor`, o dia conta se o valor respeitou o limite. Sem `meta_valor`, o número é só registrado e somado na semana. |

Nos dois, `meta_dias` diz quantos dias por semana, se houver meta. `momento` só ordena a lista em Hoje.

Cota por semana (soma da semana contra um limite) foi cogitada e retirada em 16/11/2026: nenhum hábito atual usa.

**`habito_registro`** — uma linha por hábito e dia.
`habito_id`, `data`, `estado` (feito | minimo | dispensado), `valor` (só quantidade), `observacao`.
Único por (`habito_id`, `data`).
`dispensado` tira o dia da conta da semana (viagem, doença). Não é falha nem acerto.

**`metrica`** e **`metrica_registro`** — um número ao longo do tempo.
`metrica`: `area_id`, `nome`, `unidade`, `agregacao_semanal` (ultimo | soma | media), `intervalo_max_dias` (opcional), `momento`, `ordem`, `ativa`.
`metrica_registro`: `metrica_id`, `data`, `valor`, `observacao`. Único por (`metrica_id`, `data`).
Métrica não tem meta nem estado. Ela aparece na grade de hábitos como uma linha em que se digita o número.
`intervalo_max_dias` serve para medições sem dia fixo: passado esse número de dias desde a última medição, a métrica aparece em Hoje com "última há N dias". Antes disso, ela não aparece em Hoje.

**`registro`** — uma entrada datada. Na fase 1, sessões de foco e de estudo.
`area_id`, `tipo` (foco | estudo; depois hobby, treino, decisao), `data`, `inicio` (opcional), `duracao_min`, `titulo` (o escopo da sessão), `resultado` (a revisão ao final, opcional), `estrategia_id` (o processo seguido, opcional).
- Sessão em andamento: `inicio` preenchido e `duracao_min` nulo. Só pode haver uma.
- Lançamento manual: só `data`, `tipo`, `duracao_min` e, se quiser, `titulo`. É o equivalente a anotar as horas no caderno.

**`dia`** — uma linha por data.
`data` (única), `tamanho` (minimo | normal | cheio), `destaque` (texto), `destaque_area_id`, `destaque_feito`, `inicio_em` e `encerrado_em` (quando os rituais de início e de fim foram concluídos), `nota`.
O estado do checklist de um ritual não é guardado. Só o momento em que ele foi concluído.

### Views da fase 1

O app lê views `v_*` em vez de montar joins. Toda view tem `security_invoker = true`.

| View | O que entrega |
|---|---|
| `v_habito_dia` | Para uma data: os hábitos que valem nesse dia, com o estado e o valor registrados |
| `v_habito_semana` | Por hábito e semana: dias feitos, dias no mínimo, dias dispensados, meta e meta ajustada pelos dispensados |
| `v_metrica_semana` | Por métrica e semana: valores dos dias e o agregado da semana |
| `v_sessao` | Uma sessão com o nome da área, se está em andamento e se é "profunda" (foco que atingiu a duração mínima) |
| `v_foco_dia` | Minutos de foco e de estudo por dia |
| `v_foco_semana` | Minutos por semana e tipo, com a parte feita em sessões profundas |
| `v_painel_area` | Por área: modo, padrão mínimo, hábitos com meta e quantos estão no ritmo na semana |
| `v_revisao_semana` | Para o assistente: a semana em linhas (hábitos, foco, destaques, tamanho dos dias, emendas) |

## Fases seguintes (resumo)

**`referencia`** (fase 2) — link para nota ou arquivo.
`area_id`, `estrategia_id` (opcional), `titulo`, `tipo` (nota | arquivo | link), `endereco`.
Em aberto: o Apple Notes não oferece um endereço estável por nota. A solução será decidida na fase 2.

**`ciclo`** e **`objetivo`** (fase 4) — o ciclo de foco.
`ciclo`: período, capacidade calculada, modo de cada área no ciclo. `objetivo`: `ciclo_id`, `area_id`, esforço semanal, nível (leve | moderado | intenso), mínimo para a semana ruim.

**`bloco`** (fase 4) — blocos de tempo do dia.

**`entrada`**, **`projeto`** e **`tarefa`** (fase 5) — captura e tarefas.

Treino com cargas (fase 3) precisa de mais do que `registro` oferece. Se será uma tabela filha de `registro` ou métricas por exercício, decide-se na fase 3.
