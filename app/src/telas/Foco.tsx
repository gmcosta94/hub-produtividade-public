import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Folha } from '../componentes/Folha'
import { Texto } from '../componentes/Texto'
import { hoje, inicioDaSemana, porExtenso, type Dia } from '../lib/datas'
import { cronometro, duracao, hora, lerNumero } from '../lib/formato'

type Tipo = 'foco' | 'estudo'

// Vem de v_sessao: "profunda" (atingiu a duração mínima) é decidido pelo banco.
type Sessao = {
  id: number
  tipo: Tipo
  data: Dia
  inicio: string | null
  duracao_min: number | null
  titulo: string | null
  resultado: string | null
  area: string | null
  profunda: boolean
}
type TotalDaSemana = { tipo: Tipo; minutos: number; minutos_profundos: number }
type Area = { id: number; nome: string }

const CAMPOS = 'id, tipo, data, inicio, duracao_min, titulo, resultado, area, profunda'
const NOME_DO_TIPO: Record<Tipo, string> = { foco: 'Foco', estudo: 'Estudo' }
// Área sugerida para cada tipo; dá para trocar antes de iniciar.
const AREA_PADRAO: Record<Tipo, string> = { foco: 'Carreira', estudo: 'Estudos' }

export function Foco({ embutido = false, aoVerHistorico }: { embutido?: boolean; aoVerHistorico?: () => void }) {
  const Raiz = embutido ? 'section' : 'main'
  const diaDeHoje = hoje()

  const [areas, setAreas] = useState<Area[]>([])
  const [processo, setProcesso] = useState<string | null>(null)
  const [andamento, setAndamento] = useState<Sessao | null>(null)
  const [sessoes, setSessoes] = useState<Sessao[] | null>(null)
  const [semana, setSemana] = useState<TotalDaSemana[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [lancando, setLancando] = useState(false)

  useEffect(() => {
    let cancelado = false
    Promise.all([
      supabase.from('area').select('id, nome').eq('tipo', 'vida').eq('ativa', true).order('ordem'),
      supabase.from('estrategia').select('corpo').eq('chave', 'sessao_de_foco').maybeSingle(),
    ]).then(([a, p]) => {
      if (cancelado) return
      setAreas((a.data ?? []) as Area[])
      setProcesso(p.data?.corpo || null)
    })
    return () => {
      cancelado = true
    }
  }, [])

  const carregar = useCallback(() => {
    let cancelado = false
    Promise.all([
      supabase.from('v_sessao').select(CAMPOS).eq('em_andamento', true).maybeSingle(),
      supabase.from('v_sessao').select(CAMPOS).eq('data', diaDeHoje).eq('em_andamento', false).order('criado_em'),
      supabase.from('v_foco_semana').select('tipo, minutos, minutos_profundos').eq('semana', inicioDaSemana(diaDeHoje)),
    ]).then(([a, s, t]) => {
      if (cancelado) return
      if (a.error || s.error || t.error) {
        setErro('Não foi possível carregar as sessões.')
        setSessoes([])
        return
      }
      setAndamento(a.data as Sessao | null)
      setSessoes(s.data as Sessao[])
      setSemana(t.data as TotalDaSemana[])
    })
    return () => {
      cancelado = true
    }
  }, [diaDeHoje])

  useEffect(() => carregar(), [carregar])

  // Roda uma chamada ao banco, mostra o erro se houver e recarrega a tela.
  async function executar(chamada: PromiseLike<{ error: unknown }>, falha: string): Promise<boolean> {
    setErro(null)
    const { error } = await chamada
    if (error) setErro(falha)
    carregar()
    return !error
  }

  async function apagar(s: Sessao) {
    if (!window.confirm('Apagar esta sessão?')) return
    await executar(supabase.from('registro').delete().eq('id', s.id), 'Não foi possível apagar a sessão.')
  }

  if (sessoes === null) return null

  const minutosDeHoje = (tipo: Tipo) =>
    sessoes.filter((s) => s.tipo === tipo).reduce((soma, s) => soma + (s.duracao_min ?? 0), 0)
  const daSemana = (tipo: Tipo) => semana.find((t) => t.tipo === tipo)
  const focoDaSemana = daSemana('foco')

  return (
    <Raiz className="foco">
      {embutido ? (
        <h2 className="titulo-bloco">Sessão de foco</h2>
      ) : (
        <h1 className="titulo-tela">{porExtenso(diaDeHoje)}</h1>
      )}

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {andamento ? (
        <EmAndamento
          key={andamento.id}
          sessao={andamento}
          aoEncerrar={(resultado, minutos) =>
            executar(
              supabase.rpc('encerrar_sessao', {
                p_id: andamento.id,
                p_resultado: resultado,
                p_duracao_min: minutos,
              }),
              'Não foi possível encerrar a sessão. Tente de novo.',
            )
          }
          aoDescartar={() =>
            executar(supabase.from('registro').delete().eq('id', andamento.id), 'Não foi possível descartar a sessão.')
          }
        />
      ) : (
        <NovaSessao
          areas={areas}
          aoIniciar={(tipo, titulo, areaId) =>
            executar(
              supabase.rpc('iniciar_sessao', { p_tipo: tipo, p_titulo: titulo, p_area_id: areaId }),
              'Não foi possível iniciar a sessão. Tente de novo.',
            )
          }
          aoLancar={() => setLancando(true)}
        />
      )}

      {processo && (
        <details className="processo">
          <summary>Processo: sessão de foco</summary>
          <Texto fonte={processo} />
        </details>
      )}

      <section>
        <h2>Hoje</h2>
        {sessoes.length === 0 ? (
          <p className="vazio">Nenhuma sessão registrada hoje.</p>
        ) : (
          <>
            <ul className="sessoes">
              {sessoes.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>
                      {NOME_DO_TIPO[s.tipo]} · {duracao(s.duracao_min ?? 0)}
                    </strong>
                    <span className="detalhe">
                      {s.inicio ? hora(s.inicio) : 'lançada à mão'}
                      {s.area && ` · ${s.area}`}
                      {s.tipo === 'foco' && !s.profunda && ' · sessão curta'}
                    </span>
                    {s.titulo && <span className="escopo">{s.titulo}</span>}
                    {s.resultado && <span className="detalhe">{s.resultado}</span>}
                  </div>
                  <button type="button" className="link" onClick={() => apagar(s)}>
                    Apagar
                  </button>
                </li>
              ))}
            </ul>
            <p className="totais">
              Hoje: {duracao(minutosDeHoje('foco'))} de foco · {duracao(minutosDeHoje('estudo'))} de estudo
            </p>
          </>
        )}
        <p className="totais">
          Semana: {duracao(focoDaSemana?.minutos ?? 0)} de foco
          {focoDaSemana && focoDaSemana.minutos_profundos !== focoDaSemana.minutos
            ? ` (${duracao(focoDaSemana.minutos_profundos)} em sessões longas)`
            : ''}{' '}
          · {duracao(daSemana('estudo')?.minutos ?? 0)} de estudo
        </p>
        {aoVerHistorico && (
          <p className="totais">
            <button type="button" className="link" onClick={aoVerHistorico}>
              Ver o histórico de foco e estudo
            </button>
          </p>
        )}
      </section>

      {lancando && (
        <LancamentoManual
          areas={areas}
          diaDeHoje={diaDeHoje}
          aoFechar={() => setLancando(false)}
          aoSalvar={async (tipo, data, minutos, titulo, areaId) => {
            const ok = await executar(
              supabase.rpc('lancar_sessao', {
                p_tipo: tipo,
                p_data: data,
                p_duracao_min: minutos,
                p_titulo: titulo,
                p_area_id: areaId,
              }),
              'Não foi possível lançar a sessão. Tente de novo.',
            )
            if (ok) setLancando(false)
          }}
        />
      )}
    </Raiz>
  )
}

