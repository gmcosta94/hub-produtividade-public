-- Integração dos módulos: plano multi-escala (ciclo, objetivo, semana),
-- projetos, tarefas e notas. É o corte mínimo de cada módulo. O que liga
-- um módulo ao outro é a área e o projeto:
--   área    -> hábitos, estratégias, objetivos do ciclo, projetos, tarefas, notas
--   projeto -> tarefas e notas (o P do PARA), e o objetivo do ciclo que ele serve

-- ── Plano ────────────────────────────────────────────────────────────────
create table public.ciclo (
  id             bigint generated always as identity primary key,
  nome           text not null,
  inicio         date not null,
  fim            date not null,
  intencao       text,
  encerrado_em   timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint ciclo_datas check (fim >= inicio)
);

-- O que uma área busca num ciclo. O nível diz o esforço (leve, moderado,
-- intenso) e o mínimo diz o que continua de pé numa semana ruim.
create table public.objetivo (
  id             bigint generated always as identity primary key,
  ciclo_id       bigint not null references public.ciclo (id) on delete cascade,
  area_id        bigint not null references public.area (id),
  titulo         text not null,
  nivel          text not null default 'leve' check (nivel in ('leve', 'moderado', 'intenso')),
  minimo         text,
  estado         text not null default 'ativo' check (estado in ('ativo', 'concluido', 'abandonado')),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- A semana no plano: a intenção escrita no começo e a revisão escrita no fim.
create table public.semana (
  id             bigint generated always as identity primary key,
  inicio         date not null unique,
  intencao       text,
  revisao        text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint semana_comeca_no_domingo check (extract(dow from inicio) = 0)
);

-- ── Projetos, tarefas e notas ────────────────────────────────────────────
create table public.projeto (
  id             bigint generated always as identity primary key,
  area_id        bigint not null references public.area (id),
  objetivo_id    bigint references public.objetivo (id) on delete set null,
  nome           text not null,
  resultado      text,                 -- como se sabe que acabou
  estado         text not null default 'ativo' check (estado in ('ativo', 'pausado', 'concluido')),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- entrada = capturada e ainda não decidida; aberta = decidida, a fazer.
create table public.tarefa (
  id             bigint generated always as identity primary key,
  titulo         text not null,
  detalhe        text,
  area_id        bigint references public.area (id),
  projeto_id     bigint references public.projeto (id) on delete set null,
  estado         text not null default 'entrada'
                 check (estado in ('entrada', 'aberta', 'feita', 'descartada')),
  dia            date,                 -- o dia em que ocupa um espaço
  feita_em       timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index tarefa_por_estado on public.tarefa (estado);
create index tarefa_por_dia on public.tarefa (dia) where dia is not null;

-- A categoria do PARA sai das ligações: com projeto é Projeto, só com área
-- é Área, sem nenhuma é Recurso, arquivada é Arquivo.
create table public.nota (
  id             bigint generated always as identity primary key,
  titulo         text not null,
  corpo          text not null default '',
  area_id        bigint references public.area (id),
  projeto_id     bigint references public.projeto (id) on delete set null,
  arquivada      boolean not null default false,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

select public.aplicar_acesso_padrao('public.ciclo');
select public.aplicar_acesso_padrao('public.objetivo');
select public.aplicar_acesso_padrao('public.semana');
select public.aplicar_acesso_padrao('public.projeto');
select public.aplicar_acesso_padrao('public.tarefa');
select public.aplicar_acesso_padrao('public.nota');

-- ── Limites da Constituição ──────────────────────────────────────────────
-- Áreas em foco ao mesmo tempo: parâmetro areas_em_foco_max.
create function public.conferir_areas_em_foco()
returns trigger
language plpgsql
as $$
declare
  v_max int;
begin
  if new.modo = 'foco' and (tg_op = 'INSERT' or old.modo is distinct from 'foco') then
    select valor::int into v_max from public.parametro where chave = 'areas_em_foco_max';
    if v_max is not null
       and (select count(*) from public.area where modo = 'foco' and id <> new.id) >= v_max then
      raise exception 'No máximo % áreas em foco ao mesmo tempo. Tire uma do foco antes.', v_max;
    end if;
  end if;
  return new;
end;
$$;

create trigger area_limite_de_foco
  before insert or update of modo on public.area
  for each row execute function public.conferir_areas_em_foco();

-- Tarefa: a área vem do projeto, feita_em acompanha o estado, e o dia
-- respeita os espaços do dia (parâmetro espacos_extras_dia).
create function public.arrumar_tarefa()
returns trigger
language plpgsql
as $$
declare
  v_max   int;
  v_no_dia int;
begin
  new.titulo := trim(new.titulo);
  if new.titulo = '' then
    raise exception 'A tarefa precisa de um título.';
  end if;

  if new.projeto_id is not null then
    select area_id into new.area_id from public.projeto where id = new.projeto_id;
  end if;

  if new.estado = 'feita' then
    if tg_op = 'INSERT' or old.estado <> 'feita' then
      new.feita_em := now();
    end if;
  else
    new.feita_em := null;
  end if;

  -- Tarefa com dia marcado já foi decidida: sai da entrada.
  if new.dia is not null and new.estado = 'entrada' then
    new.estado := 'aberta';
  end if;

  if new.dia is not null and new.estado = 'aberta'
     and (tg_op = 'INSERT' or old.dia is distinct from new.dia or old.estado <> 'aberta') then
    select valor::int into v_max from public.parametro where chave = 'espacos_extras_dia';
    select count(*) into v_no_dia
    from public.tarefa
    where dia = new.dia and estado in ('aberta', 'feita') and id is distinct from new.id;
    if v_max is not null and v_no_dia >= v_max then
      raise exception 'Este dia já tem % tarefas. Tire uma ou deixe esta para outro dia.', v_max;
    end if;
  end if;

  return new;
end;
$$;

create trigger tarefa_arrumar
  before insert or update on public.tarefa
  for each row execute function public.arrumar_tarefa();

-- Nota de projeto herda a área do projeto.
create function public.arrumar_nota()
returns trigger
language plpgsql
as $$
begin
  new.titulo := trim(new.titulo);
  if new.titulo = '' then
    raise exception 'A nota precisa de um título.';
  end if;
  if new.projeto_id is not null then
    select area_id into new.area_id from public.projeto where id = new.projeto_id;
  end if;
  return new;
end;
$$;

create trigger nota_arrumar
  before insert or update on public.nota
  for each row execute function public.arrumar_nota();

-- ── Views ────────────────────────────────────────────────────────────────
-- Nada fica atrasado: tarefa aberta cujo dia já passou volta a ficar sem dia.
create view public.v_tarefa
with (security_invoker = true) as
select
  t.id,
  t.titulo,
  t.detalhe,
  t.estado,
  t.area_id,
  a.nome as area,
  t.projeto_id,
  p.nome as projeto,
  case when t.estado = 'aberta' and t.dia < public.hoje() then null else t.dia end as dia,
  t.feita_em,
  t.criado_em
from public.tarefa t
left join public.area a on a.id = t.area_id
left join public.projeto p on p.id = t.projeto_id;

create view public.v_projeto
with (security_invoker = true) as
select
  p.id,
  p.nome,
  p.resultado,
  p.estado,
  p.area_id,
  a.nome as area,
  p.objetivo_id,
  o.titulo as objetivo,
  (select count(*) from public.tarefa t
    where t.projeto_id = p.id and t.estado in ('entrada', 'aberta')) as tarefas_abertas,
  (select count(*) from public.tarefa t
    where t.projeto_id = p.id and t.estado = 'feita')                as tarefas_feitas,
  (select count(*) from public.nota n
    where n.projeto_id = p.id and not n.arquivada)                   as notas,
  p.criado_em
from public.projeto p
join public.area a on a.id = p.area_id
left join public.objetivo o on o.id = p.objetivo_id;

create view public.v_nota
with (security_invoker = true) as
select
  n.id,
  n.titulo,
  n.area_id,
  a.nome as area,
  n.projeto_id,
  p.nome as projeto,
  n.arquivada,
  case
    when n.arquivada then 'arquivo'
    when n.projeto_id is not null then 'projeto'
    when n.area_id is not null then 'area'
    else 'recurso'
  end as categoria,
  left(n.corpo, 140) as trecho,
  n.atualizado_em
from public.nota n
left join public.area a on a.id = n.area_id
left join public.projeto p on p.id = n.projeto_id;

-- O ciclo em andamento hoje (o mais recente, se houver sobreposição).
create view public.v_ciclo_atual
with (security_invoker = true) as
select c.*
from public.ciclo c
where c.encerrado_em is null
  and public.hoje() between c.inicio and c.fim
order by c.inicio desc
limit 1;

-- Uma linha por área da vida, com o que cada módulo tem dela.
create view public.v_area_painel
with (security_invoker = true) as
select
  a.id,
  a.nome,
  a.modo,
  a.padrao_minimo,
  a.rever_em,
  a.ordem,
  (select count(*) from public.habito h where h.area_id = a.id and h.ativo) as habitos,
  (select count(*) from public.v_habito_registro r
     join public.habito h on h.id = r.habito_id
    where h.area_id = a.id and r.conta
      and r.semana = public.inicio_da_semana(public.hoje()))                as marcacoes_na_semana,
  (select count(*) from public.projeto p
    where p.area_id = a.id and p.estado = 'ativo')                          as projetos_ativos,
  (select count(*) from public.tarefa t
    where t.area_id = a.id and t.estado = 'aberta')                         as tarefas_abertas,
  (select count(*) from public.nota n
    where n.area_id = a.id and not n.arquivada)                             as notas,
  (select coalesce(sum(r.duracao_min), 0) from public.registro r
    where r.area_id = a.id and r.duracao_min is not null
      and public.inicio_da_semana(r.data) = public.inicio_da_semana(public.hoje())) as minutos_na_semana,
  (select string_agg(o.titulo, ' · ' order by o.id)
     from public.objetivo o
     join public.v_ciclo_atual c on c.id = o.ciclo_id
    where o.area_id = a.id and o.estado = 'ativo')                          as objetivos
from public.area a
where a.ativa and a.tipo = 'vida';

-- ── Para o assistente ────────────────────────────────────────────────────
-- A semana inteira num documento só: o que foi decidido (parâmetros, modos,
-- ciclo, intenção) ao lado do que foi feito (hábitos, foco, tarefas, dias).
create function public.revisao_da_semana(p_semana date default null)
returns jsonb
language sql
stable
as $$
  with s as (
    select public.inicio_da_semana(coalesce(p_semana, public.hoje())) as ini
  )
  select jsonb_build_object(
    'semana', (select jsonb_build_object('inicio', ini, 'fim', ini + 6) from s),
    'parametros', (select jsonb_object_agg(chave, valor) from public.parametro),
    'areas', (
      select jsonb_agg(jsonb_build_object(
        'area', nome, 'modo', modo, 'padrao_minimo', padrao_minimo, 'objetivos', objetivos,
        'habitos', habitos, 'marcacoes_na_semana', marcacoes_na_semana,
        'projetos_ativos', projetos_ativos, 'tarefas_abertas', tarefas_abertas,
        'minutos_de_foco_e_estudo', minutos_na_semana) order by ordem)
      from public.v_area_painel),
    'ciclo', (
      select jsonb_build_object(
        'nome', c.nome, 'inicio', c.inicio, 'fim', c.fim, 'intencao', c.intencao,
        'objetivos', (
          select jsonb_agg(jsonb_build_object(
            'area', a.nome, 'titulo', o.titulo, 'nivel', o.nivel, 'minimo', o.minimo, 'estado', o.estado))
          from public.objetivo o join public.area a on a.id = o.area_id
          where o.ciclo_id = c.id))
      from public.v_ciclo_atual c),
    'plano_da_semana', (
      select jsonb_build_object('intencao', w.intencao, 'revisao', w.revisao)
      from public.semana w, s where w.inicio = s.ini),
    'dias', (
      select jsonb_agg(jsonb_build_object(
        'data', d.data, 'tamanho', d.tamanho, 'destaque', d.destaque,
        'destaque_feito', d.destaque_feito) order by d.data)
      from public.dia d, s where d.data between s.ini and s.ini + 6),
    'habitos', (
      select jsonb_agg(jsonb_build_object(
        'habito', h.nome, 'area', a.nome, 'meta_dias', h.meta_dias,
        'dias_que_contam', coalesce(w.dias_que_contam, 0),
        'dias_no_minimo', coalesce(w.dias_no_minimo, 0),
        'dias_dispensados', coalesce(w.dias_dispensados, 0),
        'soma', w.soma, 'unidade', h.unidade) order by a.ordem, h.ordem)
      from public.habito h
      join public.area a on a.id = h.area_id
      cross join s
      left join public.v_habito_semana w on w.habito_id = h.id and w.semana = s.ini
      where h.ativo),
    'foco', (
      select jsonb_agg(jsonb_build_object(
        'tipo', f.tipo, 'minutos', f.minutos, 'sessoes', f.sessoes,
        'minutos_profundos', f.minutos_profundos))
      from public.v_foco_semana f, s where f.semana = s.ini),
    'tarefas', (
      select jsonb_build_object(
        'na_entrada', count(*) filter (where t.estado = 'entrada'),
        'abertas', count(*) filter (where t.estado = 'aberta'),
        'feitas_na_semana', coalesce(jsonb_agg(jsonb_build_object(
            'titulo', t.titulo, 'area', t.area, 'projeto', t.projeto)) filter (
          where t.estado = 'feita'
            and (t.feita_em at time zone 'America/Sao_Paulo')::date between s.ini and s.ini + 6), '[]'::jsonb))
      from public.v_tarefa t cross join s),
    'projetos_ativos', (
      select jsonb_agg(jsonb_build_object(
        'projeto', p.nome, 'area', p.area, 'objetivo', p.objetivo, 'resultado', p.resultado,
        'tarefas_abertas', p.tarefas_abertas, 'tarefas_feitas', p.tarefas_feitas, 'notas', p.notas))
      from public.v_projeto p where p.estado = 'ativo'),
    'notas_mexidas_na_semana', (
      select jsonb_agg(jsonb_build_object('titulo', n.titulo, 'categoria', n.categoria, 'area', n.area, 'projeto', n.projeto))
      from public.v_nota n, s
      where (n.atualizado_em at time zone 'America/Sao_Paulo')::date between s.ini and s.ini + 6),
    'emendas_na_semana', (
      select jsonb_agg(jsonb_build_object('texto', e.titulo, 'motivo', v.motivo, 'quando', v.criado_em))
      from public.estrategia_versao v join public.estrategia e on e.id = v.estrategia_id, s
      where (v.criado_em at time zone 'America/Sao_Paulo')::date between s.ini and s.ini + 6)
  );
$$;

revoke all on public.v_tarefa, public.v_projeto, public.v_nota, public.v_ciclo_atual, public.v_area_painel from anon;
grant select on public.v_tarefa, public.v_projeto, public.v_nota, public.v_ciclo_atual, public.v_area_painel to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.revisao_da_semana(date) to authenticated;
