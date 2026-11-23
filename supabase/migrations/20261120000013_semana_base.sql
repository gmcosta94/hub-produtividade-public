-- A semana base do ciclo: os blocos que se repetem toda semana (trabalho,
-- rotina, família, academia...). Os blocos marcados "para o ciclo" são o
-- tempo reservado aos objetivos; a soma deles é a capacidade da semana
-- (ciclo.horas_livres). Na fase 3, os blocos do dia saem daqui.

create table public.semana_base_bloco (
  id             bigint generated always as identity primary key,
  ciclo_id       bigint not null references public.ciclo (id) on delete cascade,
  dia            smallint not null check (dia between 0 and 6),   -- 0 = domingo
  inicio         time not null,
  fim            time not null,
  titulo         text not null,
  area_id        bigint references public.area (id) on delete set null,
  para_o_ciclo   boolean not null default false,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint semana_base_bloco_horario check (fim > inicio)
);

create index semana_base_bloco_por_ciclo on public.semana_base_bloco (ciclo_id, dia, inicio);

select public.aplicar_acesso_padrao('public.semana_base_bloco');

create function public.arrumar_bloco_da_semana_base()
returns trigger
language plpgsql
as $$
begin
  new.titulo := trim(new.titulo);
  if new.titulo = '' then
    raise exception 'O bloco precisa de um nome.';
  end if;
  if exists (
    select 1 from public.semana_base_bloco b
    where b.ciclo_id = new.ciclo_id and b.dia = new.dia and b.id is distinct from new.id
      and b.inicio < new.fim and new.inicio < b.fim
  ) then
    raise exception 'Este horário já tem um bloco nesse dia.';
  end if;
  return new;
end;
$$;

create trigger arrumar_bloco
  before insert or update on public.semana_base_bloco
  for each row execute function public.arrumar_bloco_da_semana_base();

-- A capacidade acompanha os blocos: quando o ciclo tem semana base, as horas
-- livres são a soma dos blocos reservados ao ciclo.
create function public.recalcular_horas_livres()
returns trigger
language plpgsql
as $$
declare
  v_ciclo bigint := coalesce(new.ciclo_id, old.ciclo_id);
begin
  update public.ciclo c
     set horas_livres = (
       select round(coalesce(sum(extract(epoch from (b.fim - b.inicio)) / 3600)
                               filter (where b.para_o_ciclo), 0)::numeric, 2)
       from public.semana_base_bloco b where b.ciclo_id = v_ciclo)
   where c.id = v_ciclo;
  if tg_op = 'UPDATE' and old.ciclo_id <> new.ciclo_id then
    update public.ciclo c
       set horas_livres = (
         select round(coalesce(sum(extract(epoch from (b.fim - b.inicio)) / 3600)
                                 filter (where b.para_o_ciclo), 0)::numeric, 2)
         from public.semana_base_bloco b where b.ciclo_id = old.ciclo_id)
     where c.id = old.ciclo_id;
  end if;
  return null;
end;
$$;

create trigger recalcular_horas_livres
  after insert or update or delete on public.semana_base_bloco
  for each row execute function public.recalcular_horas_livres();

-- Um ciclo novo começa com a semana base do anterior: copia os blocos do
-- ciclo mais recente que tenha semana base, se o ciclo ainda não tem nenhuma.
create function public.copiar_semana_base(p_ciclo bigint)
returns int
language plpgsql
as $$
declare
  v_origem bigint;
  v_linhas int;
begin
  if exists (select 1 from public.semana_base_bloco where ciclo_id = p_ciclo) then
    return 0;
  end if;
  select b.ciclo_id into v_origem
  from public.semana_base_bloco b
  join public.ciclo c on c.id = b.ciclo_id
  where b.ciclo_id <> p_ciclo
  order by c.inicio desc, c.id desc
  limit 1;
  if v_origem is null then
    return 0;
  end if;
  insert into public.semana_base_bloco (ciclo_id, dia, inicio, fim, titulo, area_id, para_o_ciclo)
  select p_ciclo, dia, inicio, fim, titulo, area_id, para_o_ciclo
  from public.semana_base_bloco where ciclo_id = v_origem;
  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.copiar_semana_base(bigint) to authenticated;