function SeletorDeTipo({ tipo, aoMudar }: { tipo: Tipo; aoMudar: (t: Tipo) => void }) {
  return (
    <div className="segmentos" role="radiogroup" aria-label="Tipo de sessão">
      {(['foco', 'estudo'] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={tipo === t}
          className={tipo === t ? 'ativo' : undefined}
          onClick={() => aoMudar(t)}
        >
          {NOME_DO_TIPO[t]}
        </button>
      ))}
    </div>
  )
}

function SeletorDeArea({
  areas,
  valor,
  aoMudar,
}: {
  areas: Area[]
  valor: number | null
  aoMudar: (id: number | null) => void
}) {
  return (
    <label>
      Área
      <select value={valor ?? ''} onChange={(e) => aoMudar(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">Sem área</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nome}
          </option>
        ))}
      </select>
    </label>
  )
}

// A área segue o tipo (foco -> Carreira, estudo -> Estudos) até ser escolhida à mão.
function useAreaDaSessao(areas: Area[], tipo: Tipo) {
  const [escolhida, setEscolhida] = useState<number | null | undefined>(undefined)
  const padrao = areas.find((a) => a.nome === AREA_PADRAO[tipo])?.id ?? null
  return [escolhida === undefined ? padrao : escolhida, setEscolhida] as const
}

function NovaSessao({
  areas,
  aoIniciar,
  aoLancar,
}: {
  areas: Area[]
  aoIniciar: (tipo: Tipo, titulo: string, areaId: number | null) => Promise<boolean>
  aoLancar: () => void
}) {
  const [tipo, setTipo] = useState<Tipo>('foco')
  const [titulo, setTitulo] = useState('')
  const [areaId, setAreaId] = useAreaDaSessao(areas, tipo)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function iniciar(e: FormEvent) {
    e.preventDefault()
    if (titulo.trim() === '') {
      setAviso('Escreva o escopo da sessão antes de começar.')
      return
    }
    setEnviando(true)
    await aoIniciar(tipo, titulo, areaId)
    setEnviando(false)
  }

  return (
    <form className="cartao" onSubmit={iniciar}>
      <SeletorDeTipo tipo={tipo} aoMudar={setTipo} />
      <label>
        Escopo: o que você vai fazer nesta sessão
        <input
          value={titulo}
          onChange={(e) => {
            setTitulo(e.target.value)
            setAviso(null)
          }}
        />
      </label>
      <SeletorDeArea areas={areas} valor={areaId} aoMudar={setAreaId} />
      {aviso && <p className="erro">{aviso}</p>}
      <div className="acoes">
        <button type="button" onClick={aoLancar}>
          Lançar à mão
        </button>
        <button type="submit" className="principal" disabled={enviando}>
          Iniciar sessão
        </button>
      </div>
    </form>
  )
}

