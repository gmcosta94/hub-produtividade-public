import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { corDaArea } from '../lib/areas'
import { Folha } from '../componentes/Folha'
import { numero } from '../lib/formato'
import { diasDaSemana, hoje, inicioDaSemana, porExtenso, somarDias, type Dia } from '../lib/datas'
import type { Habito, Metrica, Registro } from './Habitos'

// O histórico olha para trás sem cobrar: um calendário por hábito (uma coluna
// por semana, de domingo a sábado), a faixa das semanas que bateram a meta e,
// para medidas como o peso, uma linha. Nada de sequência nem de contador de falhas.

type SemanaDoHabito = { habito_id: number; semana: Dia; dias_que_contam: number; meta_ajustada: number | null }
type Medida = { metrica_id: number; data: Dia; valor: number }
type Dados = { registros: Registro[]; semanas: SemanaDoHabito[]; medidas: Medida[] }

// PostgREST devolve no máximo 1000 linhas por pedido; lê em páginas.
async function lerTudo<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const tudo: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999)
    if (error || !data) throw error ?? new Error('sem dados')
    tudo.push(...data)
    if (data.length < 1000) return tudo
  }
}

type Filtro = { habitoId: number } | { metricaId: number } | undefined

function useHistorico(inicio: Dia, versao: number, filtro?: Filtro): Dados | null | 'erro' {
  const [dados, setDados] = useState<Dados | null | 'erro'>(null)
  const habitoId = filtro && 'habitoId' in filtro ? filtro.habitoId : undefined
  const metricaId = filtro && 'metricaId' in filtro ? filtro.metricaId : undefined
  const comHabitos = !filtro || habitoId !== undefined
  const comMetricas = !filtro || metricaId !== undefined
  useEffect(() => {
    let cancelado = false
    Promise.all([
      comHabitos
        ? lerTudo<Registro>((de, ate) => {
            let q = supabase
              .from('v_habito_registro')
              .select('habito_id, data, estado, valor, conta')
              .gte('data', inicio)
            if (habitoId !== undefined) q = q.eq('habito_id', habitoId)
            return q.order('data').range(de, ate)
          })
        : [],
      comHabitos
        ? lerTudo<SemanaDoHabito>((de, ate) => {
            let q = supabase
              .from('v_habito_semana')
              .select('habito_id, semana, dias_que_contam, meta_ajustada')
              .gte('semana', inicio)
            if (habitoId !== undefined) q = q.eq('habito_id', habitoId)
            return q.order('semana').range(de, ate)
          })
        : [],
      comMetricas
        ? lerTudo<Medida>((de, ate) => {
            let q = supabase.from('metrica_registro').select('metrica_id, data, valor').gte('data', inicio)
            if (metricaId !== undefined) q = q.eq('metrica_id', metricaId)
            return q.order('data').range(de, ate)
          })
        : [],
    ]).then(
      ([registros, semanas, medidas]) => {
        if (!cancelado) setDados({ registros, semanas, medidas })
      },
      () => {
        if (!cancelado) setDados('erro')
      },
    )
    return () => {
      cancelado = true
    }
  }, [inicio, versao, habitoId, metricaId, comHabitos, comMetricas])
  return dados
}

const ESTADOS: Record<Registro['estado'], string> = {
  feito: 'feito',
  minimo: 'versão mínima',
  nao: 'não fiz',
  dispensado: 'dispensado',
}

function classeDoRegistro(r: Registro | undefined): string {
  if (!r) return ''
  if (r.estado === 'dispensado' || r.estado === 'nao' || r.estado === 'minimo') return r.estado
  if (r.valor !== null) return r.conta ? 'feito' : 'numero'
  return 'feito'
}

function tituloDoRegistro(h: Habito, d: Dia, r: Registro | undefined): string {
  const quando = porExtenso(d)
  if (!r) return `${quando}: sem registro`
  const valor = r.valor !== null ? `${numero.format(r.valor)} ${h.unidade ?? ''} · ` : ''
  return `${quando}: ${valor}${ESTADOS[r.estado]}`
}

