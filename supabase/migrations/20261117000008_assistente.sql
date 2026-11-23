-- O assistente, nível 1: a revisão da semana (docs/05-assistente.md).
--   revisao  -> o que o assistente leu e respondeu
--   proposta -> o que ele sugeriu; só muda o hub quando a pessoa aceita
-- O assistente só escreve nestas duas tabelas. Aceitar uma proposta aplica a
-- mudança com o login da pessoa, passando pelos mesmos limites do banco.

create table public.revisao (
  id              bigint generated always as identity primary key,
  semana          date not null,          -- o domingo da semana revista
  leitura         text not null,
  observacoes     jsonb not null default '[]',
  contexto        jsonb not null,         -- o retrato que foi enviado ao modelo
  modelo          text not null,
  tokens_entrada  int,
  tokens_saida    int,
  tokens_cache    int,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint revisao_semana_comeca_no_domingo check (extract(dow from semana) = 0)
);

create index revisao_por_semana on public.revisao (semana, criado_em desc);

create table public.proposta (
  id                bigint generated always as identity primary key,
  revisao_id        bigint not null references public.revisao (id) on delete cascade,
  tipo              text not null check (tipo in (
                      'peso_do_habito',     -- valor: essencial | base | livre
                      'meta_do_habito',     -- valor: 1 a 7, ou vazio para sem meta
                      'nivel_do_objetivo',  -- valor: leve | moderado | intenso
                      'estado_do_projeto',  -- valor: ativo | pausado | concluido
                      'modo_da_area',       -- valor: foco | manutencao | pausa
                      'livre',              -- sugestão em texto; aceitar só registra
                      'para_o_ciclo')),     -- ideia guardada para a revisão do ciclo
  alvo_id           bigint,
  valor             text,
  texto             text not null,
  motivo            text,
  estado            text not null default 'pendente' check (estado in ('pendente', 'aceita', 'recusada')),
  motivo_da_recusa  text,
  decidida_em       timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create index proposta_pendente on public.proposta (estado) where estado = 'pendente';

select public.aplicar_acesso_padrao('public.revisao');
select public.aplicar_acesso_padrao('public.proposta');

-- Tudo o que o assistente precisa para revisar uma semana, num documento só.
--   constituicao -> vai para o prompt de sistema (estável, em cache)
--   dados        -> vai para a mensagem (muda a cada pedido)
create function public.contexto_do_assistente(p_semana date default null)
returns jsonb
language sql
stable
as $$
  with s as (
    select public.inicio_da_semana(coalesce(p_semana, public.hoje())) as ini
  )
  select jsonb_build_object(
    'semana', (select ini from s),
    'revisoes_hoje', (
      select count(*) from public.revisao r
      where (r.criado_em at time zone 'America/Sao_Paulo')::date = public.hoje()),
    'constituicao', (
      select coalesce(jsonb_agg(jsonb_build_object('titulo', e.titulo, 'corpo', e.corpo)
                                order by e.ordem, e.id), '[]'::jsonb)
      from public.estrategia e
      join public.area a on a.id = e.area_id
      where a.tipo = 'sistema' and e.ativa and coalesce(e.corpo, '') <> ''),
    'dados', jsonb_build_object(
      'hoje', public.hoje(),
      'semana_revista', (select public.revisao_da_semana(ini) from s),
      'catalogo', jsonb_build_object(
        'areas', (
          select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'modo', a.modo,
                                              'padrao_minimo', a.padrao_minimo) order by a.ordem)
          from public.area a where a.tipo = 'vida' and a.ativa),
        'habitos', (
          select jsonb_agg(jsonb_build_object('id', h.id, 'nome', h.nome, 'area', a.nome,
                                              'peso', h.prioridade, 'meta_dias', h.meta_dias,
                                              'versao_minima', h.versao_minima) order by a.ordem, h.ordem)
          from public.habito h join public.area a on a.id = h.area_id where h.ativo),
        'objetivos_ativos', (
          select jsonb_agg(jsonb_build_object('id', o.id, 'titulo', o.titulo, 'area', a.nome,
                                              'nivel', o.nivel, 'minimo', o.minimo) order by o.id)
          from public.objetivo o
          join public.area a on a.id = o.area_id
          join public.v_ciclo_atual c on c.id = o.ciclo_id
          where o.estado = 'ativo'),
        'projetos', (
          select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'area', p.area,
                                              'estado', p.estado, 'tarefas_abertas', p.tarefas_abertas)
                           order by p.id)
          from public.v_projeto p where p.estado <> 'concluido')),
      'revisoes_anteriores', (
        select coalesce(jsonb_agg(jsonb_build_object('semana', r.semana, 'leitura', r.leitura,
                                                     'observacoes', r.observacoes) order by r.criado_em desc), '[]'::jsonb)
        from (select * from public.revisao r, s where r.semana < s.ini
              order by r.criado_em desc limit 4) r),
      'propostas_anteriores', (
        select coalesce(jsonb_agg(jsonb_build_object('texto', p.texto, 'estado', p.estado,
                                                     'motivo_da_recusa', p.motivo_da_recusa)
                                  order by p.criado_em desc), '[]'::jsonb)
        from (select p.* from public.proposta p order by p.criado_em desc limit 20) p)
    )
  );
