import { useState, type DragEvent, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { corDaArea } from '../lib/areas'
import { Folha } from '../componentes/Folha'
import { hoje, inicioDaSemana } from '../lib/datas'
import { textoDoErro, useAreas, useConsulta, type Area, type Ir } from '../lib/dados'
import { FolhaDaTarefa, NavegarSemana, QuadroDaSemana, type PedidoDeTarefa, type Tarefa } from './Semana'
import { useObjetivosDoCiclo, type ObjetivoDoCiclo } from '../lib/objetivos'

type EstadoDoProjeto = 'algum_dia' | 'ativo' | 'pausado' | 'concluido'
type Projeto = {
  id: number
  nome: string
  resultado: string | null
  estado: EstadoDoProjeto
  area_id: number
  area: string
  objetivo_id: number | null
  objetivo: string | null
  cliente: string | null
  tarefas_abertas: number
  tarefas_feitas: number
  tarefas_na_semana: number
  notas: number
}
type ColunaDeProjeto = 'algum_dia' | 'ativo' | 'concluido'
type Parametro = { chave: string; valor: number }

const COLUNAS_DE_PROJETO: { id: ColunaDeProjeto; nome: string; ajuda: string }[] = [
  {
    id: 'algum_dia',
    nome: 'Algum dia',
    ajuda: 'Ideias e projetos que ainda não começaram, e os pausados. Sem limite.',
  },
  { id: 'ativo', nome: 'Ativos', ajuda: 'O compromisso de agora.' },
  { id: 'concluido', nome: 'Concluídos', ajuda: 'O arquivo.' },
]
const CAMPOS =
  'id, titulo, detalhe, estado, area_id, area, projeto_id, projeto, dia, semana, objetivo_id, objetivo, em_andamento, cliente'
const colunaDoProjeto = (p: Projeto): ColunaDeProjeto =>
  p.estado === 'ativo' ? 'ativo' : p.estado === 'concluido' ? 'concluido' : 'algum_dia'

// Projetos e Tarefas: a entrada para decidir, o quadro de projetos e o quadro
// da semana (o mesmo do Plano). Com projetoId, mostra a página do projeto.
export function Tarefas({ projetoId, ir }: { projetoId?: number; ir: Ir }) {
  const areas = useAreas()
  const ciclo = useConsulta<{ id: number } | null>(() => supabase.from('v_ciclo_atual').select('id').maybeSingle())
  const objetivos = useObjetivosDoCiclo(ciclo.dados?.id)
  const projetos = useConsulta<Projeto[]>(() => supabase.from('v_projeto').select('*').order('nome'))
  const [versao, setVersao] = useState(0)
  const mexeu = () => setVersao((v) => v + 1)

  if (projetoId !== undefined) {
    const projeto = (projetos.dados ?? []).find((p) => p.id === projetoId)
    if (!projeto) return <main>{projetos.carregou && <p className="vazio">Projeto não encontrado.</p>}</main>
    return (
      <main>
        <PaginaDoProjeto
          projeto={projeto}
          areas={areas}
          objetivos={objetivos.dados ?? []}
          ir={ir}
          aoMudar={projetos.recarregar}
        />
      </main>
    )
  }

  return (
    <main>
      <h1 className="titulo-tela">Projetos e Tarefas</h1>
      <Entrada
        areas={areas}
        objetivos={objetivos.dados ?? []}
        projetos={(projetos.dados ?? []).filter((x) => x.estado === 'ativo')}
        ir={ir}
        versao={versao}
        aoMudar={() => {
          projetos.recarregar()
          mexeu()
        }}
      />
      <QuadroDeProjetos
        projetos={projetos.dados ?? []}
        areas={areas}
        objetivos={objetivos.dados ?? []}
        ir={ir}
        aoMudar={() => {
          projetos.recarregar()
          mexeu()
        }}
      />
      <TarefasDaSemana
        objetivos={objetivos.dados ?? []}
        areas={areas}
        ir={ir}
        versao={versao}
        aoMudar={projetos.recarregar}
      />
    </main>
  )
}

// ── Entrada ─────────────────────────────────────────────────────────────────
// O que foi capturado e ainda não foi decidido. Cada item vira tarefa, projeto
// ou nota, é feito na hora (se leva menos de 2 minutos) ou é descartado.

function Entrada({
  areas,
  objetivos,
  projetos,
  ir,
  versao,
  aoMudar,
}: {
  areas: Area[]
  objetivos: ObjetivoDoCiclo[]
  projetos: Projeto[]
  ir: Ir
  versao: number
  aoMudar: () => void
}) {
  const itens = useConsulta<Tarefa[]>(
    () => supabase.from('v_tarefa').select(CAMPOS).eq('estado', 'entrada').order('criado_em'),
    [versao],
  )
  const [decidindo, setDecidindo] = useState<{ item: Tarefa; como: 'tarefa' | 'projeto' } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const lista = itens.dados ?? []
  const semana = inicioDaSemana(hoje())

  async function capturar(titulo: string) {
    const { error } = await supabase.from('tarefa').insert({ titulo })
    setErro(error ? textoDoErro(error, 'Não foi possível guardar.') : null)
    itens.recarregar()
    return !error
  }

  async function mudar(item: Tarefa, mudanca: Record<string, unknown>) {
    const { error } = await supabase.from('tarefa').update(mudanca).eq('id', item.id)
    setErro(error ? textoDoErro(error, 'Não foi possível decidir o item.') : null)
    itens.recarregar()
    aoMudar()
  }

  async function virarNota(item: Tarefa) {
    const { data, error } = await supabase
      .from('nota')
      .insert({ titulo: item.titulo, corpo: item.detalhe ?? '', area_id: item.area_id })
      .select('id')
      .single()
    if (error || !data) return setErro('Não foi possível criar a nota.')
    await supabase.from('tarefa').delete().eq('id', item.id)
    ir({ tela: 'notas', id: data.id })
  }

  return (
    <section className="bloco primeiro faixa-entrada">
      <h2 className="titulo-bloco">
        Entrada <small>{lista.length === 0 ? 'vazia' : lista.length}</small>
      </h2>
      <Captura rotulo="Capturar uma tarefa ou ideia" aoCriar={capturar} />
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {lista.length > 0 && (
        <ul className="lista itens-da-entrada">
          {lista.map((item) => (
            <li key={item.id}>
              <span className="item">
                <span>{item.titulo}</span>
                {item.detalhe && <small>{item.detalhe}</small>}
              </span>
              <span className="decisoes" role="group" aria-label={`Decidir: ${item.titulo}`}>
                <button type="button" className="chip-botao" onClick={() => setDecidindo({ item, como: 'tarefa' })}>
                  Tarefa
                </button>
                <button type="button" className="chip-botao" onClick={() => setDecidindo({ item, como: 'projeto' })}>
                  Projeto
                </button>
                <button type="button" className="chip-botao" onClick={() => virarNota(item)}>
                  Nota
                </button>
                <button
                  type="button"
                  className="chip-botao"
                  title="Leva menos de 2 minutos: faça agora"
                  onClick={() => mudar(item, { estado: 'feita', semana })}
                >
                  Feito
                </button>
                <button type="button" className="link" onClick={() => mudar(item, { estado: 'descartada' })}>
                  descartar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 0 && (
        <p className="ajuda">
          Decida cada item: vira tarefa, projeto ou nota; se leva menos de 2 minutos, faça e marque feito; se não serve,
          descarte.
        </p>
      )}

      {decidindo?.como === 'tarefa' && (
        <FolhaDaTarefa
          inicio={semana}
          tarefa={decidindo.item}
          colunaInicial="backlog"
          objetivoInicial={null}
          objetivos={objetivos}
          projetos={projetos}
          areas={areas}
          aoFechar={() => setDecidindo(null)}
          aoSalvar={() => {
            setDecidindo(null)
            itens.recarregar()
            aoMudar()
          }}
        />
      )}
      {decidindo?.como === 'projeto' && (
        <FolhaDoProjeto
          projeto={null}
          nomeInicial={decidindo.item.titulo}
          estadoInicial="algum_dia"
          areas={areas}
          objetivos={objetivos}
          aoFechar={() => setDecidindo(null)}
          aoSalvar={async () => {
            await supabase.from('tarefa').delete().eq('id', decidindo.item.id)
            setDecidindo(null)
            itens.recarregar()
            aoMudar()
          }}
        />
      )}
    </section>
  )
}

// ── Quadro de projetos ──────────────────────────────────────────────────────
// Algum dia · Ativos · Concluídos. O limite de ativos vale por frente: os
// pessoais juntos, e cada cliente do trabalho separado.

function QuadroDeProjetos({
  projetos,
  areas,
  objetivos,
  ir,
  aoMudar,
}: {
  projetos: Projeto[]
  areas: Area[]
  objetivos: ObjetivoDoCiclo[]
  ir: Ir
  aoMudar: () => void
}) {
  const parametros = useConsulta<Parametro[]>(() =>
    supabase.from('parametro').select('chave, valor').in('chave', ['projetos_ativos_max', 'projetos_por_cliente_max']),
  )
  const [arrastando, setArrastando] = useState<number | null>(null)
  const [novo, setNovo] = useState<ColunaDeProjeto | null>(null)
  const [verConcluidos, setVerConcluidos] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const p = (chave: string, padrao: number) =>
    Number((parametros.dados ?? []).find((x) => x.chave === chave)?.valor ?? padrao)
  const porColuna = (c: ColunaDeProjeto) => projetos.filter((x) => colunaDoProjeto(x) === c)
  const ativos = porColuna('ativo')
  const frentes = new Map<string, number>()
  for (const x of ativos) frentes.set(x.cliente ?? '', (frentes.get(x.cliente ?? '') ?? 0) + 1)

  async function mover(projeto: Projeto, para: ColunaDeProjeto) {
    if (colunaDoProjeto(projeto) === para) return
    const { error } = await supabase.from('projeto').update({ estado: para }).eq('id', projeto.id)
    setErro(error ? textoDoErro(error, 'Não foi possível mover o projeto.') : null)
    aoMudar()
  }

  function soltar(e: DragEvent, para: ColunaDeProjeto) {
    e.preventDefault()
    const projeto = projetos.find((x) => x.id === arrastando)
    setArrastando(null)
    if (projeto) mover(projeto, para)
  }

  return (
    <section className="bloco faixa-projetos">
      <h2 className="titulo-bloco">Projetos</h2>
      <p className="ajuda">
        Ativos:{' '}
        {[
          `pessoais ${frentes.get('') ?? 0} de ${p('projetos_ativos_max', 3)}`,
          ...[...frentes.entries()]
            .filter(([c]) => c !== '')
            .map(([c, n]) => `${c} ${n} de ${p('projetos_por_cliente_max', 2)}`),
        ].join(' · ')}
        . Projeto ativo sem tarefa na semana fica marcado: falta a próxima ação.
      </p>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <div className="quadro-de-projetos">
        {COLUNAS_DE_PROJETO.map((c) => {
          const lista = porColuna(c.id)
          const recolhida = c.id === 'concluido' && !verConcluidos
          return (
            <section
              key={c.id}
              className={`coluna-da-semana coluna-de-projetos${arrastando !== null ? ' recebe' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => soltar(e, c.id)}
            >
              <h3 className="cabeca-da-coluna">
                {c.nome}
                <small>{lista.length}</small>
              </h3>
              {recolhida ? (
                lista.length > 0 && (
                  <button type="button" className="link" onClick={() => setVerConcluidos(true)}>
                    Ver os {lista.length} concluídos
                  </button>
                )
              ) : (
                <ul className="cartoes-da-coluna">
                  {lista.map((x) => (
                    <li key={x.id}>
                      <button
                        type="button"
                        className={`cartao-da-tarefa cartao-de-projeto${x.estado === 'concluido' ? ' feita' : ''}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(x.id))
                          e.dataTransfer.effectAllowed = 'move'
                          setArrastando(x.id)
                        }}
                        onDragEnd={() => setArrastando(null)}
                        onClick={() => ir({ tela: 'tarefas', id: x.id })}
                      >
                        <span className="titulo-da-tarefa">
                          {x.cliente && <small className="chip neutro">{x.cliente}</small>}
                          {x.nome}
                        </span>
                        <small>
                          <i className="ponto-da-area" style={{ background: corDaArea(x.area) }} />
                          {[x.area, x.objetivo, x.estado === 'pausado' && 'pausado'].filter(Boolean).join(' · ')}
                        </small>
                        {x.estado === 'ativo' && (
                          <small className={x.tarefas_na_semana === 0 ? 'sem-proxima-acao' : undefined}>
                            {x.tarefas_na_semana === 0
                              ? 'sem próxima ação nesta semana'
                              : `${x.tarefas_na_semana} ${x.tarefas_na_semana === 1 ? 'tarefa' : 'tarefas'} na semana`}
                          </small>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {c.id !== 'concluido' && (
                <button type="button" className="nova-na-coluna botao-fantasma" onClick={() => setNovo(c.id)}>
                  + novo projeto
                </button>
              )}
            </section>
          )
        })}
      </div>

      {novo && (
        <FolhaDoProjeto
          projeto={null}
          estadoInicial={novo}
          areas={areas}
          objetivos={objetivos}
          aoFechar={() => setNovo(null)}
          aoSalvar={() => {
            setNovo(null)
            aoMudar()
          }}
        />
      )}
    </section>
  )
}

// ── Tarefas da semana ───────────────────────────────────────────────────────

function TarefasDaSemana({
  objetivos,
  areas,
  ir,
  versao,
  aoMudar,
}: {
  objetivos: ObjetivoDoCiclo[]
  areas: Area[]
  ir: Ir
  versao: number
  aoMudar: () => void
}) {
  const atual = inicioDaSemana(hoje())
  const [inicio, setInicio] = useState(atual)
  return (
    <section className="bloco faixa-tarefas">
      <NavegarSemana inicio={inicio} atual={atual} aoMudar={setInicio} />
      <p className="ajuda">
        O mesmo quadro do Plano: o que muda aqui muda lá.{' '}
        <button type="button" className="link" onClick={() => ir({ tela: 'plano' })}>
          Planejar a semana no Plano
        </button>
      </p>
      <QuadroDaSemana
        inicio={inicio}
        objetivos={objetivos}
        areas={areas}
        ir={ir}
        versao={versao}
        avisoDaEntrada={false}
        aoMudar={aoMudar}
      />
    </section>
  )
}

// ── Página do projeto ───────────────────────────────────────────────────────

function PaginaDoProjeto({
  projeto,
  areas,
  objetivos,
  ir,
  aoMudar,
}: {
  projeto: Projeto
  areas: Area[]
  objetivos: ObjetivoDoCiclo[]
  ir: Ir
  aoMudar: () => void
}) {
  const tarefas = useConsulta<Tarefa[]>(
    () =>
      supabase
        .from('v_tarefa')
        .select(CAMPOS)
        .eq('projeto_id', projeto.id)
        .in('estado', ['entrada', 'aberta', 'feita'])
        .order('criado_em'),
    [projeto.id],
  )
  const notas = useConsulta<{ id: number; titulo: string }[]>(
    () =>
      supabase
        .from('v_nota')
        .select('id, titulo')
        .eq('projeto_id', projeto.id)
        .eq('arquivada', false)
        .order('atualizado_em', { ascending: false }),
    [projeto.id],
  )
  const [editando, setEditando] = useState<Tarefa | PedidoDeTarefa | null>(null)
  const [editandoProjeto, setEditandoProjeto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const semana = inicioDaSemana(hoje())
  const abertas = (tarefas.dados ?? []).filter((t) => t.estado !== 'feita')
  const feitas = (tarefas.dados ?? []).filter((t) => t.estado === 'feita')
  const coluna = colunaDoProjeto(projeto)

  async function mudarEstado(estado: EstadoDoProjeto) {
    const { error } = await supabase.from('projeto').update({ estado }).eq('id', projeto.id)
    setErro(error ? textoDoErro(error, 'Não foi possível mudar o projeto.') : null)
    aoMudar()
  }

  async function criarTarefa(titulo: string) {
    const { error } = await supabase.from('tarefa').insert({ titulo, projeto_id: projeto.id, estado: 'aberta' })
    setErro(error ? textoDoErro(error, 'Não foi possível criar a tarefa.') : null)
    tarefas.recarregar()
    aoMudar()
    return !error
  }

  async function marcar(t: Tarefa) {
    const { error } = await supabase
      .from('tarefa')
      .update(t.estado === 'feita' ? { estado: 'aberta' } : { estado: 'feita', semana: t.semana ?? semana })
      .eq('id', t.id)
    setErro(error ? textoDoErro(error, 'Não foi possível mudar a tarefa.') : null)
    tarefas.recarregar()
    aoMudar()
  }

  async function novaNota() {
    const { data, error } = await supabase
      .from('nota')
      .insert({ titulo: `${projeto.nome}: anotações`, projeto_id: projeto.id })
      .select('id')
      .single()
    if (error || !data) return setErro('Não foi possível criar a nota.')
    ir({ tela: 'notas', id: data.id })
  }

  const ondeEsta = (t: Tarefa) =>
    t.estado === 'entrada'
      ? 'na entrada'
      : t.semana === semana
        ? t.em_andamento
          ? 'fazendo'
          : 'nesta semana'
        : t.semana
          ? 'ficou de semana anterior'
          : 'no backlog'

  return (
    <>
      <button type="button" className="link voltar" onClick={() => ir({ tela: 'tarefas' })}>
        ‹ Projetos e Tarefas
      </button>
      <h1 className="titulo-tela">
        {projeto.cliente && <small className="chip neutro">{projeto.cliente}</small>} {projeto.nome}
      </h1>
      <p className="ajuda">
        Projeto de{' '}
        <button type="button" className="link" onClick={() => ir({ tela: 'areas', id: projeto.area_id })}>
          {projeto.area}
        </button>
        {' · '}
        {projeto.estado === 'ativo'
          ? 'ativo'
          : projeto.estado === 'concluido'
            ? 'concluído'
            : projeto.estado === 'pausado'
              ? 'pausado'
              : 'algum dia'}
        {projeto.objetivo && ` · serve ao objetivo "${projeto.objetivo}"`}
        {' · '}
        <button type="button" className="link" onClick={() => setEditandoProjeto(true)}>
          editar
        </button>
      </p>
      {projeto.resultado && <p>Acaba quando: {projeto.resultado}</p>}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <div className="colunas larga-estreita">
        <div className="coluna">
          <section className="bloco primeiro">
            <h2 className="titulo-bloco">
              Tarefas · {abertas.length} abertas, {feitas.length} feitas
            </h2>
            {projeto.estado === 'ativo' && !abertas.some((t) => t.semana === semana) && (
              <p className="ajuda aviso">Sem próxima ação nesta semana. Qual é o próximo passo?</p>
            )}
            {(tarefas.dados ?? []).length > 0 && (
              <ul className="lista">
                {[...abertas, ...feitas].map((t) => (
                  <li key={t.id}>
                    <input
                      type="checkbox"
                      aria-label={t.estado === 'feita' ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
                      checked={t.estado === 'feita'}
                      onChange={() => marcar(t)}
                    />
                    <button type="button" className="item" onClick={() => setEditando(t)}>
                      <span className={t.estado === 'feita' ? 'riscado' : undefined}>{t.titulo}</span>
                      <small>{t.estado === 'feita' ? 'feita' : ondeEsta(t)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Captura rotulo="Nova tarefa deste projeto (vai para o backlog)" aoCriar={criarTarefa} />
          </section>
        </div>
        <div className="coluna">
          <section className="bloco primeiro">
            <h2 className="titulo-bloco">Notas do projeto</h2>
            {(notas.dados ?? []).length > 0 && (
              <ul className="lista">
                {(notas.dados ?? []).map((n) => (
                  <li key={n.id}>
                    <button type="button" className="item" onClick={() => ir({ tela: 'notas', id: n.id })}>
                      <span>{n.titulo}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p>
              <button type="button" className="botao" onClick={novaNota}>
                Nova nota do projeto
              </button>
            </p>
          </section>
          <section className="bloco">
            <h2 className="titulo-bloco">Estado</h2>
            <div className="botoes">
              {coluna !== 'ativo' && (
                <button type="button" className="botao" onClick={() => mudarEstado('ativo')}>
                  Ativar
                </button>
              )}
              {coluna === 'ativo' && (
                <button type="button" className="botao" onClick={() => mudarEstado('pausado')}>
                  Pausar (volta para Algum dia)
                </button>
              )}
              {coluna !== 'concluido' && (
                <button type="button" className="botao" onClick={() => mudarEstado('concluido')}>
                  Concluir
                </button>
              )}
            </div>
          </section>
        </div>
      </div>

      {editando && (
        <FolhaDaTarefa
          key={'id' in editando ? editando.id : 'nova'}
          inicio={semana}
          tarefa={'id' in editando ? editando : null}
          colunaInicial={
            'id' in editando
              ? editando.estado === 'feita'
                ? 'feito'
                : editando.semana === semana
                  ? editando.em_andamento
                    ? 'fazendo'
                    : 'afazer'
                  : 'backlog'
              : editando.coluna
          }
          objetivoInicial={'id' in editando ? editando.objetivo_id : null}
          projetoInicial={projeto.id}
          objetivos={objetivos}
          projetos={[
            {
              id: projeto.id,
              nome: projeto.nome,
              area_id: projeto.area_id,
              objetivo_id: projeto.objetivo_id,
              cliente: projeto.cliente,
            },
          ]}
          areas={areas}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null)
            tarefas.recarregar()
            aoMudar()
          }}
        />
      )}
      {editandoProjeto && (
        <FolhaDoProjeto
          projeto={projeto}
          estadoInicial={coluna}
          areas={areas}
          objetivos={objetivos}
          aoFechar={() => setEditandoProjeto(false)}
          aoSalvar={() => {
            setEditandoProjeto(false)
            aoMudar()
          }}
        />
      )}
    </>
  )
}

// ── Folhas e peças ──────────────────────────────────────────────────────────

function FolhaDoProjeto({
  projeto,
  nomeInicial,
  estadoInicial,
  areas,
  objetivos,
  aoFechar,
  aoSalvar,
}: {
  projeto: Projeto | null
  nomeInicial?: string
  estadoInicial: ColunaDeProjeto
  areas: Area[]
  objetivos: ObjetivoDoCiclo[]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const clientes = useConsulta<{ cliente: string }[]>(() =>
    supabase.from('projeto').select('cliente').not('cliente', 'is', null),
  )
  const [nome, setNome] = useState(projeto?.nome ?? nomeInicial ?? '')
  const [areaId, setAreaId] = useState<number | null>(projeto?.area_id ?? null)
  const [cliente, setCliente] = useState(projeto?.cliente ?? '')
  const [resultado, setResultado] = useState(projeto?.resultado ?? '')
  const [objetivoId, setObjetivoId] = useState<number | null>(projeto?.objetivo_id ?? null)
  const [estado, setEstado] = useState<ColunaDeProjeto>(estadoInicial)
  const [erro, setErro] = useState<string | null>(null)
  const daArea = objetivos.filter((o) => o.area_id === areaId)
  const nomesDeClientes = [...new Set((clientes.dados ?? []).map((c) => c.cliente))].sort()

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim() || areaId === null) return setErro('Dê um nome e escolha a área.')
    const dados = {
      nome: nome.trim(),
      area_id: areaId,
      cliente: cliente.trim() || null,
      resultado: resultado.trim() || null,
      objetivo_id: objetivoId,
      estado: projeto?.estado === 'pausado' && estado === 'algum_dia' ? 'pausado' : estado,
    }
    const { error } = projeto
      ? await supabase.from('projeto').update(dados).eq('id', projeto.id)
      : await supabase.from('projeto').insert(dados)
    if (error) return setErro(textoDoErro(error, 'Não foi possível salvar o projeto.'))
    aoSalvar()
  }

  return (
    <Folha titulo={projeto ? 'Projeto' : 'Novo projeto'} aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus={!projeto} />
        </label>
        <div className="lado-a-lado">
          <label>
            Área
            <select
              value={areaId ?? ''}
              onChange={(e) => {
                setAreaId(e.target.value ? Number(e.target.value) : null)
                setObjetivoId(null)
              }}
            >
              <option value="">Escolha</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cliente (trabalho)
            <input
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              list="clientes-dos-projetos"
              placeholder="vazio = pessoal"
            />
            <datalist id="clientes-dos-projetos">
              {nomesDeClientes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        <label>
          Acaba quando
          <input
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            placeholder="Como você sabe que terminou"
          />
        </label>
        {daArea.length > 0 && (
          <label>
            Objetivo do ciclo que ele serve
            <select
              value={objetivoId ?? ''}
              onChange={(e) => setObjetivoId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Nenhum</option>
              {daArea.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.titulo}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="segmentos" role="radiogroup" aria-label="Coluna do projeto">
          {COLUNAS_DE_PROJETO.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={estado === c.id}
              className={estado === c.id ? 'ativo' : undefined}
              onClick={() => setEstado(c.id)}
            >
              {c.nome}
            </button>
          ))}
        </div>
        <p className="ajuda">
          Projetos com cliente contam no limite daquele cliente; sem cliente, no limite dos pessoais.
        </p>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <div className="acoes">
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="principal">
            Salvar
          </button>
        </div>
      </form>
    </Folha>
  )
}

function Captura({ rotulo, aoCriar }: { rotulo: string; aoCriar: (titulo: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState('')
  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    if (await aoCriar(texto.trim())) setTexto('')
  }
  return (
    <form className="captura" onSubmit={enviar}>
      <input aria-label={rotulo} placeholder={rotulo} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <button type="submit">Guardar</button>
    </form>
  )
}
