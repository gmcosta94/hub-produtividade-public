import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Folha } from '../componentes/Folha'
import { hoje, inicioDaSemana, porExtenso, somarDias } from '../lib/datas'
import { duracao, lerNumero } from '../lib/formato'
import { textoDoErro, useAreas, useConsulta, type Area, type Ir } from '../lib/dados'

type Tipo = 'foco' | 'estudo'
type Sessao = {
  id: number
  tipo: Tipo
  data: string
  semana: string
  duracao_min: number
  titulo: string | null
  resultado: string | null
  area_id: number | null
  area: string | null
  profunda: boolean
}
type Objetivo = { titulo: string; nivel: 'leve' | 'moderado' | 'intenso' }
type Semana = { inicio: string; foco: number; estudo: number; profundos: number; sessoes: number }

const PERIODOS = [4, 12, 26]
// O mínimo de cada nível de objetivo, em minutos por semana (Constituição: leve 1 a 2 h, moderado 3 a 4 h, intenso 5 h ou mais).
const MINIMO_DO_NIVEL: Record<Objetivo['nivel'], number> = { leve: 60, moderado: 180, intenso: 300 }
const NOME_DO_TIPO: Record<Tipo, string> = { foco: 'Foco', estudo: 'Estudo' }

const curto = (dia: string) => {
  const [, m, d] = dia.split('-')
  return `${d}/${m}`
}

