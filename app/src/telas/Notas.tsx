import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Texto } from '../componentes/Texto'
import { textoDoErro, useAreas, useConsulta, type Ir } from '../lib/dados'

type Categoria = 'projeto' | 'area' | 'recurso' | 'arquivo'
type Resumo = {
  id: number
  titulo: string
  area: string | null
  projeto: string | null
  categoria: Categoria
  trecho: string
}
type Nota = {
  id: number
  titulo: string
  corpo: string
  area_id: number | null
  projeto_id: number | null
  arquivada: boolean
}
type ProjetoCurto = { id: number; nome: string; area: string; area_id: number }

// As quatro gavetas do PARA. A gaveta sai das ligações da nota, não de uma pasta.
const GAVETAS: { id: Categoria; nome: string; vazio: string }[] = [
  { id: 'projeto', nome: 'Projetos', vazio: 'Nenhuma nota ligada a projeto.' },
  { id: 'area', nome: 'Áreas', vazio: 'Nenhuma nota ligada só a uma área.' },
  { id: 'recurso', nome: 'Recursos', vazio: 'Nenhuma nota solta.' },
  { id: 'arquivo', nome: 'Arquivo', vazio: 'Nada arquivado.' },
]

export function Notas({ notaId, ir }: { notaId?: number; ir: Ir }) {
  const [criando, setCriando] = useState(false)
  const [gaveta, setGaveta] = useState<Categoria | 'todas'>('todas')
  const [busca, setBusca] = useState('')
  const notas = useConsulta<Resumo[]>(() =>
    supabase
      .from('v_nota')
      .select('id, titulo, area, projeto, categoria, trecho')
      .order('atualizado_em', { ascending: false }),
  )

  // No celular, a lista ou a nota. No computador, as duas lado a lado.
  const aberta = notaId !== undefined || criando

  const termo = busca.trim().toLowerCase()
  const visiveis = (notas.dados ?? []).filter(
    (n) =>
      (gaveta === 'todas' ? n.categoria !== 'arquivo' : n.categoria === gaveta) &&
      (!termo || `${n.titulo} ${n.trecho} ${n.projeto ?? ''} ${n.area ?? ''}`.toLowerCase().includes(termo)),
  )

  return (
    <main className="notas">
      <div className={aberta ? 'lista-detalhe com-nota' : 'lista-detalhe'}>
        <div className="lado-lista">
          <h1 className="titulo-tela">Notas</h1>
          <div className="captura">
            <input
              aria-label="Buscar nas notas"
              placeholder="Buscar"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <button type="button" onClick={() => setCriando(true)}>
              Nova nota
            </button>
          </div>
          <div className="segmentos espacado" role="tablist">
            {[{ id: 'todas' as const, nome: 'Todas' }, ...GAVETAS].map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={gaveta === g.id}
                className={gaveta === g.id ? 'ativo' : undefined}
                onClick={() => setGaveta(g.id)}
              >
                {g.nome}
              </button>
            ))}
          </div>
          {notas.carregou && visiveis.length === 0 && (
            <p className="vazio pequeno">
              {termo
                ? 'Nenhuma nota com esse termo.'
                : (GAVETAS.find((g) => g.id === gaveta)?.vazio ?? 'Nenhuma nota ainda.')}
            </p>
          )}
          {visiveis.length > 0 && (
            <ul className="lista bloco">
              {visiveis.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={n.id === notaId ? 'item selecionado' : 'item'}
                    onClick={() => {
                      setCriando(false)
                      ir({ tela: 'notas', id: n.id })
                    }}
                  >
                    <span>{n.titulo}</span>
                    <small>
                      {[n.projeto ? `Projeto: ${n.projeto}` : n.area, n.trecho.replace(/\s+/g, ' ').slice(0, 70)]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="lado-detalhe">
          {aberta ? (
            <PaginaDaNota
              key={notaId ?? 'nova'}
              id={notaId}
              ir={ir}
              aoSair={() => (notaId === undefined ? setCriando(false) : ir({ tela: 'notas' }))}
            />
          ) : (
            <p className="vazio">Escolha uma nota na lista ou crie uma nova.</p>
          )}
        </div>
      </div>
    </main>
  )
}

function PaginaDaNota({ id, ir, aoSair }: { id?: number; ir: Ir; aoSair: () => void }) {
  const nota = useConsulta<Nota | null>(
    () =>
      id === undefined
        ? Promise.resolve({ data: null, error: null })
        : supabase.from('nota').select('id, titulo, corpo, area_id, projeto_id, arquivada').eq('id', id).maybeSingle(),
    [id],
  )
  const [editando, setEditando] = useState(id === undefined)

  if (!nota.carregou) return null
  if (id !== undefined && !nota.dados) return <p className="vazio">Nota não encontrada.</p>

  if (editando) {
    return (
      <EditorDaNota
        nota={nota.dados}
        aoCancelar={() => (id === undefined ? aoSair() : setEditando(false))}
        aoSalvar={(novoId) => {
          if (id === undefined) return ir({ tela: 'notas', id: novoId })
          nota.recarregar()
          setEditando(false)
        }}
      />
    )
  }
  return (
    <LeituraDaNota
      nota={nota.dados!}
      ir={ir}
      aoSair={aoSair}
      aoEditar={() => setEditando(true)}
      aoMudar={nota.recarregar}
    />
  )
}

function LeituraDaNota({
  nota,
  ir,
  aoSair,
  aoEditar,
  aoMudar,
}: {
  nota: Nota
  ir: Ir
  aoSair: () => void
  aoEditar: () => void
  aoMudar: () => void
}) {
  const areas = useAreas()
  const projeto = useConsulta<ProjetoCurto | null>(
    () =>
      nota.projeto_id === null
        ? Promise.resolve({ data: null, error: null })
        : supabase.from('v_projeto').select('id, nome, area, area_id').eq('id', nota.projeto_id).maybeSingle(),
    [nota.projeto_id],
  )
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const area = areas.find((a) => a.id === nota.area_id)

  async function arquivar() {
    const { error } = await supabase.from('nota').update({ arquivada: !nota.arquivada }).eq('id', nota.id)
    setErro(error ? 'Não foi possível mudar a nota.' : null)
    aoMudar()
  }

  async function apagar() {
    const { error } = await supabase.from('nota').delete().eq('id', nota.id)
    if (error) return setErro('Não foi possível apagar a nota.')
    ir({ tela: 'notas' })
  }

  return (
    <>
      <button type="button" className="link voltar" onClick={aoSair}>
        ‹ Notas
      </button>
      <h1 className="titulo-tela">{nota.titulo}</h1>
      <p className="ajuda">
        {projeto.dados && (
          <>
            Projeto{' '}
            <button type="button" className="link" onClick={() => ir({ tela: 'tarefas', id: projeto.dados!.id })}>
              {projeto.dados.nome}
            </button>
            {' · '}
          </>
        )}
        {area ? (
          <button type="button" className="link" onClick={() => ir({ tela: 'areas', id: area.id })}>
            {area.nome}
          </button>
        ) : (
          !projeto.dados && 'Recurso, sem área nem projeto'
        )}
        {nota.arquivada && ' · arquivada'}
      </p>
      <div className="cartao">
        {nota.corpo.trim() ? <Texto fonte={nota.corpo} /> : <p className="ajuda">Nota vazia.</p>}
      </div>
      {erro && <p className="erro">{erro}</p>}
      <div className="botoes bloco">
        <button type="button" className="botao principal" onClick={aoEditar}>
          Editar
        </button>
        <button type="button" className="botao" onClick={arquivar}>
          {nota.arquivada ? 'Tirar do arquivo' : 'Arquivar'}
        </button>
        {confirmando ? (
          <button type="button" className="botao perigo" onClick={apagar}>
            Apagar de vez
          </button>
        ) : (
          <button type="button" className="botao" onClick={() => setConfirmando(true)}>
            Apagar
          </button>
        )}
      </div>
    </>
  )
}

function EditorDaNota({
  nota,
  aoCancelar,
  aoSalvar,
}: {
  nota: Nota | null
  aoCancelar: () => void
  aoSalvar: (id: number) => void
}) {
  const areas = useAreas()
  const projetos = useConsulta<ProjetoCurto[]>(() =>
    supabase.from('v_projeto').select('id, nome, area, area_id').neq('estado', 'concluido').order('nome'),
  )
  const [titulo, setTitulo] = useState(nota?.titulo ?? '')
  const [corpo, setCorpo] = useState(nota?.corpo ?? '')
  const [projetoId, setProjetoId] = useState<number | null>(nota?.projeto_id ?? null)
  const [areaId, setAreaId] = useState<number | null>(nota?.area_id ?? null)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const campos = { titulo, corpo, projeto_id: projetoId, area_id: areaId }
    const resposta = nota
      ? await supabase.from('nota').update(campos).eq('id', nota.id).select('id').single()
      : await supabase.from('nota').insert(campos).select('id').single()
    if (resposta.error || !resposta.data) return setErro(textoDoErro(resposta.error, 'Não foi possível salvar a nota.'))
    aoSalvar(resposta.data.id)
  }

  return (
    <div className="cartao">
      <form onSubmit={salvar}>
        <label>
          Título
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label>
          Projeto
          <select
            value={projetoId ?? ''}
            onChange={(e) => setProjetoId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sem projeto</option>
            {(projetos.dados ?? []).map((p) => (
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
              <option value="">Sem área (recurso)</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Texto (aceita Markdown: títulos com #, listas com - e **negrito**)
          <textarea rows={14} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <div className="acoes">
          <button type="button" onClick={aoCancelar}>
            Cancelar
          </button>
          <button type="submit" className="principal">
            Salvar
          </button>
        </div>
      </form>
    </div>
  )
}
