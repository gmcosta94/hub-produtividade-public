# Integração dos módulos

Escrito em 16/11/2026.

## A decisão

O plano original construía um módulo por vez, cada um depois de duas semanas de uso do anterior. Em 16/11/2026 o Gabriel mudou a ordem: **primeiro todos os módulos em corte mínimo e ligados entre si; depois o aprofundamento de cada um.** O motivo é que o valor do hub está na ligação entre as partes. Um módulo isolado, por melhor que seja, é só mais um lugar para registrar.

O desenho dele tem cinco módulos: Sistema, Áreas, Hábitos, Tarefas e Anotações. O hub acrescenta duas telas que cruzam os cinco: Hoje e Plano.

O texto atual da Constituição é um modelo. Ele está sobrecarregado e será enxugado em outro momento.

## O que liga os módulos

Duas coisas: a **área** e o **projeto**.

| De | Para | Como |
|---|---|---|
| Área | Hábitos | A página da área mostra os hábitos dela, na mesma lista da tela Hábitos |
| Área | Sistema | Cada área tem os próprios textos de estratégia; os da área Sistema são a Constituição |
| Área | Plano | O objetivo do ciclo pertence a uma área; o modo (foco, manutenção, pausa) é da área |
| Área | Tarefas e Notas | Projetos, tarefas e notas apontam para uma área |
| Projeto | Tarefas e Notas | A página do projeto junta as tarefas e as notas dele (o P do PARA) |
| Projeto | Plano | Um projeto pode servir a um objetivo do ciclo |
| Sistema | Hábitos | Um hábito pode seguir um texto (um processo, uma regra) |
| Sistema | Plano, Tarefas, Áreas | Os limites em números são aplicados pelo banco |
| Tudo | Hoje | Tamanho do dia, destaque, tarefas do dia, captura, hábitos e sessão de foco |

A categoria do PARA de uma nota não é uma pasta. Ela sai das ligações: com projeto é Projeto, só com área é Área, sem nenhuma é Recurso, arquivada é Arquivo.

## Limites que o banco aplica

- **Áreas em foco**: no máximo `areas_em_foco_max` (2). A terceira é recusada.
- **Espaços do dia**: no máximo `espacos_extras_dia` (2) tarefas com o mesmo dia. A terceira é recusada.
- **Nada fica atrasado**: tarefa aberta cujo dia passou volta a ficar sem dia (`v_tarefa`).
- **Emenda**: mudar um texto da Constituição pede motivo (já existia).

## O Sistema enxuto (decisões de 16/11/2026)

As regras das notas originais geravam de 7 a 14 objetivos por trimestre e de 21 a 35 metas por mês. O Gabriel aprovou a versão enxuta:

- **Três escalas: ciclo, semana e dia.** A camada mensal de metas saiu. O ciclo tem o tamanho que o período pede: um mês, um trimestre.
- **Até 2 áreas em foco por ciclo e até 2 objetivos por área.** As outras áreas têm um padrão mínimo.
- **O padrão mínimo também se acompanha.** Ele é sustentado por hábitos, que têm meta por semana e não precisam ser diários.
- **A revisão da semana é na sexta**, ao fechar o expediente.
- **Os hábitos têm três pesos** (`habito.prioridade`): `essencial` (beira o inegociável no ciclo, no máximo 3), `base` (sustenta o padrão mínimo de uma área) e `livre` (registro sem cobrança). Em Hoje os hábitos aparecem por peso, com os livres recolhidos. A página da área mostra quantos hábitos de base cumpriram a meta da semana.

Limites que o banco passou a aplicar, além dos dois que já existiam: `objetivos_por_area_max` (2), `habitos_essenciais_max` (3) e `projetos_ativos_max` (3).

Os textos da Constituição foram emendados com esse motivo. A fonte fica em `dados/conteudo/constituicao/` (fora do git) e `scripts/emendar_textos.py` gera o SQL que aplica as diferenças como emendas.

