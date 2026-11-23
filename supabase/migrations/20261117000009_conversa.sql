-- O assistente, nível 2: a conversa (docs/05-assistente.md).
-- O modelo decide o que ler, por ferramentas de leitura que são estas funções.
-- A única escrita é registrar uma proposta, que só muda o hub quando aceita.

create table public.conversa (
  id             bigint generated always as identity primary key,
  titulo         text not null,
  -- As mensagens exatamente como foram trocadas com a API, para reenviar a
  -- cada turno. Só cresce: nada é editado nem removido.
  historico      jsonb not null default '[]',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- O que a tela mostra: a pergunta e a resposta em texto.
create table public.mensagem (
  id             bigint generated always as identity primary key,
  conversa_id    bigint not null references public.conversa (id) on delete cascade,
  papel          text not null check (papel in ('usuario', 'assistente')),
  texto          text not null,
  leituras       text[],              -- o que o assistente leu para responder
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index mensagem_por_conversa on public.mensagem (conversa_id, id);

select public.aplicar_acesso_padrao('public.conversa');
select public.aplicar_acesso_padrao('public.mensagem');

-- Proposta pode nascer de uma revisão ou de uma conversa.
alter table public.proposta alter column revisao_id drop not null;
alter table public.proposta add column conversa_id bigint references public.conversa (id) on delete cascade;
alter table public.proposta add constraint proposta_tem_origem check (revisao_id is not null or conversa_id is not null);

-- ── Leituras do assistente ──────────────────────────────────────────────
-- Todas com a permissão de quem conversa (security invoker, o padrão).

-- Os itens do hub com seus ids, para o assistente se referir a eles.
create function public.assistente_catalogo()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'hoje', public.hoje(),
    'areas', (
      select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'modo', a.modo) order by a.ordem)
      from public.area a where a.tipo = 'vida' and a.ativa),
    'habitos', (
      select jsonb_agg(jsonb_build_object('id', h.id, 'nome', h.nome, 'area', a.nome, 'peso', h.prioridade,
                                          'meta_dias', h.meta_dias) order by a.ordem, h.ordem)
      from public.habito h join public.area a on a.id = h.area_id where h.ativo),
    'objetivos_ativos', (
      select jsonb_agg(jsonb_build_object('id', o.id, 'titulo', o.titulo, 'area', a.nome, 'nivel', o.nivel) order by o.id)
      from public.objetivo o
      join public.area a on a.id = o.area_id
      join public.v_ciclo_atual c on c.id = o.ciclo_id
      where o.estado = 'ativo'),
    'projetos', (
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'area', p.area, 'estado', p.estado) order by p.id)
      from public.v_projeto p where p.estado <> 'concluido'),
    'textos_do_sistema', (
      select jsonb_agg(jsonb_build_object('chave', e.chave, 'titulo', e.titulo) order by e.ordem)
      from public.estrategia e join public.area a on a.id = e.area_id
      where a.tipo = 'sistema' and e.ativa)
  );
$$;

create function public.assistente_area(p_area_id bigint)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'area', to_jsonb(v) - 'ordem',
    'estrategias', (
      select jsonb_agg(jsonb_build_object('titulo', e.titulo, 'tipo', e.tipo, 'texto', e.corpo) order by e.ordem)
      from public.estrategia e where e.area_id = v.id and e.ativa),
    'habitos', (
      select jsonb_agg(jsonb_build_object('id', h.id, 'nome', h.nome, 'peso', h.prioridade, 'meta_dias', h.meta_dias,
                                          'versao_minima', h.versao_minima,
                                          'ultimas_4_semanas', (
                                            select jsonb_agg(jsonb_build_object('semana', w.semana,
                                              'dias_que_contam', w.dias_que_contam, 'soma', w.soma) order by w.semana desc)
                                            from public.v_habito_semana w
                                            where w.habito_id = h.id
                                              and w.semana >= public.inicio_da_semana(public.hoje()) - 21))
                       order by h.ordem)
      from public.habito h where h.area_id = v.id and h.ativo),
    'objetivos', (
      select jsonb_agg(jsonb_build_object('id', o.id, 'titulo', o.titulo, 'nivel', o.nivel, 'minimo', o.minimo,
                                          'estado', o.estado))
      from public.objetivo o join public.v_ciclo_atual c on c.id = o.ciclo_id
      where o.area_id = v.id),
    'projetos', (
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'estado', p.estado, 'resultado', p.resultado,
                                          'tarefas_abertas', p.tarefas_abertas, 'notas', p.notas))
      from public.v_projeto p where p.area_id = v.id and p.estado <> 'concluido'),
    'notas', (
      select jsonb_agg(jsonb_build_object('id', n.id, 'titulo', n.titulo))
      from public.v_nota n where n.area_id = v.id and not n.arquivada)
  )
  from public.v_area_painel v
  where v.id = p_area_id;
$$;

