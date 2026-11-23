import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Texto } from './Texto'
import { textoDoErro, useConsulta } from '../lib/dados'

type Tipo = 'pilar' | 'processo' | 'limite' | 'plano' | 'regra'
type Estrategia = { id: number; titulo: string; tipo: Tipo; corpo: string | null }
type Versao = { id: number; motivo: string | null; criado_em: string }
type HabitoCurto = { id: number; nome: string; estrategia_id: number | null; area_id: number }

// Os textos de uma área, lidos como um documento só: cada tópico abre e fecha
// pelo título. Na área Sistema eles formam a Constituição, e mudar um texto é
// uma emenda, com motivo.
export function Estrategias({ areaId, constituicao, abrirId }: { areaId: number; constituicao: boolean; abrirId?: number }) {
  const textos = useConsulta<Estrategia[]>(
    () => supabase.from('estrategia').select('id, titulo, tipo, corpo').eq('area_id', areaId).eq('ativa', true).order('ordem').order('id'),
    [areaId],
  )
  const habitos = useConsulta<HabitoCurto[]>(() =>
    supabase.from('habito').select('id, nome, estrategia_id, area_id').eq('ativo', true).order('ordem'),
  )
  // null = ainda não decidido: abre o pedido, ou o primeiro na Constituição, ou todos numa área.
  const [abertos, setAbertos] = useState<Set<number> | null>(null)
  const [criando, setCriando] = useState(false)
  const lista = textos.dados ?? []
  const abertosAgora =
    abertos ??
    new Set(abrirId !== undefined ? [abrirId] : constituicao ? lista.slice(0, 1).map((x) => x.id) : lista.map((x) => x.id))

  function alternar(id: number) {
    const novo = new Set(abertosAgora)
    if (novo.has(id)) novo.delete(id)
    else novo.add(id)
    setAbertos(novo)
  }

  if (criando) {
    return (
      <NovoTexto
        areaId={areaId}
        constituicao={constituicao}
        aoCancelar={() => setCriando(false)}
        aoCriar={(id) => {
          textos.recarregar()
          setCriando(false)
          setAbertos(new Set([...abertosAgora, id]))
        }}
      />
    )
  }

  const todosAbertos = lista.length > 0 && lista.every((x) => abertosAgora.has(x.id))

  return (
    <>
      {textos.carregou && lista.length === 0 && (
        <p className="vazio pequeno">{constituicao ? 'A Constituição ainda não tem textos.' : 'Esta área ainda não tem estratégia escrita.'}</p>
      )}
      {lista.length > 1 && (
        <p className="acoes-do-documento">
          <button
            type="button"
            className="link"
            onClick={() => setAbertos(todosAbertos ? new Set() : new Set(lista.map((x) => x.id)))}
          >
            {todosAbertos ? 'Fechar todos os tópicos' : 'Abrir todos os tópicos'}
          </button>
        </p>
      )}
      {lista.length > 0 && (
        <div className="documento">
          {lista.map((x) => (
            <Topico
              key={x.id}
              texto={x}
              aberto={abertosAgora.has(x.id)}
              aoAlternar={() => alternar(x.id)}
              areaId={areaId}
              constituicao={constituicao}
              habitos={habitos.dados ?? []}
              aoMudar={textos.recarregar}
              aoMudarHabitos={habitos.recarregar}
            />
          ))}
        </div>
      )}
      <p>
        <button type="button" className="botao" onClick={() => setCriando(true)}>
          {constituicao ? 'Novo texto' : 'Nova estratégia'}
        </button>
      </p>
    </>
  )
}

