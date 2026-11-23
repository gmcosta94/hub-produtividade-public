-- Hábitos: o que conta para a semana, e as funções que o app usa para marcar.

-- Um registro de hábito com a resposta para "este dia conta para a semana?".
-- É a única definição dessa regra; o app não a reimplementa.
--   dispensado            -> não conta (e sai da conta da semana)
--   minimo                -> conta
--   sim ou não            -> conta
--   quantidade com limite -> conta se o valor respeitou o limite
--   quantidade sem limite -> conta se houve algum valor
create view public.v_habito_registro
with (security_invoker = true) as
select
  r.id,
  r.habito_id,
  r.data,
  public.inicio_da_semana(r.data) as semana,
  r.estado,
  r.valor,
  r.observacao,
  case
    when r.estado = 'dispensado'        then false
    when r.estado = 'minimo'            then true
    when h.tipo = 'sim_nao'             then true
    when h.meta_valor is null           then coalesce(r.valor, 0) > 0
    when h.comparacao = 'pelo_menos'    then coalesce(r.valor, 0) >= h.meta_valor
    else                                     coalesce(r.valor, 0) <= h.meta_valor
  end as conta
from public.habito_registro r
join public.habito h on h.id = r.habito_id;

-- A semana de cada hábito. Só existe linha para semana com algum registro.
create view public.v_habito_semana
with (security_invoker = true) as
select
  v.habito_id,
  v.semana,
  count(*) filter (where v.conta)                    as dias_que_contam,
  count(*) filter (where v.estado = 'minimo')        as dias_no_minimo,
  count(*) filter (where v.estado = 'dispensado')    as dias_dispensados,
  sum(v.valor) filter (where v.estado <> 'dispensado') as soma,
  h.meta_dias,
  -- A meta encolhe quando sobram menos dias do que ela pede.
  least(h.meta_dias, 7 - count(*) filter (where v.estado = 'dispensado'))::smallint as meta_ajustada
from public.v_habito_registro v
join public.habito h on h.id = v.habito_id
group by v.habito_id, v.semana, h.meta_dias;

revoke all on public.v_habito_registro, public.v_habito_semana from anon;
grant select on public.v_habito_registro, public.v_habito_semana to authenticated;

-- Marca, corrige ou limpa o registro de um hábito num dia.
-- p_estado nulo limpa o dia (volta a ser "sem registro").
create function public.marcar_habito(
  p_habito_id  bigint,
  p_data       date,
  p_estado     text,
  p_valor      numeric default null,
  p_observacao text default null
)
returns void
language plpgsql
as $$
declare
  v_tipo text;
begin
  select tipo into v_tipo from public.habito where id = p_habito_id;
  if v_tipo is null then
    raise exception 'Hábito % não existe.', p_habito_id;
  end if;
  if p_data > public.hoje() then
    raise exception 'Não dá para marcar um dia que ainda não chegou.';
  end if;

  if p_estado is null then
    delete from public.habito_registro where habito_id = p_habito_id and data = p_data;
    return;
  end if;

  if v_tipo = 'sim_nao' then
    p_valor := null;
  elsif p_estado <> 'dispensado' and p_valor is null then
    raise exception 'Hábito de quantidade precisa de um número.';
  end if;

  insert into public.habito_registro (habito_id, data, estado, valor, observacao)
  values (p_habito_id, p_data, p_estado, p_valor, p_observacao)
  on conflict (habito_id, data) do update
    set estado     = excluded.estado,
        valor      = excluded.valor,
        observacao = coalesce(excluded.observacao, public.habito_registro.observacao);
end;
$$;

-- Registra ou limpa o valor de uma métrica num dia. p_valor nulo limpa.
create function public.marcar_metrica(p_metrica_id bigint, p_data date, p_valor numeric)
returns void
language plpgsql
as $$
begin
  if p_data > public.hoje() then
    raise exception 'Não dá para registrar um dia que ainda não chegou.';
  end if;

  if p_valor is null then
    delete from public.metrica_registro where metrica_id = p_metrica_id and data = p_data;
    return;
  end if;

  insert into public.metrica_registro (metrica_id, data, valor)
  values (p_metrica_id, p_data, p_valor)
  on conflict (metrica_id, data) do update set valor = excluded.valor;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.marcar_habito(bigint, date, text, numeric, text) to authenticated;
grant execute on function public.marcar_metrica(bigint, date, numeric)            to authenticated;
