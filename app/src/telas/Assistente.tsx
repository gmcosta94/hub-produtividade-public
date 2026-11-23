import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Texto } from '../componentes/Texto'
import { mensagemDaFuncao, useConsulta, type Ir } from '../lib/dados'
import { ListaDePropostas, RevisaoDaSemana, type Proposta } from './Revisao'

type Conversa = { id: number; titulo: string; atualizado_em: string }
type Mensagem = { id: number; papel: 'usuario' | 'assistente'; texto: string; leituras: string[] | null }

const SUGESTOES = ['Como foi minha semana até agora?', 'Como anda a área Saúde?', 'O que eu posso tirar do meu plano?']

const quando = (instante: string) =>
  new Date(instante).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// A tela do assistente: conversar com ele e pedir a revisão da semana.
export function Assistente({ conversaId, ir }: { conversaId?: number; ir: Ir }) {
  if (conversaId !== undefined) return <PaginaDaConversa id={conversaId} ir={ir} />
  return (
    <main>
      <h1 className="titulo-tela">Assistente</h1>
      <p className="ajuda">Ele lê o hub para responder e pode deixar propostas. Nada muda sem você aceitar.</p>
      <div className="colunas">
        <div className="coluna">
          <NovaConversa ir={ir} />
          <ConversasAnteriores ir={ir} />
        </div>
        <div className="coluna">
          <RevisaoDaSemana ir={ir} />
        </div>
      </div>
    </main>
  )
}

// Envia uma pergunta. Sem conversa, abre uma nova. Devolve o id da conversa.
async function perguntar(texto: string, conversaId?: number): Promise<{ id?: number; erro?: string }> {
  const { data, error } = await supabase.functions.invoke('conversa', {
    body: conversaId === undefined ? { texto } : { texto, conversa_id: conversaId },
  })
  if (error) return { erro: await mensagemDaFuncao(error, 'Não foi possível falar com o assistente. Tente de novo.') }
  return { id: data?.conversa_id }
}

function NovaConversa({ ir }: { ir: Ir }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(pergunta: string) {
    if (!pergunta.trim() || enviando) return
    setEnviando(true)
    setErro(null)
    const r = await perguntar(pergunta.trim())
    setEnviando(false)
    if (r.erro) return setErro(r.erro)
    if (r.id) ir({ tela: 'assistente', id: r.id })
  }

  return (
    <section className="bloco">
      <h2 className="titulo-bloco">Nova conversa</h2>
      <CaixaDePergunta texto={texto} aoMudar={setTexto} enviando={enviando} aoEnviar={() => enviar(texto)} />
      {!enviando && (
        <div className="sugestoes">
          {SUGESTOES.map((s) => (
            <button key={s} type="button" className="chip-botao" onClick={() => enviar(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {enviando && <p className="ajuda">Lendo o hub para responder… pode levar até um minuto.</p>}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  )
}

function CaixaDePergunta({
  texto,
  aoMudar,
  enviando,
  aoEnviar,
}: {
  texto: string
  aoMudar: (t: string) => void
  enviando: boolean
  aoEnviar: () => void
}) {
  function enviar(e: FormEvent) {
    e.preventDefault()
    aoEnviar()
  }
  return (
    <form className="pergunta" onSubmit={enviar}>
      <textarea
        aria-label="Pergunta para o assistente"
        placeholder="Pergunte sobre a sua semana, uma área, um projeto…"
        rows={2}
        value={texto}
        disabled={enviando}
        onChange={(e) => aoMudar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            aoEnviar()
          }
        }}
      />
      <button type="submit" className="botao principal" disabled={enviando || !texto.trim()}>
        {enviando ? 'Pensando…' : 'Perguntar'}
      </button>
    </form>
  )
}

function ConversasAnteriores({ ir }: { ir: Ir }) {
  const conversas = useConsulta<Conversa[]>(() =>
    supabase
      .from('conversa')
      .select('id, titulo, atualizado_em')
      .order('atualizado_em', { ascending: false })
      .limit(10),
  )
  const lista = conversas.dados ?? []
  if (lista.length === 0) return null
  return (
    <section className="bloco">
      <h2 className="titulo-bloco">Conversas anteriores</h2>
      <ul className="lista">
        {lista.map((c) => (
          <li key={c.id}>
            <button type="button" className="item" onClick={() => ir({ tela: 'assistente', id: c.id })}>
              <span>{c.titulo}</span>
              <small>{quando(c.atualizado_em)}</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PaginaDaConversa({ id, ir }: { id: number; ir: Ir }) {
  const conversa = useConsulta<Conversa | null>(
    () => supabase.from('conversa').select('id, titulo, atualizado_em').eq('id', id).maybeSingle(),
    [id],
  )
  const mensagens = useConsulta<Mensagem[]>(
    () => supabase.from('mensagem').select('id, papel, texto, leituras').eq('conversa_id', id).order('id'),
    [id],
  )
  const propostas = useConsulta<Proposta[]>(
    () =>
      supabase.from('proposta').select('id, revisao_id, tipo, texto, motivo, estado').eq('conversa_id', id).order('id'),
    [id],
  )
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar() {
    const pergunta = texto.trim()
    if (!pergunta || enviando) return
    setEnviando(pergunta)
    setTexto('')
    setErro(null)
    const r = await perguntar(pergunta, id)
    setEnviando(null)
    if (r.erro) {
      setTexto(pergunta)
      return setErro(r.erro)
    }
    mensagens.recarregar()
    propostas.recarregar()
  }

  if (conversa.carregou && !conversa.dados) {
    return (
      <main>
        <p className="vazio">Conversa não encontrada.</p>
      </main>
    )
  }

  return (
    <main className="estreito">
      <button type="button" className="link voltar" onClick={() => ir({ tela: 'assistente' })}>
        ‹ Assistente
      </button>
      <h1 className="titulo-tela">{conversa.dados?.titulo ?? ''}</h1>

      <div className="conversa">
        {(mensagens.dados ?? []).map((m) =>
          m.papel === 'usuario' ? (
            <p key={m.id} className="fala usuario">
              {m.texto}
            </p>
          ) : (
            <div key={m.id} className="fala assistente">
              <Texto fonte={m.texto} />
              {m.leituras && m.leituras.length > 0 && <small className="ajuda">Leu: {m.leituras.join(' · ')}</small>}
            </div>
          ),
        )}
        {enviando && (
          <>
            <p className="fala usuario">{enviando}</p>
            <p className="fala assistente ajuda">Lendo o hub para responder… pode levar até um minuto.</p>
          </>
        )}
      </div>

      <ListaDePropostas
        titulo="Propostas desta conversa"
        propostas={propostas.dados ?? []}
        ir={ir}
        aoMudar={propostas.recarregar}
      />

      <section className="bloco">
        <CaixaDePergunta texto={texto} aoMudar={setTexto} enviando={enviando !== null} aoEnviar={enviar} />
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
      </section>
    </main>
  )
}
