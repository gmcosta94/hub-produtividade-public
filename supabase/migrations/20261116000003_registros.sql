-- Registros do dia a dia: hábitos, métricas, sessões de foco e o dia.
--
-- Convenções (docs/02-modelo-de-dados.md):
--   * Ausência não é falha: dia sem linha é só um dia sem registro.
--   * O mínimo conta para a semana igual ao feito por inteiro.
--   * Meta é opcional.

create table public.habito (
  id              bigint generated always as identity primary key,
  area_id         bigint not null references public.area (id),
  estrategia_id   bigint references public.estrategia (id),
  nome            text not null unique,
  tipo            text not null check (tipo in ('sim_nao', 'quantidade')),
  unidade         text,                -- só quantidade: 'min', 'blocos', 'refeições'
  comparacao      text check (comparacao in ('pelo_menos', 'no_maximo')),
  -- Com meta_valor, o dia conta se o valor respeitou o limite.
  -- Sem meta_valor, o número é só registrado e somado na semana.
  meta_valor      numeric(10, 2),
  meta_dias       smallint check (meta_dias between 1 and 7),   -- nulo = sem meta
  versao_minima   text,
  momento         text not null default 'qualquer'
                  check (momento in ('manha', 'expediente', 'noite', 'qualquer')),
  dias_da_semana  smallint[],          -- 0 = domingo ... 6 = sábado; nulo = todos
  ordem           int not null default 0,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint habito_sim_nao_sem_numero
    check (tipo = 'quantidade' or (unidade is null and comparacao is null and meta_valor is null)),
  constraint habito_quantidade_tem_unidade
    check (tipo = 'sim_nao' or unidade is not null),
  constraint habito_limite_tem_comparacao
    check (meta_valor is null or comparacao is not null)
);

-- Uma linha por hábito e dia.
--   feito      -> marcado (em hábito de quantidade: valor registrado)
--   minimo     -> feito na versão mínima; conta para a semana
--   dispensado -> tira o dia da conta da semana (viagem, doença)
create table public.habito_registro (
  id             bigint generated always as identity primary key,
  habito_id      bigint not null references public.habito (id),
  data           date not null,
  estado         text not null default 'feito' check (estado in ('feito', 'minimo', 'dispensado')),
  valor          numeric(10, 2),       -- só hábito de quantidade
  observacao     text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (habito_id, data)
);

create index habito_registro_por_data on public.habito_registro (data);

-- Um número ao longo do tempo. Não tem meta nem estado.
create table public.metrica (
  id                  bigint generated always as identity primary key,
  area_id             bigint not null references public.area (id),
  nome                text not null unique,
  unidade             text not null,
  agregacao_semanal   text not null default 'ultimo'
                      check (agregacao_semanal in ('ultimo', 'soma', 'media')),
  -- Para medição sem dia fixo: passado este intervalo desde a última, a
  -- métrica aparece em Hoje com "última há N dias".
  intervalo_max_dias  smallint check (intervalo_max_dias > 0),
  momento             text not null default 'qualquer'
                      check (momento in ('manha', 'expediente', 'noite', 'qualquer')),
  ordem               int not null default 0,
  ativa               boolean not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create table public.metrica_registro (
  id             bigint generated always as identity primary key,
  metrica_id     bigint not null references public.metrica (id),
  data           date not null,
  valor          numeric(12, 3) not null,
  observacao     text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (metrica_id, data)
);

create index metrica_registro_por_data on public.metrica_registro (data);

-- Uma entrada datada. Na fase 1: sessões de foco e de estudo.
--   Com cronômetro: inicio preenchido; duracao_min nulo enquanto está em andamento.
--   Lançamento manual: só data, tipo e duracao_min (o equivalente ao caderno).
create table public.registro (
  id             bigint generated always as identity primary key,
  area_id        bigint references public.area (id),
  tipo           text not null check (tipo in ('foco', 'estudo')),
  data           date not null,
  inicio         timestamptz,
  duracao_min    int check (duracao_min > 0),
  titulo         text,                 -- o escopo da sessão
  resultado      text,                 -- a revisão ao final
  estrategia_id  bigint references public.estrategia (id),   -- o processo seguido
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint registro_tem_inicio_ou_duracao check (inicio is not null or duracao_min is not null)
);

create index registro_por_data on public.registro (data);

-- Só pode haver uma sessão em andamento.
create unique index registro_em_andamento on public.registro ((true)) where duracao_min is null;

-- Uma linha por data.
create table public.dia (
  id                bigint generated always as identity primary key,
  data              date not null unique,
  tamanho           text not null default 'normal' check (tamanho in ('minimo', 'normal', 'cheio')),
  destaque          text,
  destaque_area_id  bigint references public.area (id),
  destaque_feito    boolean not null default false,
  -- Quando os rituais de início e de fim de expediente foram concluídos.
  -- O estado do checklist não é guardado.
  inicio_em         timestamptz,
  encerrado_em      timestamptz,
  nota              text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

select public.aplicar_acesso_padrao('public.habito');
select public.aplicar_acesso_padrao('public.habito_registro');
select public.aplicar_acesso_padrao('public.metrica');
select public.aplicar_acesso_padrao('public.metrica_registro');
select public.aplicar_acesso_padrao('public.registro');
select public.aplicar_acesso_padrao('public.dia');