function EmAndamento({
  sessao,
  aoEncerrar,
  aoDescartar,
}: {
  sessao: Sessao
  aoEncerrar: (resultado: string, minutos: number) => Promise<boolean>
  aoDescartar: () => Promise<boolean>
}) {
  const inicio = new Date(sessao.inicio!).getTime()
  const [agora, setAgora] = useState(() => Date.now())
  const [encerrando, setEncerrando] = useState(false)
  const [resultado, setResultado] = useState('')
  const [minutos, setMinutos] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const corridos = (agora - inicio) / 1000

  function abrirRevisao() {
    setMinutos(String(Math.max(1, Math.round(corridos / 60))))
    setEncerrando(true)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const n = lerNumero(minutos)
    if (n === null || n < 1) {
      setAviso('A duração precisa ser de pelo menos 1 minuto.')
      return
    }
    await aoEncerrar(resultado, Math.round(n))
  }

  return (
    <div className="cartao andamento">
      <p className="detalhe">
        {NOME_DO_TIPO[sessao.tipo]}
        {sessao.area && ` · ${sessao.area}`} · desde {hora(sessao.inicio!)}
      </p>
      <p className="relogio" role="timer" aria-label="Tempo de sessão">
        {cronometro(corridos)}
      </p>
      {sessao.titulo && <p className="escopo">{sessao.titulo}</p>}

      {encerrando ? (
        <form onSubmit={salvar}>
          <label>
            Revisão: o que foi feito e o que fica para a próxima
            <textarea rows={3} value={resultado} onChange={(e) => setResultado(e.target.value)} />
          </label>
          <label>
            Duração (min)
            <input
              inputMode="numeric"
              value={minutos}
              onChange={(e) => {
                setMinutos(e.target.value)
                setAviso(null)
              }}
            />
          </label>
          <p className="ajuda">Ajuste a duração se houve uma pausa no meio.</p>
          {aviso && <p className="erro">{aviso}</p>}
          <div className="acoes">
            <button type="button" onClick={() => setEncerrando(false)}>
              Voltar ao cronômetro
            </button>
            <button type="submit" className="principal">
              Salvar sessão
            </button>
          </div>
        </form>
      ) : (
        <div className="acoes">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Descartar esta sessão sem registrar?')) void aoDescartar()
            }}
          >
            Descartar
          </button>
          <button type="button" className="principal" onClick={abrirRevisao}>
            Encerrar sessão
          </button>
        </div>
      )}
    </div>
  )
}

function LancamentoManual({
  areas,
  diaDeHoje,
  aoFechar,
  aoSalvar,
}: {
  areas: Area[]
  diaDeHoje: Dia
  aoFechar: () => void
  aoSalvar: (tipo: Tipo, data: Dia, minutos: number, titulo: string, areaId: number | null) => void
}) {
  const [tipo, setTipo] = useState<Tipo>('foco')
  const [data, setData] = useState<Dia>(diaDeHoje)
  const [minutos, setMinutos] = useState('')
  const [titulo, setTitulo] = useState('')
  const [areaId, setAreaId] = useAreaDaSessao(areas, tipo)
  const [aviso, setAviso] = useState<string | null>(null)

  function salvar(e: FormEvent) {
    e.preventDefault()
    const n = lerNumero(minutos)
    if (n === null || n < 1) {
      setAviso('Digite a duração em minutos.')
      return
    }
    if (data === '' || data > diaDeHoje) {
      setAviso('Escolha um dia até hoje.')
      return
    }
    aoSalvar(tipo, data, Math.round(n), titulo, areaId)
  }

  return (
    <Folha titulo="Lançar sessão à mão" aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        <SeletorDeTipo tipo={tipo} aoMudar={setTipo} />
        <label>
          Dia
          <input type="date" max={diaDeHoje} value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label>
          Duração (min)
          <input
            inputMode="numeric"
            autoFocus
            value={minutos}
            onChange={(e) => {
              setMinutos(e.target.value)
              setAviso(null)
            }}
          />
        </label>
        <label>
          Escopo (opcional)
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <SeletorDeArea areas={areas} valor={areaId} aoMudar={setAreaId} />
        {aviso && <p className="erro">{aviso}</p>}
        <div className="acoes">
          <button type="submit" className="principal">
            Salvar
          </button>
        </div>
      </form>
    </Folha>
  )
}
