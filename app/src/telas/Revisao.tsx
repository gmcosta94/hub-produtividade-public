import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { hoje, inicioDaSemana, intervaloDaSemana, somarDias } from '../lib/datas'
import { mensagemDaFuncao, textoDoErro, useConsulta, type Ir, type Tela } from '../lib/dados'

type Observacao = { area: string; texto: string; evidencia: string }
type Revisao = { id: number; semana: string; leitura: string; observacoes: Observacao[]; criado_em: string }
type TipoDeProposta =
  | 'peso_do_habito'
  | 'meta_do_habito'
  | 'nivel_do_objetivo'
  | 'estado_do_projeto'
  | 'modo_da_area'
  | 'livre'
  | 'para_o_ciclo'
export type Proposta = {
  id: number
  revisao_id: number | null
  tipo: TipoDeProposta
  texto: string
  motivo: string | null
  estado: 'pendente' | 'aceita' | 'recusada'
}

// Onde a mudança de cada tipo aparece, para conferir depois de aceitar.
const TELA_DO_TIPO: Partial<Record<TipoDeProposta, Tela>> = {
  peso_do_habito: 'habitos',
  meta_do_habito: 'habitos',
  nivel_do_objetivo: 'plano',
  estado_do_projeto: 'tarefas',
  modo_da_area: 'areas',
}

const quando = (instante: string) =>
  new Date(instante).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// A revisão da semana feita pelo assistente: lê o hub, observa e propõe.
