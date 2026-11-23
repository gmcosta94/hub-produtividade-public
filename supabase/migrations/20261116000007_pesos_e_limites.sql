-- Sistema enxuto (decisões de 16/11/2026):
--   1. Os hábitos têm três pesos:
--        essencial -> beira o inegociável no ciclo (poucos, com limite)
--        base      -> sustenta o padrão mínimo de uma área que não está em foco
--        livre     -> registrado quando a pessoa quiser, sem cobrança
--   2. Limites novos: objetivos por área no ciclo, hábitos essenciais e
--      projetos ativos.

alter table public.habito
  add column prioridade text not null default 'livre'
  check (prioridade in ('essencial', 'base', 'livre'));

insert into public.parametro (chave, valor, unidade, descricao) values
  ('objetivos_por_area_max', 2, 'objetivos', 'Máximo de objetivos por área num ciclo'),
  ('habitos_essenciais_max', 3, 'hábitos',   'Máximo de hábitos essenciais ao mesmo tempo'),
  ('projetos_ativos_max',    3, 'projetos',  'Máximo de projetos pessoais ativos')
on conflict (chave) do nothing;

create function public.conferir_habitos_essenciais()
returns trigger
language plpgsql
as $$
declare
  v_max int;
begin
  if new.prioridade = 'essencial' and new.ativo then
    select valor::int into v_max from public.parametro where chave = 'habitos_essenciais_max';
    if v_max is not null
       and (select count(*) from public.habito
             where prioridade = 'essencial' and ativo and id is distinct from new.id) >= v_max then
      raise exception 'No máximo % hábitos essenciais ao mesmo tempo. Rebaixe um antes.', v_max;
    end if;
  end if;
  return new;
end;
$$;

create trigger habito_limite_de_essenciais
  before insert or update of prioridade, ativo on public.habito
  for each row execute function public.conferir_habitos_essenciais();

create function public.conferir_objetivos_da_area()
returns trigger
language plpgsql
as $$
declare
  v_max int;
begin
  if new.estado = 'ativo' then
    select valor::int into v_max from public.parametro where chave = 'objetivos_por_area_max';
    if v_max is not null
       and (select count(*) from public.objetivo
             where ciclo_id = new.ciclo_id and area_id = new.area_id
               and estado = 'ativo' and id is distinct from new.id) >= v_max then
      raise exception 'Esta área já tem % objetivos ativos neste ciclo. Conclua ou abandone um antes.', v_max;
    end if;
  end if;
  return new;
end;
$$;

create trigger objetivo_limite_por_area
  before insert or update of estado, area_id, ciclo_id on public.objetivo
  for each row execute function public.conferir_objetivos_da_area();

create function public.conferir_projetos_ativos()
returns trigger
language plpgsql
as $$
declare
  v_max int;
begin
  if new.estado = 'ativo' and (tg_op = 'INSERT' or old.estado <> 'ativo') then
    select valor::int into v_max from public.parametro where chave = 'projetos_ativos_max';
    if v_max is not null
       and (select count(*) from public.projeto
             where estado = 'ativo' and id is distinct from new.id) >= v_max then
      raise exception 'Você já tem % projetos ativos. Pause ou conclua um antes de abrir outro.', v_max;
    end if;
  end if;
  return new;
end;
$$;

create trigger projeto_limite_de_ativos
  before insert or update of estado on public.projeto
  for each row execute function public.conferir_projetos_ativos();

-- O painel da área passa a dizer como anda o padrão mínimo: quantos hábitos
-- de base a área tem e quantos já cumpriram a meta da semana.
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
      and h.meta_dias is not null and w.dias_que_contam >= w.meta_ajustada) as habitos_de_base_cumpridos
from public.area a
where a.ativa and a.tipo = 'vida';

-- A revisão para o assistente passa a levar o peso de cada hábito.
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
grant execute on function public.revisao_da_semana(date) to authenticated;
