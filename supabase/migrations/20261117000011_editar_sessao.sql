-- Corrigir uma sessão de foco ou de estudo já encerrada (histórico de foco).
create function public.editar_sessao(
  p_id          bigint,
  p_tipo        text,
  p_data        date,
  p_duracao_min int,
  p_titulo      text,
  p_resultado   text,
  p_area_id     bigint
)
returns void
language plpgsql
as $$
begin
  if p_data > public.hoje() then
    raise exception 'Não dá para lançar uma sessão num dia que ainda não chegou.';
  end if;
  if p_duracao_min is null or p_duracao_min <= 0 then
    raise exception 'A duração precisa ser maior que zero.';
  end if;

  update public.registro
     set tipo        = p_tipo,
         data        = p_data,
         duracao_min = p_duracao_min,
         titulo      = nullif(trim(p_titulo), ''),
         resultado   = nullif(trim(p_resultado), ''),
         area_id     = p_area_id
   where id = p_id and duracao_min is not null;
  if not found then
    raise exception 'Sessão não encontrada ou ainda em andamento.';
  end if;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.editar_sessao(bigint, text, date, int, text, text, bigint) to authenticated;
