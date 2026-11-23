-- Ajustes da tela de hábitos (17/11/2026):
--   1. Hábito de sim ou não ganha o "não fiz": fica registrado, não conta
--      para a semana e, ao contrário de "dispensado", não reduz a meta.
--      Dia sem registro continua sendo só um dia sem registro.
--   2. O formato do hábito (sim ou não / quantidade) pode mudar enquanto ele
--      não tem nenhum registro.

alter table public.habito_registro drop constraint habito_registro_estado_check;
alter table public.habito_registro
  add constraint habito_registro_estado_check check (estado in ('feito', 'minimo', 'nao', 'dispensado'));

create or replace view public.v_habito_registro
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
    when r.estado in ('dispensado', 'nao') then false
    when r.estado = 'minimo'            then true
    when h.tipo = 'sim_nao'             then true
    when h.meta_valor is null           then coalesce(r.valor, 0) > 0
    when h.comparacao = 'pelo_menos'    then coalesce(r.valor, 0) >= h.meta_valor
    else                                     coalesce(r.valor, 0) <= h.meta_valor
  end as conta
from public.habito_registro r
join public.habito h on h.id = r.habito_id;

create or replace view public.v_habito_semana
with (security_invoker = true) as
select
  v.habito_id,
  v.semana,
  count(*) filter (where v.conta)                    as dias_que_contam,
  count(*) filter (where v.estado = 'minimo')        as dias_no_minimo,
  count(*) filter (where v.estado = 'dispensado')    as dias_dispensados,
  sum(v.valor) filter (where v.estado <> 'dispensado') as soma,
  h.meta_dias,
  least(h.meta_dias, 7 - count(*) filter (where v.estado = 'dispensado'))::smallint as meta_ajustada,
  count(*) filter (where v.estado = 'nao')           as dias_nao
from public.v_habito_registro v
join public.habito h on h.id = v.habito_id
group by v.habito_id, v.semana, h.meta_dias;

create or replace function public.marcar_habito(
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
  elsif p_estado = 'nao' then
    raise exception 'Hábito de quantidade não tem "não fiz": registre o número.';
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

create function public.conferir_troca_de_formato()
returns trigger
language plpgsql
as $$
begin
  if new.tipo is distinct from old.tipo
     and exists (select 1 from public.habito_registro where habito_id = new.id) then
    raise exception 'O formato só muda enquanto o hábito não tem registros.';
  end if;
  return new;
end;
$$;

create trigger habito_troca_de_formato
  before update of tipo on public.habito
  for each row execute function public.conferir_troca_de_formato();

revoke execute on all functions in schema public from public, anon;
grant execute on function public.marcar_habito(bigint, date, text, numeric, text) to authenticated;
