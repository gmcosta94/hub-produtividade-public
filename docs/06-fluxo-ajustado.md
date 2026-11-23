# Fluxo ajustado (19/11/2026)

O hub é um fluxo só, dentro da moldura do Sistema. A tela Sistema desenha
este mapa e explica cada elo (o que faz, a base teórica, com quem se liga,
onde entra a escolha da pessoa e quais regras valem). O conteúdo de cada elo
está em `app/src/lib/fluxo.ts`; os números vêm de `parametro` e os textos
da Constituição entram pela `chave` de cada estratégia.

```
            Sistema: regras e limites em cada escala
  Áreas ──> Visão de longo prazo
    │  └──> Plano do ciclo ──> Projetos
    │         │  ▲                │
    ▼         ▼  ┆ revisão        ▼
  Hábitos   Plano semanal <──── Tarefas <── Captura
    │         │  ▲                              │
    └──────>  Plano do dia                      ▼
              │  ▲                            Notas
              ▼  ┆
            Sessões de foco
```

- O plano desce de escala (ciclo → semana → dia → sessão); a revisão sobe
  (fim do dia, sexta, fim do ciclo), com o assistente.
- A única coisa existe no ciclo e no dia; a semana herda a do ciclo.
- Projetos ficam entre o objetivo do ciclo e as tarefas (o P do PARA).

## Fase 1 (feita)

Migração `20261119000012_visao_e_ciclo_guiado.sql`:

- `area.visao` (com `visao_em`): a visão de longo prazo mora na área; a
  tela Plano monta a visão inteira a partir delas.
- `ciclo.unica_coisa`, `ciclo.horas_livres`, `ciclo.planejado_em`.
- `objetivo.por_que`, `objetivo.pronto_quando`, `objetivo.obstaculos`: o
  objetivo em três fases (definir, planejar, executar), que é a leitura do
  hub para a Inteligência Pragmática.
- Parâmetros `horas_nivel_leve|moderado|intenso` (1, 3, 5 h por semana).
- `conferir_ciclo(p_ciclo)`: cada regra do Sistema vira uma linha (valor,
  limite, ok). A carga dos objetivos é comparada com `horas_livres ×
  margem_capacidade`.

Tela Plano: ciclo sem plano abre o plano guiado em seis passos (capacidade,
áreas com visão e modo, única coisa, objetivos, hábitos, conferência).
Planejado, mostra o resumo e "Rever o plano". Hoje mostra a única coisa do
ciclo acima da do dia.

## Ajustes de 20/11/2026

- A visão de longo prazo vem antes do ciclo: é o Norte, escrito por área, e
  fica no alto do Plano (recolhível), não dentro de um passo do ciclo.
- Passo 1 do ciclo é a semana base (`semana_base_bloco`, migração
  `20261120000013_semana_base.sql`): blocos que se repetem por dia da semana,
  com área opcional. Os blocos "para o ciclo" somam a capacidade, e um
  gatilho mantém `ciclo.horas_livres` igual a essa soma. Um ciclo novo
  copia a semana base do anterior (`copiar_semana_base`). Na fase 3, os
  blocos do dia saem daqui.
- Passo Áreas: o modo de cada área e, para as que não estão em foco, o
  padrão mínimo do ciclo (a baseline). A visão aparece só para leitura.
- Passo Hábitos: revisão completa (criar, editar, mudar o peso, guardar e
  voltar). Guardar é desativar sem perder o histórico.
- O ciclo pode ser interrompido (encerra hoje e guarda) ou excluído (apaga
  ciclo, objetivos e semana base; projetos e tarefas ficam sem objetivo).
- Os objetivos ficam salvos para a conferência e para o plano semanal, que
  vai buscá-los na fase 2.

## Fase 2: o plano semanal (20/11/2026)

Migração `20261120000014_quadro_da_semana.sql`: `tarefa.semana` (domingo),
`tarefa.objetivo_id` e `tarefa.em_andamento`, parâmetro `fazendo_max` (3).
`arrumar_tarefa` passa a tirar o objetivo do projeto, a semana do dia e a
limitar Fazendo. `v_tarefa` ganha `semana`, `objetivo_id`, `objetivo` e
`em_andamento`.

O Plano tem duas abas, Ciclo e Semana (abre na Semana quando o ciclo está
planejado). A Semana (`app/src/telas/Semana.tsx`) navega entre semanas e
mostra, no alto, os objetivos do ciclo e a única coisa (aberto quando a
semana ainda está vazia), com "+ tarefa" por objetivo. Depois vêm a
intenção e a revisão de sexta e o quadro:

- Backlog: tarefas abertas sem semana ou que ficaram de semana anterior.
- A fazer / Fazendo: abertas na semana; Fazendo é `em_andamento`.
- Feito: feitas na semana.

Criar direto na coluna, arrastar entre colunas (computador), tocar para
editar, marcar o dia (vai para os espaços de Hoje), ligar a objetivo,
projeto ou área, e excluir. No celular, uma coluna por vez.

## Próximas fases

2. ~~Plano semanal com quadro~~ (feito em 20/11/2026, ver abaixo). Falta
   comparar a carga da semana com a capacidade.
3. Blocos de tempo no dia, dentro do hub, e sessões ligadas a uma tarefa ou
   bloco, com o que será entregue.
4. Revisões amarradas: fim do dia, sexta e fim do ciclo, com o assistente.

