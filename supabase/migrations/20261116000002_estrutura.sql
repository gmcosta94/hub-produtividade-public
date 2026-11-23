-- Estrutura: áreas, estratégias (com histórico de emendas) e parâmetros.

-- As áreas da vida e o módulo Sistema.
create table public.area (
  id             bigint generated always as identity primary key,
  nome           text not null unique,
  tipo           text not null default 'vida' check (tipo in ('vida', 'sistema')),
  -- Na fase 1 o modo é editado à mão. Na fase 4 passa a ser decidido por ciclo.
  modo           text default 'manutencao' check (modo in ('foco', 'manutencao', 'pausa')),
  padrao_minimo  text,                 -- o que significa "está ok" nesta área
  rever_em       date,                 -- só para área em pausa
  ordem          int not null default 0,
  ativa          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  -- Área de vida sempre tem modo; a área Sistema não tem.
  constraint area_modo_conforme_tipo check ((tipo = 'sistema') = (modo is null)),
  constraint area_rever_so_em_pausa  check (rever_em is null or modo = 'pausa')
);

-- Só existe uma área Sistema: é a Constituição.
create unique index area_sistema_unica on public.area ((true)) where tipo = 'sistema';

-- O que foi decidido, em texto (Markdown). As estratégias da área Sistema
-- formam a Constituição.
create table public.estrategia (
  id             bigint generated always as identity primary key,
  area_id        bigint not null references public.area (id),
  titulo         text not null,
  tipo           text not null check (tipo in ('pilar', 'processo', 'limite', 'plano', 'regra')),
  corpo          text not null default '',
  -- Deixa uma tela achar o processo que ela executa: 'sessao_de_foco',
  -- 'ritual_inicio', 'ritual_fim'.
  chave          text unique,
  ordem          int not null default 0,
  ativa          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (area_id, titulo)
);

-- Histórico de emendas: o texto anterior e o motivo da mudança.
create table public.estrategia_versao (
  id             bigint generated always as identity primary key,
  estrategia_id  bigint not null references public.estrategia (id) on delete cascade,
  corpo          text not null,
  motivo         text,
  criado_em      timestamptz not null default now()
);

create index estrategia_versao_por_estrategia
  on public.estrategia_versao (estrategia_id, criado_em desc);

-- Toda mudança de corpo guarda a versão anterior. Na Constituição, o motivo
-- é obrigatório. O primeiro preenchimento (corpo vazio) não conta como emenda.
create function public.guardar_versao_da_estrategia()
returns trigger
language plpgsql
as $$
declare
  v_motivo  text := nullif(trim(current_setting('hub.motivo_emenda', true)), '');
  v_sistema boolean;
begin
  if old.corpo = '' then
    return new;
  end if;

  select tipo = 'sistema' into v_sistema from public.area where id = new.area_id;
  if v_sistema and v_motivo is null then
    raise exception 'Emenda à Constituição precisa de motivo (use emendar_estrategia).';
  end if;

  insert into public.estrategia_versao (estrategia_id, corpo, motivo)
  values (old.id, old.corpo, v_motivo);
  return new;
end;
$$;

create trigger guardar_versao
  before update of corpo on public.estrategia
  for each row
  when (old.corpo is distinct from new.corpo)
  execute function public.guardar_versao_da_estrategia();

-- O caminho que o app usa para mudar o texto de uma estratégia.
create function public.emendar_estrategia(p_id bigint, p_corpo text, p_motivo text default null)
returns void
language plpgsql
as $$
begin
  perform set_config('hub.motivo_emenda', coalesce(p_motivo, ''), true);
  update public.estrategia set corpo = p_corpo where id = p_id;
  if not found then
    raise exception 'Estratégia % não existe.', p_id;
  end if;
  perform set_config('hub.motivo_emenda', '', true);
end;
$$;

-- Os limites numéricos da Constituição.
create table public.parametro (
  id             bigint generated always as identity primary key,
  chave          text not null unique,
  valor          numeric not null,
  unidade        text,
  descricao      text not null,
  estrategia_id  bigint references public.estrategia (id),   -- o texto que explica o limite
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

select public.aplicar_acesso_padrao('public.area');
select public.aplicar_acesso_padrao('public.estrategia');
select public.aplicar_acesso_padrao('public.estrategia_versao');
select public.aplicar_acesso_padrao('public.parametro');

-- O histórico não é editado: só o gatilho escreve nele.
revoke insert, update, delete on public.estrategia_versao from authenticated;
alter function public.guardar_versao_da_estrategia() security definer set search_path = public;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.emendar_estrategia(bigint, text, text) to authenticated;
