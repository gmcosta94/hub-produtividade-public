-- Sessões de foco e de estudo: views de leitura e as funções que o app usa.

-- Uma sessão, com o nome da área e duas respostas prontas:
--   em_andamento -> o cronômetro ainda está correndo
--   profunda     -> sessão de foco que atingiu a duração mínima da Constituição
create view public.v_sessao
with (security_invoker = true) as
select
  r.id,
  r.tipo,
  r.data,
  public.inicio_da_semana(r.data) as semana,
  r.inicio,
  r.duracao_min,
  r.titulo,
  r.resultado,
  r.area_id,
  a.nome as area,
  r.criado_em,
  r.duracao_min is null as em_andamento,
  coalesce(
    r.tipo = 'foco'
    and r.duracao_min >= (select valor from public.parametro where chave = 'foco_duracao_minima_min'),
    false) as profunda
from public.registro r
left join public.area a on a.id = r.area_id;

-- Minutos por dia e tipo (só sessões encerradas).
create view public.v_foco_dia
with (security_invoker = true) as
select
  s.data,
  s.tipo,
  sum(s.duracao_min)::int as minutos,
  count(*)::int           as sessoes
from public.v_sessao s
where not s.em_andamento
group by s.data, s.tipo;

-- Minutos por semana e tipo. minutos_profundos conta só as sessões de foco
-- que atingiram a duração mínima.
create view public.v_foco_semana
with (security_invoker = true) as
select
  s.semana,
  s.tipo,
  sum(s.duracao_min)::int                                       as minutos,
  count(*)::int                                                 as sessoes,
  coalesce(sum(s.duracao_min) filter (where s.profunda), 0)::int as minutos_profundos
from public.v_sessao s
where not s.em_andamento
group by s.semana, s.tipo;

revoke all on public.v_sessao, public.v_foco_dia, public.v_foco_semana from anon;
grant select on public.v_sessao, public.v_foco_dia, public.v_foco_semana to authenticated;

-- Começa uma sessão com cronômetro. Só pode haver uma em andamento.
create function public.iniciar_sessao(p_tipo text, p_titulo text, p_area_id bigint default null)
returns bigint
language plpgsql
as $$
declare
  v_id bigint;
begin
  if exists (select 1 from public.registro where duracao_min is null) then
    raise exception 'Já existe uma sessão em andamento.';
  end if;

  insert into public.registro (tipo, data, inicio, titulo, area_id, estrategia_id)
  values (
    p_tipo, public.hoje(), now(), nullif(trim(p_titulo), ''), p_area_id,
    (select id from public.estrategia where chave = 'sessao_de_foco'))
  returning id into v_id;
  return v_id;
end;
$$;

-- Encerra a sessão em andamento. Sem p_duracao_min, usa o tempo do cronômetro;
-- com ele, vale o número informado (para descontar uma pausa, por exemplo).
create function public.encerrar_sessao(
  p_id          bigint,
  p_resultado   text default null,
  p_duracao_min int  default null
)
returns void
language plpgsql
as $$
begin
  update public.registro
     set duracao_min = coalesce(
           p_duracao_min,
           greatest(1, round(extract(epoch from (now() - inicio)) / 60)::int)),
         resultado = nullif(trim(p_resultado), '')
   where id = p_id and duracao_min is null;
  if not found then
    raise exception 'A sessão % não está em andamento.', p_id;
  end if;
end;
$$;

-- Lançamento manual: o equivalente a anotar as horas no caderno.
create function public.lancar_sessao(
  p_tipo        text,
  p_data        date,
  p_duracao_min int,
  p_titulo      text   default null,
  p_area_id     bigint default null
)
returns bigint
language plpgsql
as $$
declare
  v_id bigint;
begin
  if p_data > public.hoje() then
    raise exception 'Não dá para lançar uma sessão num dia que ainda não chegou.';
  end if;

  insert into public.registro (tipo, data, duracao_min, titulo, area_id)
  values (p_tipo, p_data, p_duracao_min, nullif(trim(p_titulo), ''), p_area_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.iniciar_sessao(text, text, bigint)            to authenticated;
grant execute on function public.encerrar_sessao(bigint, text, int)            to authenticated;
grant execute on function public.lancar_sessao(text, date, int, text, bigint)  to authenticated;