// Nada muda no hub sem um "aceitar".
export function RevisaoDaSemana({ ir }: { ir: Ir }) {
  const estaSemana = inicioDaSemana(hoje())
  const [semana, setSemana] = useState(estaSemana)
  const [pedindo, setPedindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const revisao = useConsulta<Revisao | null>(
    () =>
      supabase
        .from('revisao')
        .select('id, semana, leitura, observacoes, criado_em')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
  )
  const propostas = useConsulta<Proposta[]>(
    () =>
      supabase
        .from('proposta')
        .select('id, revisao_id, tipo, texto, motivo, estado')
        .not('revisao_id', 'is', null)
        .order('id'),
  )

  async function pedir() {
    setPedindo(true)
    setErro(null)
    const { error } = await supabase.functions.invoke('assistente', { body: { semana } })
    setPedindo(false)
    if (error) return setErro(await mensagemDaFuncao(error, 'Não foi possível fazer a revisão. Tente de novo.'))
    revisao.recarregar()
    propostas.recarregar()
  }

  const atual = revisao.dados
  const todas = propostas.dados ?? []
  const daRevisao = atual ? todas.filter((p) => p.revisao_id === atual.id) : []
  const anteriores = todas.filter((p) => p.estado === 'pendente' && p.revisao_id !== atual?.id)

  return (
    <section className="bloco">
      <h2 className="titulo-bloco">Revisão da semana</h2>
      <div className="cartao">
        <p className="ajuda">Até três observações e três propostas sobre a semana. Leva até um minuto.</p>
        <div className="segmentos" role="radiogroup" aria-label="Semana da revisão">
          {[
            [estaSemana, 'Esta semana'],
            [somarDias(estaSemana, -7), 'Semana passada'],
          ].map(([valor, nome]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={semana === valor}
              className={semana === valor ? 'ativo' : undefined}
              onClick={() => setSemana(valor)}
            >
              {nome}
            </button>
          ))}
        </div>
        <div className="botoes">
          <button type="button" className="botao principal" disabled={pedindo} onClick={pedir}>
            {pedindo ? 'Lendo a semana…' : 'Pedir a revisão'}
          </button>
        </div>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
      </div>

      {atual && (
        <div className="cartao revisao">
          <p className="destaque-linha">
            Semana de {intervaloDaSemana(atual.semana)}
            <small>feita em {quando(atual.criado_em)}</small>
          </p>
          <p>{atual.leitura}</p>
          {atual.observacoes.length > 0 && (
            <ul className="observacoes">
              {atual.observacoes.map((o, i) => (
                <li key={i}>
                  <span>
                    {o.area && <small className="chip neutro">{o.area}</small>} {o.texto}
                  </span>
                  <small className="ajuda">Base: {o.evidencia}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {atual && daRevisao.length === 0 && <p className="vazio pequeno">Nenhuma proposta nesta revisão.</p>}
      <ListaDePropostas
        titulo="Propostas"
        propostas={daRevisao.filter((p) => p.tipo !== 'para_o_ciclo')}
        ir={ir}
        aoMudar={propostas.recarregar}
      />
      <ListaDePropostas
        titulo="Para a revisão do ciclo"
        propostas={daRevisao.filter((p) => p.tipo === 'para_o_ciclo')}
        ir={ir}
        aoMudar={propostas.recarregar}
      />
      <ListaDePropostas titulo="De revisões anteriores, sem decisão" propostas={anteriores} ir={ir} aoMudar={propostas.recarregar} />

      <details className="processo">
        <summary>Usar o Claude numa conversa à parte</summary>
        <CopiarSemana />
      </details>
    </section>
  )
}

export function ListaDePropostas({
  titulo,
  propostas,
  ir,
  aoMudar,
}: {
  titulo: string
  propostas: Proposta[]
  ir: Ir
  aoMudar: () => void
}) {
  if (propostas.length === 0) return null
  return (
    <>
      <h3 className="titulo-bloco">{titulo}</h3>
      <ul className="lista">
        {propostas.map((p) => (
          <ItemDeProposta key={p.id} proposta={p} ir={ir} aoMudar={aoMudar} />
        ))}
      </ul>
    </>
  )
}

function ItemDeProposta({ proposta, ir, aoMudar }: { proposta: Proposta; ir: Ir; aoMudar: () => void }) {
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const anotacao = proposta.tipo === 'livre' || proposta.tipo === 'para_o_ciclo'
  const tela = TELA_DO_TIPO[proposta.tipo]

  async function decidir(aceitar: boolean) {
    const { error } = await supabase.rpc('decidir_proposta', {
      p_id: proposta.id,
      p_aceitar: aceitar,
      p_motivo: aceitar ? null : motivo,
    })
    if (error) return setErro(textoDoErro(error, 'Não foi possível registrar a decisão.'))
    setErro(null)
    setRecusando(false)
    aoMudar()
  }

  return (
    <li className="proposta">
      <div className="item">
        <span className={proposta.estado === 'recusada' ? 'riscado' : undefined}>{proposta.texto}</span>
        {proposta.motivo && <small>{proposta.motivo}</small>}
        {proposta.estado === 'aceita' && (
          <small>
            {anotacao ? 'Anotado.' : 'Aceita e aplicada.'}{' '}
            {tela && (
              <button type="button" className="link" onClick={() => ir({ tela })}>
                Ver
              </button>
            )}
          </small>
        )}
        {proposta.estado === 'recusada' && <small>{anotacao ? 'Descartada.' : 'Recusada.'}</small>}
        {erro && <small className="erro">{erro}</small>}
        {proposta.estado === 'pendente' && !recusando && (
          <div className="botoes">
            <button type="button" className="botao principal" onClick={() => decidir(true)}>
              {anotacao ? 'Anotar' : 'Aceitar'}
            </button>
            <button type="button" className="botao" onClick={() => setRecusando(true)}>
              {anotacao ? 'Descartar' : 'Recusar'}
            </button>
          </div>
        )}
        {recusando && (
          <div className="captura">
            <input
              aria-label="Por que não (opcional)"
              placeholder="Por que não (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <button type="button" onClick={() => decidir(false)}>
              Confirmar
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

// A semana inteira num texto só, para colar numa conversa com o Claude.
function CopiarSemana() {
  const [texto, setTexto] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function copiar() {
    const { data, error } = await supabase.rpc('revisao_da_semana')
    if (error || !data) return setAviso('Não foi possível montar a semana.')
    const json = JSON.stringify(data, null, 2)
    setTexto(json)
    try {
      await navigator.clipboard.writeText(json)
      setAviso('Copiado. Cole numa conversa com o Claude e peça a revisão da semana.')
    } catch {
      setAviso('Não deu para copiar sozinho. Selecione o texto abaixo e copie.')
    }
  }

  return (
    <div className="bloco">
      <div className="botoes">
        <button type="button" className="botao" onClick={copiar}>
          Copiar a semana
        </button>
      </div>
      {aviso && <p className="ajuda">{aviso}</p>}
      {texto && <textarea readOnly rows={6} value={texto} aria-label="Dados da semana" />}
    </div>
  )
}
