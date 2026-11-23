-- Base: funções utilitárias e controle de quem acessa.

-- Mantém atualizado_em em qualquer tabela que tenha a coluna.
create function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- A data de hoje no fuso do usuário. Todo registro tem uma data própria,
-- separada de criado_em, porque o dia de ontem costuma ser marcado hoje cedo.
create function public.hoje()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- A semana vai de domingo a sábado. Esta é a única definição de semana do
-- sistema: não usar date_trunc('week', ...), que começa na segunda.
create function public.inicio_da_semana(d date)
returns date
language sql
immutable
as $$
  select d - extract(dow from d)::int;   -- dow: domingo = 0
$$;

-- Quem pode entrar. O hub tem um usuário só; a tabela existe para que
-- ninguém mais veja nada, mesmo que crie uma conta.
create table public.membro (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  criado_em  timestamptz not null default now()
);

-- Usada pelas políticas de acesso.
-- security definer: consulta membro sem depender das políticas da própria tabela.
create function public.eh_membro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from membro where user_id = auth.uid());
$$;

-- Controle de acesso por linha. Regra única: quem está em membro lê e escreve
-- tudo; quem não está (inclusive visitante sem login) não vê nada.
-- Toda tabela nova chama esta função na própria migration.
create function public.aplicar_acesso_padrao(tabela regclass)
returns void
language plpgsql
as $$
begin
  execute format('alter table %s enable row level security', tabela);

  execute format('revoke all on %s from anon', tabela);
  execute format('grant select, insert, update, delete on %s to authenticated', tabela);

  execute format('drop policy if exists membro_acessa on %s', tabela);
  execute format(
    'create policy membro_acessa on %s for all to authenticated
       using (public.eh_membro()) with check (public.eh_membro())',
    tabela);

  if exists (
    select 1 from pg_attribute
    where attrelid = tabela and attname = 'atualizado_em' and not attisdropped
  ) then
    execute format('drop trigger if exists tocar_atualizado_em on %s', tabela);
    execute format(
      'create trigger tocar_atualizado_em before update on %s
         for each row execute function public.tocar_atualizado_em()',
      tabela);
  end if;
end;
$$;

select public.aplicar_acesso_padrao('public.membro');

-- membro é exceção: ninguém altera pelo app, só pelo painel do banco.
drop policy membro_acessa on public.membro;
create policy membro_le on public.membro for select to authenticated
  using (public.eh_membro());
revoke insert, update, delete on public.membro from authenticated;

-- Por padrão o Postgres deixa qualquer papel executar funções novas.
-- Visitante sem login não executa nada de public.
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

grant execute on function public.eh_membro()            to authenticated;
grant execute on function public.hoje()                 to authenticated;
grant execute on function public.inicio_da_semana(date) to authenticated;

-- Só migrations (dono do banco) chamam esta.
revoke execute on function public.aplicar_acesso_padrao(regclass) from authenticated;