## Ajustes de 17/11/2026

- **Hábitos de sim ou não** têm dois botões: ✓ (feito; num dia mínimo, versão mínima) e ✕ ("não fiz"). Tocar de novo no marcado limpa o dia. "Não fiz" fica registrado, não conta para a semana e, ao contrário de "dispensado", não reduz a meta. Dia sem registro continua sendo só um dia sem registro.
- **Hábitos de quantidade e medidas** mostram um campo de número: "#" e a unidade quando vazio, o valor quando preenchido.
- **O formato do hábito** (sim ou não / quantidade) pode mudar no cadastro enquanto ele não tem registros. O banco também confere (`conferir_troca_de_formato`).
- **Sistema**: a Constituição é lida como um documento só, com cada tópico abrindo e fechando pelo título (o primeiro vem aberto). Em cada tópico: emendar, histórico de emendas e hábitos ligados. As estratégias das áreas usam o mesmo formato, todas abertas.

## Histórico de foco e estudo (17/11/2026)

Tela própria (rota `foco`), aberta pelo link em Hoje (sessão de foco) ou pela página de uma área (já filtrada por ela):

- Totais do período (foco, estudo, média por semana sem a semana atual, parte do foco em sessões profundas).
- Gráfico de barras por semana, foco embaixo e estudo em cima, com a linha do mínimo do nível dos objetivos da área no ciclo (leve 1 h, moderado 3 h, intenso 5 h por semana).
- Filtros de período (4, 12 ou 26 semanas), tipo e área.
- Sessões dia a dia com escopo e revisão; tocar numa sessão abre a edição (`editar_sessao`) ou apaga.

## O que cada módulo tem neste corte

| Módulo | Tem | Falta |
|---|---|---|
| Hoje | Rituais de início e de fim (checklist do Sistema, com a hora de conclusão), tamanho do dia, destaque com área, tarefas do dia, captura, hábitos do dia, sessão de foco. No dia mínimo, um toque marca a versão mínima | Agenda; blocos de tempo |
| Hábitos | Um box por hábito para o dia escolhido, semana em quadradinhos, filtro por área, cadastro e edição (nome, área, formato, limite, meta semanal, versão mínima, desativar) | Observação por dia; ordem manual; cadastro de métrica |
| Tarefas | Entrada, abertas por projeto ou área, projetos, feitas, dia com limite | Recorrência, prazos, ordenação manual, subtarefas |
| Notas | Gavetas do PARA, busca, Markdown, ligação com projeto e área | Editor rico, anexos, importação do Apple Notes |
| Áreas | Painel, modo com limite, padrão mínimo, página que junta tudo da área | Métricas e gráficos; módulos próprios de Saúde e Lazer |
| Plano | Ciclo, objetivos por área com intensidade e mínimo, semana (intenção e revisão) | O ciclo de foco guiado em cinco passos; capacidade em horas |
| Sistema | Textos por tipo, emenda com motivo, histórico, limites em números, hábitos ligados. Os textos `ritual_inicio` e `ritual_fim` viram os checklists de Hoje | Versão anterior de cada emenda na tela |

## O assistente

A função `revisao_da_semana(p_semana)` devolve um documento só, com o que foi decidido (limites, modos das áreas, ciclo, intenção da semana) ao lado do que aconteceu (hábitos, foco, tarefas, projetos, notas, emendas).

Dois caminhos para usar:

1. No app, em Plano, o botão "Copiar a semana para o assistente" copia esse documento. Cole numa conversa com o Claude.
2. No Claude Code, dentro do projeto:

```bash
supabase db query --remote --read-only "select public.revisao_da_semana()"
```

Roteiro da revisão: comparar o decidido com o feito, apontar no máximo três observações, e propor ajustes que reduzam compromissos antes de propor novos. Mudança de regra só vira emenda nas revisões mensal e do ciclo.

O assistente dentro do app, pela API, continua para depois.