$$;

-- Aceitar ou recusar uma proposta. Aceitar aplica a mudança com o login de
-- quem decide; os gatilhos de limite continuam valendo.
create function public.decidir_proposta(p_id bigint, p_aceitar boolean, p_motivo text default null)
returns void
language plpgsql
as $$
declare
  p public.proposta;
  v_linhas int := 1;
begin
  select * into p from public.proposta where id = p_id for update;
  if not found then
    raise exception 'Proposta não encontrada.';
  end if;
  if p.estado <> 'pendente' then
    raise exception 'Esta proposta já foi decidida.';
  end if;

  if not p_aceitar then
    update public.proposta
       set estado = 'recusada', motivo_da_recusa = nullif(trim(p_motivo), ''), decidida_em = now()
     where id = p_id;
    return;
  end if;

  case p.tipo
    when 'peso_do_habito' then
      if p.valor not in ('essencial', 'base', 'livre') then
        raise exception 'Peso inválido na proposta.';
      end if;
      update public.habito set prioridade = p.valor where id = p.alvo_id and ativo;
      get diagnostics v_linhas = row_count;
    when 'meta_do_habito' then
      if coalesce(p.valor, '') !~ '^[1-7]?$' then
        raise exception 'Meta inválida na proposta.';
      end if;
      update public.habito set meta_dias = nullif(p.valor, '')::smallint where id = p.alvo_id and ativo;
      get diagnostics v_linhas = row_count;
    when 'nivel_do_objetivo' then
      if p.valor not in ('leve', 'moderado', 'intenso') then
        raise exception 'Nível inválido na proposta.';
      end if;
      update public.objetivo set nivel = p.valor where id = p.alvo_id and estado = 'ativo';
      get diagnostics v_linhas = row_count;
    when 'estado_do_projeto' then
      if p.valor not in ('ativo', 'pausado', 'concluido') then
        raise exception 'Estado inválido na proposta.';
      end if;
      update public.projeto set estado = p.valor where id = p.alvo_id;
      get diagnostics v_linhas = row_count;
    when 'modo_da_area' then
      if p.valor not in ('foco', 'manutencao', 'pausa') then
        raise exception 'Modo inválido na proposta.';
      end if;
      update public.area
         set modo = p.valor, rever_em = case when p.valor = 'pausa' then rever_em end
       where id = p.alvo_id and tipo = 'vida';
      get diagnostics v_linhas = row_count;
    else
      null;  -- livre e para_o_ciclo: aceitar só registra
  end case;

  if v_linhas = 0 then
    raise exception 'O item desta proposta não existe mais ou já mudou.';
  end if;

  update public.proposta set estado = 'aceita', decidida_em = now() where id = p_id;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.contexto_do_assistente(date)           to authenticated;
grant execute on function public.decidir_proposta(bigint, boolean, text) to authenticated;