function Topico({
  texto,
  aberto,
  aoAlternar,
  areaId,
  constituicao,
  habitos,
  aoMudar,
  aoMudarHabitos,
}: {
  texto: Estrategia
  aberto: boolean
  aoAlternar: () => void
  areaId: number
  constituicao: boolean
  habitos: HabitoCurto[]
  aoMudar: () => void
  aoMudarHabitos: () => void
}) {
  const versoes = useConsulta<Versao[]>(
    () => supabase.from('estrategia_versao').select('id, motivo, criado_em').eq('estrategia_id', texto.id).order('criado_em', { ascending: false }),
    [texto.id],
  )
  const [painel, setPainel] = useState<'historico' | 'habitos' | null>(null)
  const [editando, setEditando] = useState(false)
  const [corpo, setCorpo] = useState(texto.corpo ?? '')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  // Preencher um texto vazio não é emenda.
  const pedeMotivo = constituicao && Boolean(texto.corpo?.trim())
  const ligados = habitos.filter((h) => h.estrategia_id === texto.id)
  const livres = habitos.filter((h) => h.estrategia_id === null && (constituicao || h.area_id === areaId))
  const emendas = versoes.dados ?? []

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (pedeMotivo && !motivo.trim()) return setErro('Escreva o motivo da emenda.')
    const { error } = await supabase.rpc('emendar_estrategia', {
      p_id: texto.id,
      p_corpo: corpo,
      p_motivo: motivo.trim() || null,
    })
    if (error) return setErro(textoDoErro(error, 'Não foi possível salvar o texto.'))
    setErro(null)
    setMotivo('')
    setEditando(false)
    aoMudar()
    versoes.recarregar()
  }

  async function ligar(habitoId: number, estrategiaId: number | null) {
    const { error } = await supabase.from('habito').update({ estrategia_id: estrategiaId }).eq('id', habitoId)
    setErro(error ? 'Não foi possível ligar o hábito.' : null)
    aoMudarHabitos()
  }

  const alternarPainel = (p: 'historico' | 'habitos') => setPainel(painel === p ? null : p)

  return (
    <section className={aberto ? 'topico aberto' : 'topico'}>
      <h3>
        <button type="button" aria-expanded={aberto} onClick={aoAlternar}>
          <span className="seta" aria-hidden="true">
            ›
          </span>
          {texto.titulo}
        </button>
      </h3>
      {aberto && (
        <div className="corpo-do-topico">
          {editando ? (
            <form onSubmit={salvar} className="edicao">
              <label>
                Texto (Markdown)
                <textarea rows={14} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
              </label>
              {pedeMotivo && (
                <label>
                  Motivo da emenda
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que esta regra muda agora" />
                </label>
              )}
              {erro && <p className="erro">{erro}</p>}
              <div className="acoes">
                <button
                  type="button"
                  onClick={() => {
                    setCorpo(texto.corpo ?? '')
                    setEditando(false)
                    setErro(null)
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="principal">
                  {pedeMotivo ? 'Registrar emenda' : 'Salvar'}
                </button>
              </div>
            </form>
          ) : (
            <>
              {texto.corpo?.trim() ? <Texto fonte={texto.corpo} /> : <p className="ajuda">Texto ainda vazio.</p>}
              <p className="rodape-do-topico">
                <button type="button" className="link" onClick={() => setEditando(true)}>
                  {pedeMotivo ? 'Emendar' : 'Editar'}
                </button>
                {emendas.length > 0 && (
                  <button type="button" className="link" onClick={() => alternarPainel('historico')}>
                    Histórico de emendas ({emendas.length})
                  </button>
                )}
                {(ligados.length > 0 || livres.length > 0) && (
                  <button type="button" className="link" onClick={() => alternarPainel('habitos')}>
                    Hábitos ligados ({ligados.length})
                  </button>
                )}
              </p>
              {erro && <p className="erro">{erro}</p>}
              {painel === 'historico' && (
                <ul className="lista">
                  {emendas.map((v) => (
                    <li key={v.id}>
                      <span className="item">
                        <span>{v.motivo ?? 'Sem motivo registrado'}</span>
                        <small>{new Date(v.criado_em).toLocaleDateString('pt-BR')}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {painel === 'habitos' && (
                <>
                  {ligados.length > 0 && (
                    <ul className="lista">
                      {ligados.map((h) => (
                        <li key={h.id}>
                          <span className="item">{h.nome}</span>
                          <button type="button" className="link" onClick={() => ligar(h.id, null)}>
                            desligar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {livres.length > 0 && (
                    <select
                      className="campo"
                      aria-label="Ligar um hábito a este texto"
                      value=""
                      onChange={(e) => e.target.value && ligar(Number(e.target.value), texto.id)}
                    >
                      <option value="">Ligar um hábito que segue este texto…</option>
                      {livres.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.nome}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function NovoTexto({
  areaId,
  constituicao,
  aoCancelar,
  aoCriar,
}: {
  areaId: number
  constituicao: boolean
  aoCancelar: () => void
  aoCriar: (id: number) => void
}) {
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<Tipo>(constituicao ? 'processo' : 'plano')
  const [corpo, setCorpo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) return setErro('Dê um título ao texto.')
    const { data, error } = await supabase
      .from('estrategia')
      .insert({ area_id: areaId, titulo: titulo.trim(), tipo, corpo })
      .select('id')
      .single()
    if (error || !data) return setErro(textoDoErro(error, 'Não foi possível criar o texto.'))
    aoCriar(data.id)
  }

  return (
    <div className="cartao">
      <form onSubmit={salvar}>
        <label>
          Título
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
            <option value="pilar">Pilar: um princípio</option>
            <option value="processo">Processo: um passo a passo</option>
            <option value="limite">Limite: um teto</option>
            <option value="plano">Plano: o que fazer nesta área</option>
            <option value="regra">Regra: uma decisão já tomada</option>
          </select>
        </label>
        <label>
          Texto (Markdown)
          <textarea rows={12} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <div className="acoes">
          <button type="button" onClick={aoCancelar}>
            Cancelar
          </button>
          <button type="submit" className="principal">
            Criar
          </button>
        </div>
      </form>
    </div>
  )
}