create function public.assistente_habito(p_habito_id bigint, p_dias int)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'habito', jsonb_build_object('id', h.id, 'nome', h.nome, 'tipo', h.tipo, 'unidade', h.unidade,
                                 'comparacao', h.comparacao, 'meta_valor', h.meta_valor, 'meta_dias', h.meta_dias,
                                 'peso', h.prioridade, 'versao_minima', h.versao_minima),
    'periodo', jsonb_build_object('de', public.hoje() - (least(greatest(p_dias, 1), 120) - 1), 'ate', public.hoje()),
    'registros', (
      select coalesce(jsonb_agg(jsonb_build_object('data', r.data, 'estado', r.estado, 'valor', r.valor,
                                                   'conta', r.conta, 'observacao', r.observacao) order by r.data), '[]'::jsonb)
      from public.v_habito_registro r
      where r.habito_id = h.id and r.data > public.hoje() - least(greatest(p_dias, 1), 120))
  )
  from public.habito h where h.id = p_habito_id;
$$;

create function public.assistente_foco(p_dias int)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'periodo', jsonb_build_object('de', public.hoje() - (least(greatest(p_dias, 1), 120) - 1), 'ate', public.hoje()),
    'por_semana', (
      select coalesce(jsonb_agg(to_jsonb(f) order by f.semana, f.tipo), '[]'::jsonb)
      from public.v_foco_semana f
      where f.semana >= public.inicio_da_semana(public.hoje() - least(greatest(p_dias, 1), 120))),
    'sessoes', (
      select coalesce(jsonb_agg(jsonb_build_object('data', s.data, 'tipo', s.tipo, 'minutos', s.duracao_min,
                                                   'area', s.area, 'escopo', s.titulo, 'revisao', s.resultado,
                                                   'profunda', s.profunda) order by s.data), '[]'::jsonb)
      from public.v_sessao s
      where not s.em_andamento and s.data > public.hoje() - least(greatest(p_dias, 1), 120))
  );
$$;

create function public.assistente_projeto(p_projeto_id bigint)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'projeto', to_jsonb(p),
    'tarefas', (
      select coalesce(jsonb_agg(jsonb_build_object('titulo', t.titulo, 'estado', t.estado, 'dia', t.dia,
                                                   'detalhe', t.detalhe) order by t.estado, t.criado_em), '[]'::jsonb)
      from public.v_tarefa t where t.projeto_id = p.id and t.estado <> 'descartada'),
    'notas', (
      select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'titulo', n.titulo, 'trecho', n.trecho)), '[]'::jsonb)
      from public.v_nota n where n.projeto_id = p.id and not n.arquivada)
  )
  from public.v_projeto p where p.id = p_projeto_id;
$$;

create function public.assistente_buscar_notas(p_termo text)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'titulo', n.titulo, 'categoria', v.categoria,
                                               'area', v.area, 'projeto', v.projeto, 'trecho', v.trecho)
                            order by n.atualizado_em desc), '[]'::jsonb)
  from (select * from public.nota n
        where nullif(trim(p_termo), '') is not null
          and (n.titulo ilike '%' || trim(p_termo) || '%' or n.corpo ilike '%' || trim(p_termo) || '%')
        order by n.atualizado_em desc limit 15) n
  join public.v_nota v on v.id = n.id;
$$;

create function public.assistente_nota(p_nota_id bigint)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('id', n.id, 'titulo', n.titulo, 'categoria', v.categoria, 'area', v.area,
                            'projeto', v.projeto, 'atualizada_em', n.atualizado_em, 'texto', n.corpo)
  from public.nota n join public.v_nota v on v.id = n.id
  where n.id = p_nota_id;
$$;

create function public.assistente_sistema(p_chave text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'titulo', e.titulo, 'tipo', e.tipo, 'texto', e.corpo,
    'emendas', (
      select coalesce(jsonb_agg(jsonb_build_object('quando', v.criado_em, 'motivo', v.motivo)
                                order by v.criado_em desc), '[]'::jsonb)
      from public.estrategia_versao v where v.estrategia_id = e.id))
  from public.estrategia e
  where e.ativa and (e.chave = p_chave or e.titulo ilike p_chave)
  order by e.chave = p_chave desc
  limit 1;
$$;

-- Perguntas feitas hoje, para o limite diário da conversa.
create function public.perguntas_de_hoje()
returns int
language sql
stable
as $$
  select count(*)::int from public.mensagem
  where papel = 'usuario' and (criado_em at time zone 'America/Sao_Paulo')::date = public.hoje();
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.assistente_catalogo()                to authenticated;
grant execute on function public.assistente_area(bigint)              to authenticated;
grant execute on function public.assistente_habito(bigint, int)       to authenticated;
grant execute on function public.assistente_foco(int)                 to authenticated;
grant execute on function public.assistente_projeto(bigint)           to authenticated;
grant execute on function public.assistente_buscar_notas(text)        to authenticated;
grant execute on function public.assistente_nota(bigint)              to authenticated;
grant execute on function public.assistente_sistema(text)             to authenticated;
grant execute on function public.perguntas_de_hoje()                  to authenticated;
