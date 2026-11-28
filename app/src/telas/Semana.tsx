import { useEffect, useState, type DragEvent, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { corDaArea } from '../lib/areas'
import { diasDaSemana, hoje, inicioDaSemana, intervaloDaSemana, porExtenso, somarDias } from '../lib/datas'
import { numero } from '../lib/formato'
import { textoDoErro, useConsulta, type Ir } from '../lib/dados'
import { Folha } from '../componentes/Folha'
import { useObjetivosDoCiclo, type ObjetivoDoCiclo } from '../lib/objetivos'

export type CicloDaSemana = {
  id: number
  nome: string
  unica_coisa: string | null
  horas_livres: number | null
}
type AreaCurta = { id: number; nome: string }
type Objetivo = ObjetivoDoCiclo
type ProjetoCurto = { id: number; nome: string; area_id: number; objetivo_id: number | null; cliente: string | null }
export type Tarefa = {
  id: number
  titulo: string
  detalhe: string | null
  estado: 'entrada' | 'aberta' | 'feita' | 'descartada'
  area_id: number | null
  area: string | null
  projeto_id: number | null
  projeto: string | null
  dia: string | null
  semana: string | null
  objetivo_id: number | null
  objetivo: string | null
  em_andamento: boolean
  cliente: string | null
}
export type Coluna = 'backlog' | 'afazer' | 'fazendo' | 'feito'
type SemanaLinha = { intencao: string | null; revisao: string | null }

const COLUNAS: { id: Coluna; nome: string; ajuda: string }[] = [
  {
    id: 'backlog',
    nome: 'Backlog',
    ajuda: 'Decidido, ainda sem semana. O que sobrou de semanas anteriores volta para cá.',
  },
  { id: 'afazer', nome: 'A fazer', ajuda: 'O que entra nesta semana.' },
  { id: 'fazendo', nome: 'Fazendo', ajuda: 'Em andamento agora.' },
  { id: 'feito', nome: 'Feito', ajuda: 'Concluído nesta semana.' },
]
const CAMPOS =
  'id, titulo, detalhe, estado, area_id, area, projeto_id, projeto, dia, semana, objetivo_id, objetivo, em_andamento, cliente'
const curtoDoDia = (dia: string) => porExtenso(dia).split(',')[0]

function colunaDa(t: Tarefa, inicio: string): Coluna {
  if (t.estado === 'feita') return 'feito'
  if (t.semana !== inicio) return 'backlog'
  return t.em_andamento ? 'fazendo' : 'afazer'
}

// O plano semanal: lembra os objetivos do ciclo e monta a semana no quadro.
// O quadro é o mesmo de Projetos e Tarefas: mexer num lugar muda no outro.
export function PlanoSemanal({ ciclo, areas, ir }: { ciclo: CicloDaSemana | null; areas: AreaCurta[]; ir: Ir }) {
  const [inicio, setInicio] = useState(inicioDaSemana(hoje()))
  const objetivos = useObjetivosDoCiclo(ciclo?.id)
  const [daSemana, setDaSemana] = useState<Tarefa[] | null>(null)
  const [pedido, setPedido] = useState<PedidoDeTarefa | null>(null)
  const atual = inicioDaSemana(hoje())
  const emAndamento = (daSemana ?? []).filter((t) => t.estado === 'aberta' && t.semana === inicio).length

  return (
    <div className="plano-semanal">
      <NavegarSemana inicio={inicio} atual={atual} aoMudar={setInicio} />

      <ObjetivosDoCiclo
        key={inicio}
        ciclo={ciclo}
        objetivos={objetivos.dados ?? []}
        areas={areas}
        tarefas={daSemana ?? []}
        abertoNoInicio={daSemana !== null && emAndamento === 0}
        aoCriarTarefa={(objetivoId) => setPedido({ coluna: 'afazer', objetivo_id: objetivoId, n: Date.now() })}
        ir={ir}
      />

      <IntencaoDaSemana key={`i${inicio}`} inicio={inicio} />

      <QuadroDaSemana
        inicio={inicio}
        objetivos={objetivos.dados ?? []}
        areas={areas}
        ir={ir}
        pedido={pedido}
        aoCarregarSemana={setDaSemana}
      />
    </div>
  )
}

export function NavegarSemana({
  inicio,
  atual,
  aoMudar,
}: {
  inicio: string
  atual: string
  aoMudar: (inicio: string) => void
}) {
  return (
    <div className="navegar-semana">
      <button
        type="button"
        className="botao"
        aria-label="Semana anterior"
        onClick={() => aoMudar(somarDias(inicio, -7))}
      >
        ‹
      </button>
      <h2 className="titulo-bloco">
        Semana de {intervaloDaSemana(inicio)}
        {inicio !== atual && <small>{inicio > atual ? 'próxima' : 'passada'}</small>}
      </h2>
      <button type="button" className="botao" aria-label="Próxima semana" onClick={() => aoMudar(somarDias(inicio, 7))}>
        ›
      </button>
      {inicio !== atual && (
        <button type="button" className="link" onClick={() => aoMudar(atual)}>
          esta semana
        </button>
      )}
    </div>
  )
}

export type PedidoDeTarefa = { coluna: Coluna; objetivo_id?: number; projeto_id?: number; n: number }

// O quadro da semana: Backlog · A fazer · Fazendo · Feito. Lê as tarefas do
// banco a cada mudança, então o Plano e Projetos e Tarefas mostram sempre o
// mesmo. "versao" força uma releitura quando outra parte da tela mexeu nas
// tarefas; "pedido" abre a folha de uma tarefa nova já com coluna e ligação.
export function QuadroDaSemana({
  inicio,
  objetivos,
  areas,
  ir,
  versao = 0,
  pedido = null,
  avisoDaEntrada = true,
  aoCarregarSemana,
  aoMudar,
}: {
  inicio: string
  objetivos: Objetivo[]
  areas: AreaCurta[]
  ir: Ir
  versao?: number
  pedido?: PedidoDeTarefa | null
  avisoDaEntrada?: boolean
  aoCarregarSemana?: (tarefas: Tarefa[]) => void
  aoMudar?: () => void
}) {
  const projetos = useConsulta<ProjetoCurto[]>(
    () =>
      supabase.from('projeto').select('id, nome, area_id, objetivo_id, cliente').eq('estado', 'ativo').order('nome'),
    [versao],
  )
  const backlog = useConsulta<Tarefa[]>(
    () =>
      supabase
        .from('v_tarefa')
        .select(CAMPOS)
        .eq('estado', 'aberta')
        .or(`semana.is.null,semana.lt.${inicio}`)
        .order('criado_em'),
    [inicio, versao],
  )
  const daSemana = useConsulta<Tarefa[]>(
    () =>
      supabase
        .from('v_tarefa')
        .select(CAMPOS)
        .eq('semana', inicio)
        .in('estado', ['aberta', 'feita'])
        .order('criado_em'),
    [inicio, versao],
  )
  const entrada = useConsulta<{ id: number }[]>(
    () => supabase.from('tarefa').select('id').eq('estado', 'entrada'),
    [versao],
  )
  const [editando, setEditando] = useState<Tarefa | Omit<PedidoDeTarefa, 'n'> | null>(null)
  const [aba, setAba] = useState<Coluna>('afazer')
  const [arrastando, setArrastando] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (pedido) setEditando({ coluna: pedido.coluna, objetivo_id: pedido.objetivo_id, projeto_id: pedido.projeto_id })
  }, [pedido])

  useEffect(() => {
    if (daSemana.dados) aoCarregarSemana?.(daSemana.dados)
    // aoCarregarSemana é um setState do pai: estável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daSemana.dados])

  const todas = [...(backlog.dados ?? []), ...(daSemana.dados ?? [])]
  const porColuna = (c: Coluna) => todas.filter((t) => colunaDa(t, inicio) === c)

  function recarregar() {
    backlog.recarregar()
    daSemana.recarregar()
    entrada.recarregar()
    aoMudar?.()
  }

  async function mover(t: Tarefa, para: Coluna) {
    if (colunaDa(t, inicio) === para) return
    const diaNaSemana = t.dia && t.dia >= inicio && t.dia <= somarDias(inicio, 6) ? t.dia : null
    const mudanca =
      para === 'backlog'
        ? { semana: null, dia: null, em_andamento: false, estado: 'aberta' }
        : para === 'feito'
          ? { semana: inicio, dia: diaNaSemana, estado: 'feita' }
          : { semana: inicio, dia: diaNaSemana, em_andamento: para === 'fazendo', estado: 'aberta' }
    const { error } = await supabase.from('tarefa').update(mudanca).eq('id', t.id)
    setErro(error ? textoDoErro(error, 'Não foi possível mover a tarefa.') : null)
    recarregar()
  }

  function soltar(e: DragEvent, para: Coluna) {
    e.preventDefault()
    const t = todas.find((x) => x.id === arrastando)
    setArrastando(null)
    if (t) mover(t, para)
  }

  return (
    <div className="quadro-da-semana-inteiro">
      <div className="segmentos espacado so-celular" role="tablist" aria-label="Colunas do quadro">
        {COLUNAS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={aba === c.id}
            className={aba === c.id ? 'ativo' : undefined}
            onClick={() => setAba(c.id)}
          >
            {c.nome} {porColuna(c.id).length}
          </button>
        ))}
      </div>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <div className="quadro-da-semana">
        {COLUNAS.map((c) => (
          <section
            key={c.id}
            className={`coluna-da-semana${aba === c.id ? ' ativa' : ''}${arrastando !== null ? ' recebe' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => soltar(e, c.id)}
          >
            <h3 className="cabeca-da-coluna">
              {c.nome}
              <small>{porColuna(c.id).length}</small>
            </h3>
            {avisoDaEntrada && c.id === 'backlog' && (entrada.dados ?? []).length > 0 && (
              <p className="ajuda">
                {(entrada.dados ?? []).length} na entrada para decidir.{' '}
                <button type="button" className="link" onClick={() => ir({ tela: 'tarefas' })}>
                  Abrir a entrada
                </button>
              </p>
            )}
            <ul className="cartoes-da-coluna">
              {porColuna(c.id).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`cartao-da-tarefa${t.estado === 'feita' ? ' feita' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(t.id))
                      e.dataTransfer.effectAllowed = 'move'
                      setArrastando(t.id)
                    }}
                    onDragEnd={() => setArrastando(null)}
                    onClick={() => setEditando(t)}
                  >
                    <span className="titulo-da-tarefa">
                      {t.cliente && <small className="chip neutro">{t.cliente}</small>}
                      {t.titulo}
                    </span>
                    <small>
                      {t.area && <i className="ponto-da-area" style={{ background: corDaArea(t.area) }} />}
                      {[
                        t.dia && curtoDoDia(t.dia),
                        t.projeto ?? t.objetivo ?? t.area,
                        c.id === 'backlog' && t.semana && 'ficou de uma semana anterior',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            {c.id !== 'feito' && <NovaNaColuna inicio={inicio} coluna={c.id} aoCriar={recarregar} aoErrar={setErro} />}
          </section>
        ))}
      </div>
      <p className="ajuda">
        Arraste um cartão entre as colunas, ou toque nele para mudar, marcar o dia ou excluir. A tarefa com dia aparece
        nos espaços de Hoje.
      </p>

      {editando && (
        <FolhaDaTarefa
          key={
            'id' in editando ? editando.id : `nova-${editando.coluna}-${editando.objetivo_id}-${editando.projeto_id}`
          }
          inicio={inicio}
          tarefa={'id' in editando ? editando : null}
          colunaInicial={'id' in editando ? colunaDa(editando, inicio) : editando.coluna}
          objetivoInicial={'id' in editando ? editando.objetivo_id : (editando.objetivo_id ?? null)}
          projetoInicial={'id' in editando ? editando.projeto_id : (editando.projeto_id ?? null)}
          objetivos={objetivos}
          projetos={projetos.dados ?? []}
          areas={areas}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null)
            recarregar()
          }}
        />
      )}
    </div>
  )
}

