import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { corDaArea } from '../lib/areas'
import { Folha } from '../componentes/Folha'
import { hoje, somarDias } from '../lib/datas'
import { textoDoErro, useAreas, useConsulta, type Area, type Ir } from '../lib/dados'

type Tarefa = {
  id: number
  titulo: string
  detalhe: string | null
  estado: 'entrada' | 'aberta' | 'feita' | 'descartada'
  area_id: number | null
  area: string | null
  projeto_id: number | null
  projeto: string | null
  dia: string | null
}
type Projeto = {
  id: number
  nome: string
  resultado: string | null
  estado: 'ativo' | 'pausado' | 'concluido'
  area_id: number
  area: string
  objetivo_id: number | null
  objetivo: string | null
  tarefas_abertas: number
  tarefas_feitas: number
  notas: number
}
type Objetivo = { id: number; titulo: string; area_id: number }
type Aba = 'entrada' | 'abertas' | 'projetos' | 'feitas'

const CAMPOS = 'id, titulo, detalhe, estado, area_id, area, projeto_id, projeto, dia'

function rotuloDoDia(dia: string): string {
  if (dia === hoje()) return 'hoje'
  if (dia === somarDias(hoje(), 1)) return 'amanhã'
  const [, mes, d] = dia.split('-')
  return `${d}/${mes}`
}

