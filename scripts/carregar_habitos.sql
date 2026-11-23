-- Carrega hábitos e métricas de dados/conteudo/habitos.csv (fora do git).
-- Chamado por scripts/carregar_conteudo.sh, a partir da raiz do projeto.
--
-- Só insere o que ainda não existe (pelo nome). O que já está no banco não é
-- alterado: depois da primeira carga, quem manda é o cadastro do app.

create temp table carga (
  n                   serial,
  peca                text,
  nome                text,
  area                text,
  tipo                text,
  unidade             text,
  comparacao          text,
  meta_valor          numeric,
  meta_dias           smallint,
  versao_minima       text,
  momento             text,
  intervalo_max_dias  smallint,
  a_confirmar         text
);

\copy carga (peca, nome, area, tipo, unidade, comparacao, meta_valor, meta_dias, versao_minima, momento, intervalo_max_dias, a_confirmar) from 'dados/conteudo/habitos.csv' with (format csv, header true)

-- Para tudo se alguma linha aponta para uma área que não existe ou tem peça desconhecida.
do $$
declare
  v_erros text;
begin
  select string_agg(format('linha %s (%s): %s', c.n, c.nome,
           case when a.id is null then 'área "' || coalesce(c.area, '') || '" não existe'
                else 'peça "' || coalesce(c.peca, '') || '" desconhecida' end), E'\n')
    into v_erros
  from carga c
  left join public.area a on a.nome = c.area
  where a.id is null or c.peca not in ('habito', 'metrica');

  if v_erros is not null then
    raise exception E'habitos.csv com problema:\n%', v_erros;
  end if;
end;
$$;

-- Guardado antes das inserções, para o relatório do fim.
create temp table ja_existia as
select c.n
from carga c
where (c.peca = 'habito'  and exists (select 1 from public.habito h  where h.nome = c.nome))
   or (c.peca = 'metrica' and exists (select 1 from public.metrica m where m.nome = c.nome));

with novos as (
  insert into public.habito
    (area_id, nome, tipo, unidade, comparacao, meta_valor, meta_dias, versao_minima, momento, ordem)
  select a.id, c.nome, c.tipo, c.unidade,
         case when c.meta_valor is not null then c.comparacao end,
         c.meta_valor, c.meta_dias, c.versao_minima, coalesce(c.momento, 'qualquer'), c.n
  from carga c
  join public.area a on a.nome = c.area
  where c.peca = 'habito'
    and not exists (select 1 from public.habito h where h.nome = c.nome)
  order by c.n
  returning 1
)
select 'hábitos carregados: ' || count(*) from novos;

with novas as (
  insert into public.metrica (area_id, nome, unidade, intervalo_max_dias, momento, ordem)
  select a.id, c.nome, c.unidade, c.intervalo_max_dias, coalesce(c.momento, 'qualquer'), c.n
  from carga c
  join public.area a on a.nome = c.area
  where c.peca = 'metrica'
    and not exists (select 1 from public.metrica m where m.nome = c.nome)
  order by c.n
  returning 1
)
select 'métricas carregadas: ' || count(*) from novas;

select 'já existiam (não alterados): ' || count(*) from ja_existia;