// Ao começar a semana, os objetivos do ciclo ficam à vista: o que farei nesta
// semana para chegar neles?
function ObjetivosDoCiclo({
  ciclo,
  objetivos,
  areas,
  tarefas,
  abertoNoInicio,
  aoCriarTarefa,
  ir,
}: {
  ciclo: CicloDaSemana | null
  objetivos: Objetivo[]
  areas: AreaCurta[]
  tarefas: Tarefa[]
  abertoNoInicio: boolean
  aoCriarTarefa: (objetivoId: number) => void
  ir: Ir
}) {
  const nomeDaArea = (id: number) => areas.find((a) => a.id === id)?.nome ?? ''
  if (!ciclo)
    return (
      <p className="vazio pequeno">
        Não há ciclo em andamento, então não há objetivos para lembrar.{' '}
        <button type="button" className="link" onClick={() => ir({ tela: 'plano' })}>
          Abrir um ciclo
        </button>
      </p>
    )

  return (
    <details className="visao-norte objetivos-lembrados" open={abertoNoInicio}>
      <summary>
        <span className="titulo-bloco">Objetivos do ciclo</span>
        <small>
          {ciclo.nome} · {objetivos.length} {objetivos.length === 1 ? 'objetivo' : 'objetivos'}
          {ciclo.horas_livres !== null && ` · ${numero.format(ciclo.horas_livres)} h por semana para o ciclo`}
        </small>
      </summary>
      {ciclo.unica_coisa && (
        <section className="unica-coisa">
          <p className="rotulo-ambar">
            <i aria-hidden="true" />A única coisa do ciclo
          </p>
          <p className="texto-da-unica-coisa">{ciclo.unica_coisa}</p>
        </section>
      )}
      {objetivos.length === 0 ? (
        <p className="ajuda">O ciclo ainda não tem objetivos.</p>
      ) : (
        <ul className="lista-de-visoes">
          {objetivos.map((o) => {
            const daSemana = tarefas.filter((t) => t.objetivo_id === o.id)
            return (
              <li key={o.id} className="visao-da-area">
                <p className="nome-da-area">
                  <i className="ponto-da-area" style={{ background: corDaArea(nomeDaArea(o.area_id)) }} />
                  {o.titulo}
                </p>
                <p className="texto-da-visao">
                  {[o.pronto_quando && `Acaba quando: ${o.pronto_quando}`, o.minimo && `Semana ruim: ${o.minimo}`]
                    .filter(Boolean)
                    .join('\n')}
                </p>
                <p className="ajuda">
                  {daSemana.length === 0
                    ? 'Nada nesta semana ainda. '
                    : `${daSemana.length} ${daSemana.length === 1 ? 'tarefa' : 'tarefas'} nesta semana. `}
                  <button type="button" className="link" onClick={() => aoCriarTarefa(o.id)}>
                    + tarefa
                  </button>
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </details>
  )
}

function IntencaoDaSemana({ inicio }: { inicio: string }) {
  const semana = useConsulta<SemanaLinha | null>(
    () => supabase.from('semana').select('intencao, revisao').eq('inicio', inicio).maybeSingle(),
    [inicio],
  )
  if (!semana.carregou) return null
  return <FormDaSemana inicio={inicio} inicial={semana.dados} />
}

function FormDaSemana({ inicio, inicial }: { inicio: string; inicial: SemanaLinha | null }) {
  const [intencao, setIntencao] = useState(inicial?.intencao ?? '')
  const [revisao, setRevisao] = useState(inicial?.revisao ?? '')
  const [aviso, setAviso] = useState<string | null>(null)

  async function salvar(e?: FormEvent) {
    e?.preventDefault()
    if ((intencao.trim() || null) === inicial?.intencao && (revisao.trim() || null) === inicial?.revisao) return
    const { error } = await supabase
      .from('semana')
      .upsert({ inicio, intencao: intencao.trim() || null, revisao: revisao.trim() || null }, { onConflict: 'inicio' })
    setAviso(error ? 'Não foi possível salvar a semana.' : 'Salvo.')
  }

  return (
    <form className="intencao-da-semana" onSubmit={salvar}>
      <label>
        Intenção: o que importa nesta semana
        <textarea rows={2} value={intencao} onChange={(e) => setIntencao(e.target.value)} onBlur={() => salvar()} />
      </label>
      <label>
        Revisão de sexta: o que funcionou e o que muda na próxima
        <textarea rows={2} value={revisao} onChange={(e) => setRevisao(e.target.value)} onBlur={() => salvar()} />
      </label>
      {aviso && <p className="ajuda">{aviso}</p>}
    </form>
  )
}

function NovaNaColuna({
  inicio,
  coluna,
  aoCriar,
  aoErrar,
}: {
  inicio: string
  coluna: Coluna
  aoCriar: () => void
  aoErrar: (erro: string | null) => void
}) {
  const [titulo, setTitulo] = useState('')

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) return
    const { error } = await supabase.from('tarefa').insert({
      titulo: titulo.trim(),
      estado: 'aberta',
      semana: coluna === 'backlog' ? null : inicio,
      em_andamento: coluna === 'fazendo',
    })
    aoErrar(error ? textoDoErro(error, 'Não foi possível criar a tarefa.') : null)
    if (!error) setTitulo('')
    aoCriar()
  }

  return (
    <form className="nova-na-coluna" onSubmit={criar}>
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="+ nova tarefa"
        aria-label={`Nova tarefa em ${COLUNAS.find((c) => c.id === coluna)?.nome}`}
      />
    </form>
  )
}

export function FolhaDaTarefa({
  inicio,
  tarefa,
  colunaInicial,
  objetivoInicial,
  projetoInicial = null,
  objetivos,
  projetos,
  areas,
  aoFechar,
  aoSalvar,
}: {
  inicio: string
  tarefa: Tarefa | null
  colunaInicial: Coluna
  objetivoInicial: number | null
  projetoInicial?: number | null
  objetivos: Objetivo[]
  projetos: ProjetoCurto[]
  areas: AreaCurta[]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? '')
  const [detalhe, setDetalhe] = useState(tarefa?.detalhe ?? '')
  const [coluna, setColuna] = useState<Coluna>(colunaInicial)
  const [objetivoId, setObjetivoId] = useState<number | null>(objetivoInicial)
  const [projetoId, setProjetoId] = useState<number | null>(tarefa?.projeto_id ?? projetoInicial)
  const [areaId, setAreaId] = useState<number | null>(tarefa?.area_id ?? null)
  const diasDestaSemana = diasDaSemana(inicio)
  const [dia, setDia] = useState<string | null>(tarefa?.dia && diasDestaSemana.includes(tarefa.dia) ? tarefa.dia : null)
  const [erro, setErro] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const nomeDoProjeto = (p: ProjetoCurto) => (p.cliente ? `${p.cliente} · ${p.nome}` : p.nome)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) return setErro('Escreva a tarefa.')
    const naSemana = coluna !== 'backlog'
    const dados = {
      titulo: titulo.trim(),
      detalhe: detalhe.trim() || null,
      objetivo_id: projetoId ? null : objetivoId,
      projeto_id: projetoId,
      area_id: objetivoId || projetoId ? null : areaId,
      semana: naSemana ? inicio : null,
      dia: naSemana ? dia : null,
      em_andamento: coluna === 'fazendo',
      estado: coluna === 'feito' ? 'feita' : 'aberta',
    }
    const { error } = tarefa
      ? await supabase.from('tarefa').update(dados).eq('id', tarefa.id)
      : await supabase.from('tarefa').insert(dados)
    if (error) return setErro(textoDoErro(error, 'Não foi possível salvar a tarefa.'))
    aoSalvar()
  }

  async function excluir() {
    if (!tarefa) return
    const { error } = await supabase.from('tarefa').delete().eq('id', tarefa.id)
    if (error) return setErro('Não foi possível excluir a tarefa.')
    aoSalvar()
  }

  return (
    <Folha
      titulo={tarefa ? 'Tarefa' : 'Nova tarefa'}
      subtitulo={`Semana de ${intervaloDaSemana(inicio)}`}
      aoFechar={aoFechar}
    >
      <form onSubmit={salvar}>
        <label>
          Tarefa
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus={!tarefa} />
        </label>
        <div className="segmentos" role="radiogroup" aria-label="Coluna">
          {COLUNAS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={coluna === c.id}
              className={coluna === c.id ? 'ativo' : undefined}
              onClick={() => setColuna(c.id)}
            >
              {c.nome}
            </button>
          ))}
        </div>
        {coluna !== 'backlog' && (
          <label>
            Dia (aparece nos espaços de Hoje)
            <select value={dia ?? ''} onChange={(e) => setDia(e.target.value || null)}>
              <option value="">Sem dia: em algum momento da semana</option>
              {diasDestaSemana.map((d) => (
                <option key={d} value={d}>
                  {porExtenso(d)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Projeto
          <select
            value={projetoId ?? ''}
            onChange={(e) => setProjetoId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sem projeto</option>
            {projetos.map((p) => (
              <option key={p.id} value={p.id}>
                {nomeDoProjeto(p)}
              </option>
            ))}
          </select>
        </label>
        {projetoId === null && objetivos.length > 0 && (
          <label>
            Objetivo do ciclo (sem projeto)
            <select
              value={objetivoId ?? ''}
              onChange={(e) => setObjetivoId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Nenhum</option>
              {objetivos.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.titulo}
                </option>
              ))}
            </select>
          </label>
        )}
        {objetivoId === null && projetoId === null && (
          <label>
            Área
            <select value={areaId ?? ''} onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sem área</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Detalhe
          <textarea rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} />
        </label>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <div className="acoes">
          {tarefa &&
            (excluindo ? (
              <button type="button" className="perigo" onClick={excluir}>
                Excluir de vez
              </button>
            ) : (
              <button type="button" onClick={() => setExcluindo(true)}>
                Excluir
              </button>
            ))}
          <button type="submit" className="principal">
            Salvar
          </button>
        </div>
      </form>
    </Folha>
  )
}