// O histórico das sessões de foco e de estudo: total por semana e sessões dia a dia.
// Com uma área, mostra só as sessões dela e o mínimo dos objetivos dela no ciclo.
export function HistoricoDeFoco({ areaId, ir }: { areaId?: number; ir: Ir }) {
  const areas = useAreas()
  const [periodo, setPeriodo] = useState(12)
  const [tipo, setTipo] = useState<Tipo | 'todos'>('todos')
  const [area, setArea] = useState<number | null>(areaId ?? null)
  const [editando, setEditando] = useState<Sessao | null>(null)

  const atual = inicioDaSemana(hoje())
  const inicio = somarDias(atual, -7 * (periodo - 1))
  const sessoes = useConsulta<Sessao[]>(
    () =>
      supabase
        .from('v_sessao')
        .select('id, tipo, data, semana, duracao_min, titulo, resultado, area_id, area, profunda')
        .eq('em_andamento', false)
        .gte('data', inicio)
        .order('data', { ascending: false })
        .order('criado_em', { ascending: false }),
    [inicio],
  )
  const objetivos = useConsulta<Objetivo[]>(async () => {
    if (area === null) return { data: [], error: null }
    const ciclo = await supabase.from('v_ciclo_atual').select('id').maybeSingle()
    if (!ciclo.data) return { data: [], error: ciclo.error }
    return supabase
      .from('objetivo')
      .select('titulo, nivel')
      .eq('ciclo_id', ciclo.data.id)
      .eq('area_id', area)
      .eq('estado', 'ativo')
  }, [area])

  const visiveis = (sessoes.dados ?? []).filter(
    (s) => (tipo === 'todos' || s.tipo === tipo) && (area === null || s.area_id === area),
  )

  // Uma linha por semana do período, mesmo as sem sessão.
  const semanas: Semana[] = Array.from({ length: periodo }, (_, i) => ({
    inicio: somarDias(inicio, 7 * i),
    foco: 0,
    estudo: 0,
    profundos: 0,
    sessoes: 0,
  }))
  for (const s of visiveis) {
    const w = semanas.find((x) => x.inicio === s.semana)
    if (!w) continue
    w[s.tipo] += s.duracao_min
    w.sessoes++
    if (s.profunda) w.profundos += s.duracao_min
  }

  const total = { foco: 0, estudo: 0, profundos: 0, sessoes: 0 }
  for (const w of semanas) {
    total.foco += w.foco
    total.estudo += w.estudo
    total.profundos += w.profundos
    total.sessoes += w.sessoes
  }
  // A média não conta a semana atual, que ainda não terminou.
  const fechadas = semanas.filter((w) => w.inicio !== atual)
  const media = fechadas.length ? fechadas.reduce((s, w) => s + w.foco + w.estudo, 0) / fechadas.length : 0
  const referencia = (objetivos.dados ?? []).reduce((s, o) => s + MINIMO_DO_NIVEL[o.nivel], 0) || null
  const nomeDaArea = areas.find((a) => a.id === area)?.nome

  // Dias com sessão, do mais recente para o mais antigo.
  const dias = new Map<string, Sessao[]>()
  for (const s of visiveis) dias.set(s.data, [...(dias.get(s.data) ?? []), s])

  return (
    <main>
      <button
        type="button"
        className="link voltar"
        onClick={() => ir(areaId !== undefined ? { tela: 'areas', id: areaId } : { tela: 'hoje' })}
      >
        ‹ {areaId !== undefined ? (areas.find((a) => a.id === areaId)?.nome ?? 'Área') : 'Hoje'}
      </button>
      <h1 className="titulo-tela">Histórico de foco e estudo{nomeDaArea ? ` · ${nomeDaArea}` : ''}</h1>

      <div className="filtros">
        <div className="segmentos" role="radiogroup" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={periodo === p}
              className={periodo === p ? 'ativo' : undefined}
              onClick={() => setPeriodo(p)}
            >
              {p} semanas
            </button>
          ))}
        </div>
        <div className="segmentos" role="radiogroup" aria-label="Tipo">
          {(['todos', 'foco', 'estudo'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              className={tipo === t ? 'ativo' : undefined}
              onClick={() => setTipo(t)}
            >
              {t === 'todos' ? 'Tudo' : NOME_DO_TIPO[t]}
            </button>
          ))}
        </div>
        <select
          className="campo"
          aria-label="Área"
          value={area ?? ''}
          onChange={(e) => setArea(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Todas as áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="numeros-foco">
        {tipo !== 'estudo' && <Numero rotulo="Foco no período" valor={duracao(total.foco)} />}
        {tipo !== 'foco' && <Numero rotulo="Estudo no período" valor={duracao(total.estudo)} />}
        <Numero rotulo="Média por semana" valor={duracao(Math.round(media))} detalhe="sem contar a semana atual" />
        {tipo !== 'estudo' && total.foco > 0 && (
          <Numero
            rotulo="Em sessões profundas"
            valor={`${Math.round((100 * total.profundos) / total.foco)}%`}
            detalhe="do tempo de foco"
          />
        )}
      </div>

      {referencia !== null && (
        <p className="ajuda">
          Objetivo no ciclo: {(objetivos.dados ?? []).map((o) => `${o.titulo} (${o.nivel})`).join(' · ')}. A linha no
          gráfico marca o mínimo do nível: {duracao(referencia)} por semana.
        </p>
      )}

      <section className="bloco">
        <h2 className="titulo-bloco">Horas por semana</h2>
        <GraficoSemanal semanas={semanas} tipo={tipo} referencia={referencia} atual={atual} />
      </section>

      <section className="bloco lista-de-sessoes">
        <h2 className="titulo-bloco">Sessões</h2>
        {sessoes.carregou && dias.size === 0 && <p className="vazio pequeno">Nenhuma sessão neste período.</p>}
        {[...dias.entries()].map(([dia, lista]) => (
          <div key={dia} className="dia-de-sessoes">
            <h3 className="titulo-bloco">
              {porExtenso(dia)} · {duracao(lista.reduce((s, x) => s + x.duracao_min, 0))}
            </h3>
            <ul className="lista">
              {lista.map((s) => (
                <li key={s.id}>
                  <button type="button" className="item" onClick={() => setEditando(s)}>
                    <span>
                      {s.titulo ?? 'Sem escopo'}
                      <small className={s.tipo === 'foco' ? 'chip' : 'chip neutro'}>{NOME_DO_TIPO[s.tipo]}</small>
                      {s.tipo === 'foco' && !s.profunda && <small className="chip neutro">sessão curta</small>}
                    </span>
                    <small>{[duracao(s.duracao_min), s.area].filter(Boolean).join(' · ')}</small>
                    {s.resultado && <small className="revisao-da-sessao">{s.resultado}</small>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {editando && (
        <FolhaDaSessao
          key={editando.id}
          sessao={editando}
          areas={areas}
          aoFechar={() => setEditando(null)}
          aoMudar={() => {
            setEditando(null)
            sessoes.recarregar()
          }}
        />
      )}
    </main>
  )
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="numero-foco">
      <span>{rotulo}</span>
      <strong>{valor}</strong>
      {detalhe && <small>{detalhe}</small>}
    </div>
  )
}

// Barras empilhadas por semana: foco embaixo, estudo em cima.
function GraficoSemanal({
  semanas,
  tipo,
  referencia,
  atual,
}: {
  semanas: Semana[]
  tipo: Tipo | 'todos'
  referencia: number | null
  atual: string
}) {
  const [marcada, setMarcada] = useState<number | null>(null)
  // O desenho usa a largura real do espaço, para o texto não encolher no celular.
  const caixa = useRef<HTMLDivElement>(null)
  const [L, setL] = useState(720)
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const observador = new ResizeObserver(([e]) => setL(Math.max(280, Math.round(e.contentRect.width))))
    observador.observe(el)
    return () => observador.disconnect()
  }, [])
  const A = L < 480 ? 200 : 240
  const m = { esq: 48, dir: 12, cima: 14, baixo: 28 }
  const largura = L - m.esq - m.dir
  const altura = A - m.cima - m.baixo
  const mostraFoco = tipo !== 'estudo'
  const mostraEstudo = tipo !== 'foco'
  const totalDa = (w: Semana) => (mostraFoco ? w.foco : 0) + (mostraEstudo ? w.estudo : 0)

  // Escala em horas redondas, com no máximo 5 marcas.
  // Folga acima da linha do objetivo, para ela e o rótulo não colarem no topo.
  const maior = Math.max(60, (referencia ?? 0) * 1.2, ...semanas.map(totalDa))
  const passo = [30, 60, 120, 180, 300, 600, 900, 1200, 1800].find((p) => maior / p <= 5) ?? 3000
  const topo = Math.ceil(maior / passo) * passo
  const y = (min: number) => m.cima + altura - (min / topo) * altura
  const faixa = largura / semanas.length
  const barra = Math.min(24, faixa * 0.62)
  // Um rótulo de semana a cada ~52 px, para não se sobreporem.
  const cadaQuantas = Math.ceil(semanas.length / Math.max(3, Math.floor(largura / 52)))
  const marcas = Array.from({ length: topo / passo + 1 }, (_, i) => i * passo)
  const rotuloDoEixo = (min: number) => (min === 0 ? '0' : min % 60 === 0 ? `${min / 60}h` : duracao(min))

  // Retângulo com os cantos de cima arredondados (4 px), reto na base.
  const coluna = (x: number, y0: number, y1: number, arredondar: boolean) => {
    const h = y0 - y1
    if (h <= 0) return ''
    const r = arredondar ? Math.min(4, h, barra / 2) : 0
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barra - r} Q${x + barra},${y1} ${x + barra},${y1 + r} V${y0} Z`
  }

  const w = marcada !== null ? semanas[marcada] : null
  return (
    <div className="grafico-foco">
      {mostraFoco && mostraEstudo && (
        <div className="legenda" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--serie-foco)' }} />
            Foco
          </span>
          <span>
            <i style={{ background: 'var(--serie-estudo)' }} />
            Estudo
          </span>
        </div>
      )}
      <div className="area-do-grafico" ref={caixa} onMouseLeave={() => setMarcada(null)}>
        <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Horas por semana nas últimas ${semanas.length} semanas`}>
          {marcas.map((v) => (
            <g key={v}>
              <line x1={m.esq} x2={L - m.dir} y1={y(v)} y2={y(v)} className={v === 0 ? 'base' : 'grade'} />
              <text x={m.esq - 8} y={y(v) + 4} textAnchor="end" className="eixo">
                {rotuloDoEixo(v)}
              </text>
            </g>
          ))}
          {semanas.map((s, i) => {
            const x = m.esq + i * faixa + (faixa - barra) / 2
            const foco = mostraFoco ? s.foco : 0
            const estudo = mostraEstudo ? s.estudo : 0
            const yFoco = y(foco)
            // 2 px de folga entre os dois segmentos.
            const yEstudo = y(foco + estudo) - (foco > 0 && estudo > 0 ? 2 : 0)
            return (
              <g key={s.inicio} className={marcada === i ? 'semana marcada' : 'semana'}>
                {foco > 0 && <path d={coluna(x, y(0), yFoco, estudo === 0)} fill="var(--serie-foco)" />}
                {estudo > 0 && (
                  <path d={coluna(x, foco > 0 ? yFoco - 2 : y(0), yEstudo, true)} fill="var(--serie-estudo)" />
                )}
                {i % cadaQuantas === (semanas.length - 1) % cadaQuantas && (
                  <text x={x + barra / 2} y={A - 8} textAnchor="middle" className="eixo">
                    {s.inicio === atual ? 'atual' : curto(s.inicio)}
                  </text>
                )}
                <rect
                  x={m.esq + i * faixa}
                  y={m.cima}
                  width={faixa}
                  height={altura}
                  fill="transparent"
                  onMouseEnter={() => setMarcada(i)}
                  onClick={() => setMarcada(marcada === i ? null : i)}
                />
              </g>
            )
          })}
          {referencia !== null && (
            <g className="referencia">
              <line x1={m.esq} x2={L - m.dir} y1={y(referencia)} y2={y(referencia)} />
              <text x={L - m.dir} y={y(referencia) - 6} textAnchor="end">
                mínimo do objetivo
              </text>
            </g>
          )}
        </svg>
        {w && (
          <div
            className="dica-do-grafico"
            style={{ left: `${((m.esq + (marcada! + 0.5) * faixa) / L) * 100}%` }}
            role="status"
          >
            <strong>
              Semana de {curto(w.inicio)} a {curto(somarDias(w.inicio, 6))}
            </strong>
            {mostraFoco && (
              <span>
                <i style={{ background: 'var(--serie-foco)' }} />
                Foco {duracao(w.foco)}
                {w.foco > 0 && ` (${duracao(w.profundos)} profundo)`}
              </span>
            )}
            {mostraEstudo && (
              <span>
                <i style={{ background: 'var(--serie-estudo)' }} />
                Estudo {duracao(w.estudo)}
              </span>
            )}
            <span>
              {w.sessoes} {w.sessoes === 1 ? 'sessão' : 'sessões'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function FolhaDaSessao({
  sessao,
  areas,
  aoFechar,
  aoMudar,
}: {
  sessao: Sessao
  areas: Area[]
  aoFechar: () => void
  aoMudar: () => void
}) {
  const [tipo, setTipo] = useState<Tipo>(sessao.tipo)
  const [data, setData] = useState(sessao.data)
  const [minutos, setMinutos] = useState(String(sessao.duracao_min))
  const [area, setArea] = useState<number | null>(sessao.area_id)
  const [titulo, setTitulo] = useState(sessao.titulo ?? '')
  const [resultado, setResultado] = useState(sessao.resultado ?? '')
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const duracaoMin = lerNumero(minutos)
    if (duracaoMin === null || duracaoMin <= 0) return setErro('Digite a duração em minutos.')
    const { error } = await supabase.rpc('editar_sessao', {
      p_id: sessao.id,
      p_tipo: tipo,
      p_data: data,
      p_duracao_min: Math.round(duracaoMin),
      p_titulo: titulo,
      p_resultado: resultado,
      p_area_id: area,
    })
    if (error) return setErro(textoDoErro(error, 'Não foi possível salvar a sessão.'))
    aoMudar()
  }

  async function apagar() {
    const { error } = await supabase.from('registro').delete().eq('id', sessao.id)
    if (error) return setErro('Não foi possível apagar a sessão.')
    aoMudar()
  }

  return (
    <Folha titulo="Sessão" subtitulo={porExtenso(sessao.data)} aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        <div className="segmentos" role="radiogroup" aria-label="Tipo">
          {(['foco', 'estudo'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              className={tipo === t ? 'ativo' : undefined}
              onClick={() => setTipo(t)}
            >
              {NOME_DO_TIPO[t]}
            </button>
          ))}
        </div>
        <div className="lado-a-lado">
          <label>
            Dia
            <input type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} />
          </label>
          <label>
            Minutos
            <input inputMode="numeric" value={minutos} onChange={(e) => setMinutos(e.target.value)} />
          </label>
        </div>
        <label>
          Área
          <select value={area ?? ''} onChange={(e) => setArea(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sem área</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Escopo
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label>
          Revisão
          <textarea rows={3} value={resultado} onChange={(e) => setResultado(e.target.value)} />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <div className="acoes">
          {confirmando ? (
            <button type="button" className="perigo" onClick={apagar}>
              Apagar de vez
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmando(true)}>
              Apagar
            </button>
          )}
          <button type="submit" className="principal">
            Salvar
          </button>
        </div>
      </form>
    </Folha>
  )
}
