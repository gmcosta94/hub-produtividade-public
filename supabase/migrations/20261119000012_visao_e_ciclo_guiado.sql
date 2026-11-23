-- Fase 1 do fluxo ajustado: a visão de longo prazo mora na área, o ciclo
-- ganha a única coisa e a capacidade, e o objetivo segue as três fases da
-- Inteligência Pragmática (definir, planejar, executar).
--
--   área (visão, modo) -> ciclo (única coisa, capacidade) -> objetivo
--   objetivo: definir  = titulo, por_que, pronto_quando
--             planejar = projetos, obstaculos ("se X, faço Y"), nivel
--             executar = minimo (a semana ruim), sessões, revisão de sexta

-- ── Visão de longo prazo, uma por área ──────────────────────────────────
alter table public.area
  add column visao     text,
  add column visao_em  timestamptz;

create function public.carimbar_visao()
returns trigger
language plpgsql
as $$
begin
  new.visao := nullif(trim(new.visao), '');
  if new.visao is distinct from old.visao then
    new.visao_em := now();
  end if;
  return new;
end;
$$;

create trigger area_carimbar_visao
  before update of visao on public.area
  for each row execute function public.carimbar_visao();

-- ── Ciclo: a única coisa e as horas livres da semana ────────────────────
alter table public.ciclo
  add column unica_coisa   text,
  add column horas_livres  numeric check (horas_livres is null or horas_livres between 0 and 100),
  add column planejado_em  timestamptz;

-- ── Objetivo nas três fases ─────────────────────────────────────────────
alter table public.objetivo
  add column por_que        text,
  add column pronto_quando  text,
  add column obstaculos     text;

-- Horas por semana que cada nível pede (o piso da faixa). A soma dos
-- objetivos ativos é comparada com as horas livres vezes a margem.
insert into public.parametro (chave, valor, unidade, descricao) values
  ('horas_nivel_leve',     1, 'h/semana', 'Horas por semana de um objetivo leve'),
  ('horas_nivel_moderado', 3, 'h/semana', 'Horas por semana de um objetivo moderado'),
  ('horas_nivel_intenso',  5, 'h/semana', 'Horas por semana de um objetivo intenso')
on conflict (chave) do nothing;

-- As views que usam c.* e o painel da área passam a mostrar as colunas novas.
create or replace view public.v_ciclo_atual
with (security_invoker = true) as
select c.*
from public.ciclo c
where c.encerrado_em is null
  and public.hoje() between c.inicio and c.fim
order by c.inicio desc
limit 1;

create or replace view public.v_area_painel
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
    where o.area_id = a.id and o.estado = 'ativo')                          as objetivos,
  (select count(*) from public.habito h
    where h.area_id = a.id and h.ativo and h.prioridade = 'base')           as habitos_de_base,
  (select count(*) from public.habito h
     join public.v_habito_semana w
       on w.habito_id = h.id and w.semana = public.inicio_da_semana(public.hoje())
    where h.area_id = a.id and h.ativo and h.prioridade = 'base'
      and h.meta_dias is not null and w.dias_que_contam >= w.meta_ajustada) as habitos_de_base_cumpridos,
  a.visao,
  a.visao_em
from public.area a
where a.ativa and a.tipo = 'vida';