export function Tarefas({ projetoId, ir }: { projetoId?: number; ir: Ir }) {
  const areas = useAreas()
  const pendentes = useConsulta<Tarefa[]>(() =>
    supabase.from('v_tarefa').select(CAMPOS).in('estado', ['entrada', 'aberta']).order('criado_em'),
  )
  const feitas = useConsulta<Tarefa[]>(() =>
    supabase.from('v_tarefa').select(CAMPOS).eq('estado', 'feita').order('feita_em', { ascending: false }).limit(30),
  )
  const projetos = useConsulta<Projeto[]>(() => supabase.from('v_projeto').select('*').order('nome'))
  const [aba, setAba] = useState<Aba | null>(null)
  const [editando, setEditando] = useState<Tarefa | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function recarregar() {
    pendentes.recarregar()
    feitas.recarregar()
    projetos.recarregar()
  }

  async function mudar(id: number, mudanca: Record<string, unknown>) {
    const { error } = await supabase.from('tarefa').update(mudanca).eq('id', id)
    setErro(error ? textoDoErro(error, 'Não foi possível salvar a tarefa.') : null)
    recarregar()
  }

  async function criar(titulo: string, extra: Record<string, unknown> = {}) {
    const { error } = await supabase.from('tarefa').insert({ titulo, ...extra })
    setErro(error ? textoDoErro(error, 'Não foi possível guardar a tarefa.') : null)
    recarregar()
    return !error
  }

  const todas = pendentes.dados ?? []
  const naEntrada = todas.filter((t) => t.estado === 'entrada')
  const abertas = todas.filter((t) => t.estado === 'aberta')
  const listaDeProjetos = projetos.dados ?? []
  const folha = editando && (
    <FolhaDaTarefa
      key={editando.id}
      tarefa={editando}
      areas={areas}
      projetos={listaDeProjetos.filter((p) => p.estado === 'ativo' || p.id === editando.projeto_id)}
      aoFechar={() => setEditando(null)}
      aoPronto={() => {
        setEditando(null)
        setErro(null)
        recarregar()
      }}
    />
  )

  if (projetoId !== undefined) {
    const projeto = listaDeProjetos.find((p) => p.id === projetoId)
    if (!projeto) return <main>{projetos.carregou && <p className="vazio">Projeto não encontrado.</p>}</main>
    return (
      <main className="estreito">
        <PaginaDoProjeto
          projeto={projeto}
          tarefas={todas.filter((t) => t.projeto_id === projeto.id)}
          erro={erro}
          ir={ir}
          aoCriar={(titulo) => criar(titulo, { projeto_id: projeto.id, estado: 'aberta' })}
          aoMarcar={(t) => mudar(t.id, { estado: 'feita' })}
          aoAbrir={setEditando}
          aoMudarProjeto={projetos.recarregar}
        />
        {folha}
      </main>
    )
  }

  const abaAtual: Aba = aba ?? (naEntrada.length > 0 ? 'entrada' : 'abertas')

  // Abertas agrupadas por projeto; sem projeto, pela área.
  const grupos = new Map<string, Tarefa[]>()
  for (const t of abertas) {
    const chave = t.projeto ? `Projeto: ${t.projeto}` : (t.area ?? 'Sem área')
    grupos.set(chave, [...(grupos.get(chave) ?? []), t])
  }

  return (
    <main>
      <h1 className="titulo-tela">Tarefas</h1>
      <Captura rotulo="Capturar uma tarefa ou ideia" aoCriar={(titulo) => criar(titulo)} />
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <div className="segmentos espacado so-celular" role="tablist">
        {(
          [
            ['entrada', `Entrada${naEntrada.length ? ` (${naEntrada.length})` : ''}`],
            ['abertas', 'Abertas'],
            ['projetos', 'Projetos'],
            ['feitas', 'Feitas'],
          ] as const
        ).map(([id, nome]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={abaAtual === id}
            className={abaAtual === id ? 'ativo' : undefined}
            onClick={() => setAba(id)}
          >
            {nome}
          </button>
        ))}
      </div>

      <div className="quadro">
        <section className={abaAtual === 'entrada' ? 'bloco coluna-do-quadro ativa' : 'bloco coluna-do-quadro'}>
          <h2 className="titulo-bloco so-computador">Entrada{naEntrada.length ? ` (${naEntrada.length})` : ''}</h2>
          {naEntrada.length === 0 ? (
            <p className="vazio pequeno">
              A entrada está vazia. O que você capturar aparece aqui até ganhar área, projeto e dia, ou ser descartado.
            </p>
          ) : (
            <Lista tarefas={naEntrada} aoMarcar={(t) => mudar(t.id, { estado: 'feita' })} aoAbrir={setEditando} />
          )}
        </section>

        <section className={abaAtual === 'abertas' ? 'bloco coluna-do-quadro ativa' : 'bloco coluna-do-quadro'}>
          <h2 className="titulo-bloco so-computador">Abertas</h2>
          {abertas.length === 0 && <p className="vazio pequeno">Nenhuma tarefa aberta.</p>}
          {[...grupos.entries()].map(([grupo, lista]) => (
            <div key={grupo} className="grupo-de-tarefas">
              <h3 className="titulo-bloco">{grupo}</h3>
              <Lista tarefas={lista} aoMarcar={(t) => mudar(t.id, { estado: 'feita' })} aoAbrir={setEditando} />
            </div>
          ))}
        </section>

        <section className={abaAtual === 'projetos' ? 'bloco coluna-do-quadro ativa' : 'bloco coluna-do-quadro'}>
          <h2 className="titulo-bloco so-computador">Projetos</h2>
          {listaDeProjetos.length === 0 && <p className="vazio pequeno">Nenhum projeto ainda.</p>}
          {listaDeProjetos.length > 0 && (
            <ul className="lista">
              {[...listaDeProjetos]
                .sort((a, b) => Number(a.estado !== 'ativo') - Number(b.estado !== 'ativo'))
                .map((p) => (
                  <li key={p.id}>
                    <button type="button" className="item" onClick={() => ir({ tela: 'tarefas', id: p.id })}>
                      <span>
                        {p.nome}
                        {p.estado !== 'ativo' && (
                          <small className="chip">{p.estado === 'pausado' ? 'pausado' : 'concluído'}</small>
                        )}
                      </span>
                      <small>
                        {p.area} · {p.tarefas_abertas} abertas · {p.notas} notas
                      </small>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <NovoProjeto areas={areas} aoCriar={projetos.recarregar} />
        </section>

        <section className={abaAtual === 'feitas' ? 'bloco coluna-do-quadro ativa' : 'bloco coluna-do-quadro'}>
          <h2 className="titulo-bloco so-computador">Feitas</h2>
          {(feitas.dados ?? []).length === 0 ? (
            <p className="vazio pequeno">Nada concluído ainda.</p>
          ) : (
            <Lista
              tarefas={feitas.dados ?? []}
              aoMarcar={(t) => mudar(t.id, { estado: 'aberta' })}
              aoAbrir={setEditando}
            />
          )}
        </section>
      </div>

      {folha}
    </main>
  )
}

function Captura({ rotulo, aoCriar }: { rotulo: string; aoCriar: (titulo: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState('')
  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    if (await aoCriar(texto)) setTexto('')
  }
  return (
    <form className="captura" onSubmit={enviar}>
      <input aria-label={rotulo} placeholder={rotulo} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <button type="submit">Guardar</button>
    </form>
  )
}

function Lista({
  tarefas,
  aoMarcar,
  aoAbrir,
}: {
  tarefas: Tarefa[]
  aoMarcar: (t: Tarefa) => void
  aoAbrir: (t: Tarefa) => void
}) {
  return (
    <ul className="lista">
      {tarefas.map((t) => (
        <li key={t.id}>
          <input
            type="checkbox"
            aria-label={t.estado === 'feita' ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
            checked={t.estado === 'feita'}
            onChange={() => aoMarcar(t)}
          />
          <button type="button" className="item" onClick={() => aoAbrir(t)}>
            <span className={t.estado === 'feita' ? 'riscado' : undefined}>{t.titulo}</span>
            {(t.dia || t.projeto || t.area) && (
              <small>
                {t.area && <i className="ponto-da-area" style={{ background: corDaArea(t.area) }} />}
                {[t.dia && rotuloDoDia(t.dia), t.projeto ?? t.area].filter(Boolean).join(' · ')}
              </small>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

function FolhaDaTarefa({
  tarefa,
  areas,
  projetos,
  aoFechar,
  aoPronto,
}: {
  tarefa: Tarefa
  areas: Area[]
  projetos: Projeto[]
  aoFechar: () => void
  aoPronto: () => void
}) {
  const amanha = somarDias(hoje(), 1)
  const [titulo, setTitulo] = useState(tarefa.titulo)
  const [detalhe, setDetalhe] = useState(tarefa.detalhe ?? '')
  const [projetoId, setProjetoId] = useState<number | null>(tarefa.projeto_id)
  const [areaId, setAreaId] = useState<number | null>(tarefa.area_id)
  const [dia, setDia] = useState<string | null>(tarefa.dia)
  const [erro, setErro] = useState<string | null>(null)
  const dias: [string | null, string][] = [
    [null, 'Sem dia'],
    [hoje(), 'Hoje'],
    [amanha, 'Amanhã'],
  ]
  if (dia && dia !== hoje() && dia !== amanha) dias.push([dia, rotuloDoDia(dia)])

  async function gravar(mudanca: Record<string, unknown>) {
    const { error } = await supabase.from('tarefa').update(mudanca).eq('id', tarefa.id)
    if (error) return setErro(textoDoErro(error, 'Não foi possível salvar a tarefa.'))
    aoPronto()
  }

  function salvar(e: FormEvent) {
    e.preventDefault()
    void gravar({
      titulo,
      detalhe: detalhe.trim() || null,
      projeto_id: projetoId,
      area_id: areaId,
      dia,
      // Decidir sobre um item da entrada é o que o tira de lá.
      estado: tarefa.estado === 'entrada' ? 'aberta' : tarefa.estado,
    })
  }

  return (
    <Folha
      titulo="Tarefa"
      subtitulo={tarefa.estado === 'entrada' ? 'Na entrada: falta decidir' : undefined}
      aoFechar={aoFechar}
    >
      <form onSubmit={salvar}>
        <label>
          O que é
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label>
          Projeto
          <select
            value={projetoId ?? ''}
            onChange={(e) => setProjetoId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sem projeto</option>
            {projetos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} ({p.area})
              </option>
            ))}
          </select>
        </label>
        {projetoId === null && (
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
        <div className="segmentos" role="radiogroup" aria-label="Dia">
          {dias.map(([valor, nome]) => (
            <button
              key={nome}
              type="button"
              role="radio"
              aria-checked={dia === valor}
              className={dia === valor ? 'ativo' : undefined}
              onClick={() => setDia(valor)}
            >
              {nome}
            </button>
          ))}
        </div>
        <p className="ajuda">
          Com dia, a tarefa ocupa um dos espaços daquele dia. Se o dia passar, ela volta a ficar sem dia.
        </p>
        <label>
          Detalhe
          <textarea rows={3} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <div className="acoes">
          <button type="button" onClick={() => gravar({ estado: 'descartada', dia: null })}>
            Descartar
          </button>
          <button type="submit" className="principal">
            Salvar
          </button>
        </div>
      </form>
    </Folha>
  )
}

function NovoProjeto({ areas, aoCriar }: { areas: Area[]; aoCriar: () => void }) {
  const objetivos = useConsulta<Objetivo[]>(() =>
    supabase.from('objetivo').select('id, titulo, area_id').eq('estado', 'ativo').order('id'),
  )
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [areaId, setAreaId] = useState<number | null>(null)
  const [resultado, setResultado] = useState('')
  const [objetivoId, setObjetivoId] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const doArea = (objetivos.dados ?? []).filter((o) => o.area_id === areaId)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim() || areaId === null) return setErro('Dê um nome e escolha a área.')
    const { error } = await supabase
      .from('projeto')
      .insert({ nome: nome.trim(), area_id: areaId, resultado: resultado.trim() || null, objetivo_id: objetivoId })
    if (error) return setErro(textoDoErro(error, 'Não foi possível criar o projeto.'))
    setNome('')
    setResultado('')
    setObjetivoId(null)
    setErro(null)
    setAberto(false)
    aoCriar()
  }

  if (!aberto) {
    return (
      <p>
        <button type="button" className="botao" onClick={() => setAberto(true)}>
          Novo projeto
        </button>
      </p>
    )
  }
  return (
    <div className="cartao">
      <form onSubmit={salvar}>
        <label>
          Nome do projeto
          <input value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
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
          Pronto quando
          <input
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            placeholder="Como você sabe que acabou"
          />
        </label>
        {doArea.length > 0 && (
          <label>
            Objetivo do ciclo que este projeto serve
            <select
              value={objetivoId ?? ''}
              onChange={(e) => setObjetivoId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Nenhum</option>
              {doArea.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.titulo}
                </option>
              ))}
            </select>
          </label>
        )}
        {erro && <p className="erro">{erro}</p>}
        <div className="acoes">
          <button type="button" onClick={() => setAberto(false)}>
            Cancelar
          </button>
          <button type="submit" className="principal">
            Criar projeto
          </button>
        </div>
      </form>
    </div>
  )
}

// A página de um projeto junta as tarefas e as notas dele.
function PaginaDoProjeto({
  projeto,
  tarefas,
  erro,
  ir,
  aoCriar,
  aoMarcar,
  aoAbrir,
  aoMudarProjeto,
}: {
  projeto: Projeto
  tarefas: Tarefa[]
  erro: string | null
  ir: Ir
  aoCriar: (titulo: string) => Promise<boolean>
  aoMarcar: (t: Tarefa) => void
  aoAbrir: (t: Tarefa) => void
  aoMudarProjeto: () => void
}) {
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
  const [aviso, setAviso] = useState<string | null>(null)

  async function mudarEstado(estado: Projeto['estado']) {
    const { error } = await supabase.from('projeto').update({ estado }).eq('id', projeto.id)
    setAviso(error ? textoDoErro(error, 'Não foi possível mudar o projeto.') : null)
    aoMudarProjeto()
  }

  async function novaNota() {
    const { data, error } = await supabase
      .from('nota')
      .insert({ titulo: `${projeto.nome}: anotações`, projeto_id: projeto.id })
      .select('id')
      .single()
    if (error || !data) return setAviso('Não foi possível criar a nota.')
    ir({ tela: 'notas', id: data.id })
  }

  return (
    <>
      <button type="button" className="link voltar" onClick={() => ir({ tela: 'tarefas' })}>
        ‹ Tarefas
      </button>
      <h1 className="titulo-tela">{projeto.nome}</h1>
      <p className="ajuda">
        Projeto de{' '}
        <button type="button" className="link" onClick={() => ir({ tela: 'areas', id: projeto.area_id })}>
          {projeto.area}
        </button>
        {projeto.estado !== 'ativo' && ` · ${projeto.estado === 'pausado' ? 'pausado' : 'concluído'}`}
        {projeto.objetivo && ` · serve ao objetivo "${projeto.objetivo}"`}
      </p>
      {projeto.resultado && <p>Pronto quando: {projeto.resultado}</p>}
      {(erro ?? aviso) && (
        <p className="erro" role="alert">
          {erro ?? aviso}
        </p>
      )}

      <section className="bloco">
        <h2 className="titulo-bloco">
          Tarefas · {projeto.tarefas_abertas} abertas, {projeto.tarefas_feitas} feitas
        </h2>
        {tarefas.length > 0 && <Lista tarefas={tarefas} aoMarcar={aoMarcar} aoAbrir={aoAbrir} />}
        <Captura rotulo="Nova tarefa deste projeto" aoCriar={aoCriar} />
      </section>

      <section className="bloco">
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
        <div className="botoes">
          {projeto.estado === 'ativo' ? (
            <>
              <button type="button" className="botao" onClick={() => mudarEstado('concluido')}>
                Concluir projeto
              </button>
              <button type="button" className="botao" onClick={() => mudarEstado('pausado')}>
                Pausar
              </button>
            </>
          ) : (
            <button type="button" className="botao" onClick={() => mudarEstado('ativo')}>
              Reativar projeto
            </button>
          )}
        </div>
      </section>
    </>
  )
}
