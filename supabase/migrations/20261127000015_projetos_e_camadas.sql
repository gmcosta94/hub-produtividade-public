-- Projetos e Tarefas, e hábitos em três camadas.
--
-- Projetos ganham um quadro: Algum dia (algum_dia ou pausado) · Ativos ·
-- Concluídos. O limite de ativos vale por frente: projetos pessoais (sem
-- cliente) até projetos_ativos_max; cada cliente do trabalho até
-- projetos_por_cliente_max, porque clientes são independentes entre si.
--
-- Hábitos: os pesos continuam essencial, base e livre no banco; na tela
-- viram Em construção, Padrão mínimo e Acompanhamento.

alter table public.projeto
  add column cliente text,
  drop constraint projeto_estado_check,
  add constraint projeto_estado_check check (estado in ('algum_dia', 'ativo', 'pausado', 'concluido'));

insert into public.parametro (chave, valor, unidade, descricao) values
  ('projetos_por_cliente_max', 2, 'projetos', 'Máximo de projetos ativos por cliente do trabalho')
on conflict (chave) do nothing;

update public.parametro set descricao = 'Máximo de projetos pessoais ativos (sem cliente)'
 where chave = 'projetos_ativos_max';
update public.parametro set descricao = 'Máximo de hábitos em construção ao mesmo tempo'
 where chave = 'habitos_essenciais_max';

create or replace function public.conferir_projetos_ativos()
returns trigger
language plpgsql
as $$
declare
  v_max int;
begin
  new.cliente := nullif(trim(new.cliente), '');
  if new.estado = 'ativo'
     and (tg_op = 'INSERT' or old.estado <> 'ativo' or old.cliente is distinct from new.cliente) then
    if new.cliente is null then
      select valor::int into v_max from public.parametro where chave = 'projetos_ativos_max';
      if v_max is not null
         and (select count(*) from public.projeto
               where estado = 'ativo' and cliente is null and id is distinct from new.id) >= v_max then
        raise exception 'Você já tem % projetos pessoais ativos. Pause ou conclua um antes de abrir outro.', v_max;
      end if;
    else
      select valor::int into v_max from public.parametro where chave = 'projetos_por_cliente_max';
      if v_max is not null
         and (select count(*) from public.projeto
               where estado = 'ativo' and lower(cliente) = lower(new.cliente) and id is distinct from new.id) >= v_max then
        raise exception 'O cliente % já tem % projetos ativos. Pause ou conclua um antes de abrir outro.', new.cliente, v_max;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger projeto_limite_de_ativos on public.projeto;
create trigger projeto_limite_de_ativos
  before insert or update of estado, cliente on public.projeto
  for each row execute function public.conferir_projetos_ativos();

create or replace function public.conferir_habitos_essenciais()
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
      raise exception 'No máximo % hábitos em construção ao mesmo tempo. Gradue ou guarde um antes.', v_max;
    end if;
  end if;
  return new;
end;
$$;

-- O projeto na tela: cliente e quantas tarefas tem na semana atual (colunas no fim).
create or replace view public.v_projeto
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
  p.criado_em,
  p.cliente,
  (select count(*) from public.tarefa t
    where t.projeto_id = p.id and t.estado = 'aberta'
      and t.semana = public.inicio_da_semana(public.hoje()))        as tarefas_na_semana,
  p.atualizado_em
from public.projeto p
join public.area a on a.id = p.area_id
left join public.objetivo o on o.id = p.objetivo_id;

-- A tarefa mostra o cliente do projeto (coluna no fim).
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
  t.em_andamento,
  p.cliente
from public.tarefa t
left join public.area a on a.id = t.area_id
left join public.projeto p on p.id = t.projeto_id
left join public.objetivo o on o.id = t.objetivo_id;

-- A conferência do ciclo conta só os projetos pessoais e fala em hábitos em construção.
create or replace function public.conferir_ciclo(p_ciclo bigint)
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
    select 7, 'habitos_essenciais', 'Hábitos em construção',
           (select count(*) from public.habito where ativo and prioridade = 'essencial'),
           (par.p->>'habitos_essenciais_max')::numeric,
           (select count(*) from public.habito where ativo and prioridade = 'essencial')
             <= (par.p->>'habitos_essenciais_max')::numeric,
           null
    from par
    union all
    select 8, 'projetos_ativos', 'Projetos pessoais ativos',
           (select count(*) from public.projeto where estado = 'ativo' and cliente is null),
           (par.p->>'projetos_ativos_max')::numeric,
           (select count(*) from public.projeto where estado = 'ativo' and cliente is null)
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

revoke execute on all functions in schema public from public, anon;
grant execute on function public.conferir_ciclo(bigint) to authenticated;