-- ── Conferência do ciclo ────────────────────────────────────────────────
-- Cada regra do Sistema vira uma linha: o valor de agora, o limite e se
-- está dentro. Os gatilhos já recusam o que passa do limite; esta função
-- mostra o quadro inteiro antes de o ciclo começar.
create function public.conferir_ciclo(p_ciclo bigint)
returns jsonb
language sql
stable
as $$
  with
  par as (select jsonb_object_agg(chave, valor) as p from public.parametro),
  c as (select * from public.ciclo where id = p_ciclo),
  obj as (select * from public.objetivo where ciclo_id = p_ciclo and estado = 'ativo'),
  carga as (
    select coalesce(sum(case o.nivel
             when 'leve'     then (par.p->>'horas_nivel_leve')::numeric
             when 'moderado' then (par.p->>'horas_nivel_moderado')::numeric
             else                 (par.p->>'horas_nivel_intenso')::numeric end), 0) as horas
    from obj o, par),
  linhas as (
    select 1 as ordem, 'unica_coisa' as chave, 'A única coisa do ciclo' as titulo,
           null::numeric as valor, null::numeric as limite,
           (select coalesce(unica_coisa, '') <> '' from c) as ok,
           case when (select coalesce(unica_coisa, '') <> '' from c) then 'Definida.'
                else 'Falta escrever a única coisa do ciclo.' end as texto
    union all
    select 2, 'areas_em_foco', 'Áreas em foco',
           (select count(*) from public.area where tipo = 'vida' and ativa and modo = 'foco'),
           (par.p->>'areas_em_foco_max')::numeric,
           (select count(*) from public.area where tipo = 'vida' and ativa and modo = 'foco')
             between 1 and (par.p->>'areas_em_foco_max')::numeric,
           null
    from par
    union all
    select 3, 'objetivos_por_area', 'Objetivos por área (o maior)',
           coalesce((select max(n) from (select count(*) n from obj group by area_id) x), 0),
           (par.p->>'objetivos_por_area_max')::numeric,
           coalesce((select max(n) from (select count(*) n from obj group by area_id) x), 0)
             <= (par.p->>'objetivos_por_area_max')::numeric,
           null
    from par
    union all
    select 4, 'objetivos_fora_do_foco', 'Objetivos em áreas fora do foco',
           (select count(*) from obj o join public.area a on a.id = o.area_id where a.modo <> 'foco'),
           0,
           (select count(*) from obj o join public.area a on a.id = o.area_id where a.modo <> 'foco') = 0,
           'Área em manutenção pede hábito de base, não objetivo.'
    union all
    select 5, 'objetivos_completos', 'Objetivos sem alguma das fases',
           (select count(*) from obj
             where coalesce(por_que, '') = '' or coalesce(pronto_quando, '') = '' or coalesce(minimo, '') = ''),
           0,
           (select count(*) from obj
             where coalesce(por_que, '') = '' or coalesce(pronto_quando, '') = '' or coalesce(minimo, '') = '') = 0,
           'Cada objetivo pede o porquê, como saber que acabou e o mínimo da semana ruim.'
    union all
    select 6, 'carga', 'Horas por semana dos objetivos',
           (select horas from carga),
           round((select horas_livres from c) * (par.p->>'margem_capacidade')::numeric, 1),
           (select horas_livres from c) is not null
             and (select horas from carga) <= (select horas_livres from c) * (par.p->>'margem_capacidade')::numeric,
           case when (select horas_livres from c) is null then 'Falta dizer quantas horas livres a semana tem.' end
    from par
    union all
    select 7, 'habitos_essenciais', 'Hábitos essenciais',
           (select count(*) from public.habito where ativo and prioridade = 'essencial'),
           (par.p->>'habitos_essenciais_max')::numeric,
           (select count(*) from public.habito where ativo and prioridade = 'essencial')
             <= (par.p->>'habitos_essenciais_max')::numeric,
           null
    from par
    union all
    select 8, 'projetos_ativos', 'Projetos ativos',
           (select count(*) from public.projeto where estado = 'ativo'),
           (par.p->>'projetos_ativos_max')::numeric,
           (select count(*) from public.projeto where estado = 'ativo')
             <= (par.p->>'projetos_ativos_max')::numeric,
           null
    from par
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'chave', chave, 'titulo', titulo, 'valor', valor, 'limite', limite,
           'ok', coalesce(ok, false), 'texto', texto) order by ordem), '[]'::jsonb)
  from linhas
  where exists (select 1 from c);
$$;

-- A revisão da semana leva a única coisa e as fases de cada objetivo.
create or replace function public.revisao_da_semana(p_semana date default null)
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
        'habitos_de_base', habitos_de_base, 'habitos_de_base_cumpridos', habitos_de_base_cumpridos,
        'projetos_ativos', projetos_ativos, 'tarefas_abertas', tarefas_abertas,
        'minutos_de_foco_e_estudo', minutos_na_semana) order by ordem)
      from public.v_area_painel),
    'ciclo', (
      select jsonb_build_object(
        'nome', c.nome, 'inicio', c.inicio, 'fim', c.fim, 'intencao', c.intencao,
        'unica_coisa', c.unica_coisa, 'horas_livres', c.horas_livres,
        'objetivos', (
          select jsonb_agg(jsonb_build_object(
            'area', a.nome, 'titulo', o.titulo, 'nivel', o.nivel, 'minimo', o.minimo, 'estado', o.estado,
            'por_que', o.por_que, 'pronto_quando', o.pronto_quando, 'obstaculos', o.obstaculos))
          from public.objetivo o join public.area a on a.id = o.area_id
          where o.ciclo_id = c.id))
      from public.v_ciclo_atual c),
    'plano_da_semana', (
      select jsonb_build_object('intencao', w.intencao, 'revisao', w.revisao)
      from public.semana w, s where w.inicio = s.ini),
    'dias', (
      select jsonb_agg(jsonb_build_object(
        'data', d.data, 'tamanho', d.tamanho, 'destaque', d.destaque,
        'destaque_feito', d.destaque_feito,
        'ritual_de_inicio', d.inicio_em is not null,
        'ritual_de_fim', d.encerrado_em is not null) order by d.data)
      from public.dia d, s where d.data between s.ini and s.ini + 6),
    'habitos', (
      select jsonb_agg(jsonb_build_object(
        'habito', h.nome, 'area', a.nome, 'peso', h.prioridade, 'meta_dias', h.meta_dias,
        'dias_que_contam', coalesce(w.dias_que_contam, 0),
        'dias_no_minimo', coalesce(w.dias_no_minimo, 0),
        'dias_dispensados', coalesce(w.dias_dispensados, 0),
        'soma', w.soma, 'unidade', h.unidade)
        order by array_position(array['essencial', 'base', 'livre'], h.prioridade), a.ordem, h.ordem)
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

revoke execute on all functions in schema public from public, anon;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.revisao_da_semana(date) to authenticated;
grant execute on function public.conferir_ciclo(bigint)  to authenticated;
