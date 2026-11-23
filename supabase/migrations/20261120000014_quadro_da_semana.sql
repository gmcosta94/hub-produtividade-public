-- Fase 2 do fluxo ajustado: o plano semanal como quadro.
--   Backlog  = tarefas abertas sem semana, ou que ficaram de uma semana anterior
--   A fazer  = abertas na semana
--   Fazendo  = abertas na semana com em_andamento (no máximo fazendo_max)
--   Feito    = feitas na semana
-- A tarefa pode servir a um objetivo do ciclo direto (sem projeto) ou pelo
-- projeto. Marcar o dia leva a tarefa para a semana desse dia e para Hoje.

alter table public.tarefa
  add column semana        date,
  add column objetivo_id   bigint references public.objetivo (id) on delete set null,
  add column em_andamento  boolean not null default false,
  add constraint tarefa_semana_comeca_no_domingo check (semana is null or extract(dow from semana) = 0);

create index tarefa_por_semana on public.tarefa (semana) where semana is not null;

insert into public.parametro (chave, valor, unidade, descricao) values
  ('fazendo_max', 3, 'tarefas', 'Máximo de tarefas em Fazendo ao mesmo tempo')
on conflict (chave) do nothing;

create or replace function public.arrumar_tarefa()
returns trigger
language plpgsql
as $$
declare
  v_max    int;
  v_no_dia int;
begin
  new.titulo := trim(new.titulo);
  if new.titulo = '' then
    raise exception 'A tarefa precisa de um título.';
  end if;

  -- O projeto dá a área e, se a tarefa não disser, o objetivo.
  if new.projeto_id is not null then
    select area_id, coalesce(new.objetivo_id, objetivo_id)
      into new.area_id, new.objetivo_id
      from public.projeto where id = new.projeto_id;
  elsif new.objetivo_id is not null then
    select area_id into new.area_id from public.objetivo where id = new.objetivo_id;
  end if;

  if new.estado = 'feita' then
    if tg_op = 'INSERT' or old.estado <> 'feita' then
      new.feita_em := now();
    end if;
  else
    new.feita_em := null;
  end if;

  -- O dia manda na semana: a tarefa do dia é da semana desse dia.
  if new.dia is not null then
    new.semana := public.inicio_da_semana(new.dia);
  end if;

  -- Tarefa com dia ou semana já foi decidida: sai da entrada.
  if (new.dia is not null or new.semana is not null) and new.estado = 'entrada' then
    new.estado := 'aberta';
  end if;

  -- Só tarefa aberta e com semana pode estar em andamento.
  if new.estado <> 'aberta' or new.semana is null then
    new.em_andamento := false;
  end if;

  if new.em_andamento and (tg_op = 'INSERT' or not old.em_andamento) then
    select valor::int into v_max from public.parametro where chave = 'fazendo_max';
    if v_max is not null
       and (select count(*) from public.tarefa
             where em_andamento and estado = 'aberta' and id is distinct from new.id) >= v_max then
      raise exception 'Já há % tarefas em Fazendo. Termine ou devolva uma antes.', v_max;
    end if;
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

-- A view ganha a semana, o objetivo e o andamento (colunas no fim).
create or replace view public.v_tarefa
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
  t.criado_em,
  t.semana,
  t.objetivo_id,
  o.titulo as objetivo,
  t.em_andamento
from public.tarefa t
left join public.area a on a.id = t.area_id
left join public.projeto p on p.id = t.projeto_id
left join public.objetivo o on o.id = t.objetivo_id;

revoke execute on all functions in schema public from public, anon;