// A lista inteira, no modo Histórico da tela de Hábitos.
export function HistoricoDosHabitos({
  grupos,
  semanas,
  versao,
  aoAbrir,
}: {
  grupos: { titulo: string; habitos: Habito[]; metricas: Metrica[] }[]
  semanas: number
  versao: number
  aoAbrir: (alvo: { habito: Habito } | { metrica: Metrica }) => void
}) {
  const inicio = somarDias(inicioDaSemana(hoje()), -7 * (semanas - 1))
  const dados = useHistorico(inicio, versao)
  if (dados === 'erro') return <p className="erro">Não foi possível carregar o histórico.</p>
  if (dados === null) return <p className="vazio">Carregando o histórico…</p>
  return (
    <>
      <Legenda />
      {grupos.map((g) => (
        <section key={g.titulo} className="historico-da-camada">
          <h2>{g.titulo}</h2>
          <div className="historico-lista">
            {g.habitos.map((h) => (
              <button key={h.id} type="button" className="historico-item" onClick={() => aoAbrir({ habito: h })}>
                <HistoricoDoHabito habito={h} inicio={inicio} semanas={semanas} dados={dados} />
              </button>
            ))}
            {g.metricas.map((m) => (
              <button key={`m${m.id}`} type="button" className="historico-item" onClick={() => aoAbrir({ metrica: m })}>
                <HistoricoDaMetrica metrica={m} inicio={inicio} dados={dados} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

// Um hábito ou uma medida, com mais semanas, numa folha.
export function FolhaDoHistorico({
  alvo,
  versao,
  aoFechar,
}: {
  alvo: { habito: Habito } | { metrica: Metrica }
  versao: number
  aoFechar: () => void
}) {
  const semanas = 26
  const inicio = somarDias(inicioDaSemana(hoje()), -7 * (semanas - 1))
  const habito = 'habito' in alvo ? alvo.habito : undefined
  const metrica = 'metrica' in alvo ? alvo.metrica : undefined
  const dados = useHistorico(inicio, versao, habito ? { habitoId: habito.id } : { metricaId: metrica!.id })
  return (
    <Folha titulo={habito?.nome ?? metrica?.nome ?? ''} subtitulo="Últimos seis meses" aoFechar={aoFechar}>
      <div className="historico-grande">
        {dados === 'erro' && <p className="erro">Não foi possível carregar o histórico.</p>}
        {dados && dados !== 'erro' && habito && (
          <>
            <HistoricoDoHabito habito={habito} inicio={inicio} semanas={semanas} dados={dados} grande />
            <Legenda />
          </>
        )}
        {dados && dados !== 'erro' && metrica && (
          <HistoricoDaMetrica metrica={metrica} inicio={inicio} dados={dados} grande />
        )}
      </div>
    </Folha>
  )
}

function Legenda() {
  return (
    <p className="legenda-historico" aria-hidden="true">
      <span className="marcas">
        <i className="feito" />
      </span>
      feito
      <span className="marcas">
        <i className="minimo" />
      </span>
      mínimo
      <span className="marcas">
        <i className="nao" />
      </span>
      não fiz
      <span className="marcas">
        <i className="dispensado" />
      </span>
      dispensado
      <span className="marcas">
        <i />
      </span>
      sem registro
    </p>
  )
}

function Cabeca({ nome, area, resumo }: { nome: string; area: string; resumo: string }) {
  return (
    <span className="historico-cabeca">
      <span className="historico-nome">
        <i className="ponto-da-area" style={{ background: corDaArea(area) }} />
        {nome}
      </span>
      <small>{resumo}</small>
    </span>
  )
}

function HistoricoDoHabito({
  habito: h,
  inicio,
  semanas,
  dados,
  grande = false,
}: {
  habito: Habito
  inicio: Dia
  semanas: number
  dados: Dados
  grande?: boolean
}) {
  const diaDeHoje = hoje()
  const semanaAtual = inicioDaSemana(diaDeHoje)
  const colunas = Array.from({ length: semanas }, (_, i) => somarDias(inicio, 7 * i))
  const registros = new Map(dados.registros.filter((r) => r.habito_id === h.id).map((r) => [r.data, r]))
  const porSemana = new Map(dados.semanas.filter((s) => s.habito_id === h.id).map((s) => [s.semana, s]))
  const naMeta = (s: SemanaDoHabito | undefined) =>
    !!s && s.meta_ajustada !== null && s.meta_ajustada > 0 && s.dias_que_contam >= s.meta_ajustada

  // O resumo conta só as semanas fechadas desde o primeiro registro.
  const primeiro = dados.registros.find((r) => r.habito_id === h.id)?.data
  const fechadas = primeiro ? colunas.filter((c) => c >= inicioDaSemana(primeiro) && c < semanaAtual) : []
  const registrados = [...registros.values()].filter((r) => r.conta).length
  let resumo: string
  if (!primeiro) resumo = 'nenhum registro no período'
  else if (h.meta_dias !== null && fechadas.length > 0)
    resumo = `na meta em ${fechadas.filter((c) => naMeta(porSemana.get(c))).length} de ${fechadas.length} semanas`
  else resumo = registrados === 1 ? '1 dia que contou' : `${registrados} dias que contaram`

  const fora = (d: Dia) =>
    h.dias_da_semana !== null && !h.dias_da_semana.includes(diasDaSemana(inicioDaSemana(d)).indexOf(d))

  return (
    <>
      {grande ? <p className="resumo-grande">{resumo}</p> : <Cabeca nome={h.nome} area={h.area.nome} resumo={resumo} />}
      {/* Sem nenhum registro, o calendário vazio só faria barulho. */}
      {(primeiro || grande) && (
        <span className={grande ? 'calendario-habito grande' : 'calendario-habito'}>
          <span className="marcas calendario" role="img" aria-label={`${h.nome}: ${resumo}`}>
            {colunas.flatMap((c) =>
              diasDaSemana(c).map((d) => {
                const r = registros.get(d)
                if (d > diaDeHoje) return <i key={d} className="futuro" />
                return (
                  <i
                    key={d}
                    className={[classeDoRegistro(r), !r && fora(d) && 'fora'].filter(Boolean).join(' ') || undefined}
                    title={tituloDoRegistro(h, d, r)}
                  />
                )
              }),
            )}
          </span>
          {h.meta_dias !== null && (
            <span className="marcas semanas-na-meta" aria-hidden="true">
              {colunas.map((c) => {
                const s = porSemana.get(c)
                return (
                  <i
                    key={c}
                    className={
                      [naMeta(s) && 'feito', c === semanaAtual && 'atual'].filter(Boolean).join(' ') || undefined
                    }
                    title={`Semana de ${porExtenso(c)}: ${s?.dias_que_contam ?? 0} de ${s?.meta_ajustada ?? h.meta_dias}`}
                  />
                )
              })}
            </span>
          )}
        </span>
      )}
    </>
  )
}

function HistoricoDaMetrica({
  metrica: m,
  inicio,
  dados,
  grande = false,
}: {
  metrica: Metrica
  inicio: Dia
  dados: Dados
  grande?: boolean
}) {
  const medidas = dados.medidas.filter((x) => x.metrica_id === m.id)
  const ultima = medidas.at(-1)
  const resumo = ultima
    ? `${numero.format(ultima.valor)} ${m.unidade} em ${porExtenso(ultima.data)}`
    : 'nenhum registro no período'
  return (
    <>
      {grande ? <p className="resumo-grande">{resumo}</p> : <Cabeca nome={m.nome} area={m.area.nome} resumo={resumo} />}
      {medidas.length > 0 && <Linha medidas={medidas} inicio={inicio} unidade={m.unidade} grande={grande} />}
    </>
  )
}

// A linha de uma medida no tempo, com os extremos escritos ao lado.
function Linha({
  medidas,
  inicio,
  unidade,
  grande,
}: {
  medidas: Medida[]
  inicio: Dia
  unidade: string
  grande: boolean
}) {
  const largura = grande ? 320 : 180
  const altura = grande ? 96 : 44
  const margem = 5
  const dias = (d: Dia) => (Date.parse(d) - Date.parse(inicio)) / 86400000
  const total = Math.max(1, dias(hoje()))
  const valores = medidas.map((x) => x.valor)
  const menor = Math.min(...valores)
  const maior = Math.max(...valores)
  const faixa = maior - menor || 1
  const ponto = (x: Medida) => ({
    x: margem + (dias(x.data) / total) * (largura - 2 * margem),
    y: margem + (1 - (x.valor - menor) / faixa) * (altura - 2 * margem),
  })
  const pontos = medidas.map(ponto)
  return (
    <span className="linha-da-medida">
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        width={largura}
        height={altura}
        role="img"
        aria-label={`De ${numero.format(medidas[0].valor)} a ${numero.format(medidas.at(-1)!.valor)} ${unidade}`}
      >
        <line x1={margem} x2={largura - margem} y1={altura - margem} y2={altura - margem} className="eixo" />
        {pontos.length > 1 && <polyline points={pontos.map((p) => `${p.x},${p.y}`).join(' ')} className="traco" />}
        {pontos.map((p, i) => (
          <circle key={medidas[i].data} cx={p.x} cy={p.y} r={i === pontos.length - 1 ? 4 : grande ? 3 : 2}>
            <title>
              {porExtenso(medidas[i].data)}: {numero.format(medidas[i].valor)} {unidade}
            </title>
          </circle>
        ))}
      </svg>
      <small className="extremos">
        <span>
          máx. {numero.format(maior)} {unidade}
        </span>
        <span>
          mín. {numero.format(menor)} {unidade}
        </span>
      </small>
    </span>
  )
}
