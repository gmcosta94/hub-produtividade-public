import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { corDaArea } from '../lib/areas'
import { numero } from '../lib/formato'
import { textoDoErro, useConsulta } from '../lib/dados'
import { Folha } from './Folha'

type Bloco = {
  id: number
  dia: number
  inicio: string
  fim: string
  titulo: string
  area_id: number | null
  para_o_ciclo: boolean
}
type AreaCurta = { id: number; nome: string }

const NOMES_DOS_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const ALTURA_DA_HORA = 30

const minutos = (hora: string) => {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}
const hhmm = (hora: string) => hora.slice(0, 5)
const duracaoEmHoras = (b: Bloco) => (minutos(b.fim) - minutos(b.inicio)) / 60

function useTelaLarga() {
  const consulta = '(min-width: 768px)'
  const [larga, setLarga] = useState(() => window.matchMedia(consulta).matches)
  useEffect(() => {
    const mq = window.matchMedia(consulta)
    const mudar = () => setLarga(mq.matches)
    mq.addEventListener('change', mudar)
    return () => mq.removeEventListener('change', mudar)
  }, [])
  return larga
}

// A semana que se repete durante o ciclo. Os blocos "para o ciclo" são o tempo
// dos objetivos: a soma deles vira a capacidade da semana.
export function SemanaBase({
  cicloId,
  areas,
  margem,
  aoMudar,
}: {
  cicloId: number
  areas: AreaCurta[]
  margem: number
  aoMudar: () => void
}) {
  const [copiou, setCopiou] = useState(false)
  const blocos = useConsulta<Bloco[]>(
    () =>
      supabase
        .from('semana_base_bloco')
        .select('id, dia, inicio, fim, titulo, area_id, para_o_ciclo')
        .eq('ciclo_id', cicloId)
        .order('dia')
        .order('inicio'),
    [cicloId, copiou],
  )
  const [editando, setEditando] = useState<Bloco | { dia: number; inicio: string } | null>(null)
  const [diaNoCelular, setDiaNoCelular] = useState(1)
  const larga = useTelaLarga()
  const lista = blocos.dados ?? []

  // Um ciclo novo começa com a semana base do anterior, se houver.
  useEffect(() => {
    let cancelado = false
    supabase.rpc('copiar_semana_base', { p_ciclo: cicloId }).then(({ data }) => {
      if (!cancelado && Number(data) > 0) {
        setCopiou(true)
        aoMudar()
      }
    })
    return () => {
      cancelado = true
    }
    // aoMudar muda a cada render do pai; a cópia roda uma vez por ciclo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cicloId])

  const paraOCiclo = lista.filter((b) => b.para_o_ciclo).reduce((s, b) => s + duracaoEmHoras(b), 0)
  const porArea = new Map<string, number>()
  for (const b of lista.filter((x) => !x.para_o_ciclo)) {
    const nome = areas.find((a) => a.id === b.area_id)?.nome ?? 'Sem área'
    porArea.set(nome, (porArea.get(nome) ?? 0) + duracaoEmHoras(b))
  }
  const comecaEm = Math.min(6, ...lista.map((b) => Math.floor(minutos(b.inicio) / 60)))
  const terminaEm = Math.max(23, ...lista.map((b) => Math.ceil(minutos(b.fim) / 60)))
  const horas = Array.from({ length: terminaEm - comecaEm }, (_, i) => comecaEm + i)
  const dias = larga ? [0, 1, 2, 3, 4, 5, 6] : [diaNoCelular]

  function recarregar() {
    blocos.recarregar()
    aoMudar()
  }

  return (
    <div className="semana-base">
      <div className="numeros-da-semana-base">
        <p>
          <strong>{numero.format(Math.round(paraOCiclo * 10) / 10)} h</strong> por semana reservadas ao ciclo
          <small>
            o plano usa até {numero.format(Math.round(paraOCiclo * margem * 10) / 10)} h ({numero.format(margem * 100)}
            %)
          </small>
        </p>
        {porArea.size > 0 && (
          <p className="horas-por-area">
            {[...porArea.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([nome, h]) => (
                <span key={nome}>
                  <i className="ponto-da-area" style={{ background: corDaArea(nome) }} />
                  {nome} {numero.format(Math.round(h * 10) / 10)} h
                </span>
              ))}
          </p>
        )}
      </div>

      {!larga && (
        <div className="segmentos espacado" role="radiogroup" aria-label="Dia da semana">
          {CURTOS.map((nome, i) => (
            <button
              key={nome}
              type="button"
              role="radio"
              aria-checked={diaNoCelular === i}
              className={diaNoCelular === i ? 'ativo' : undefined}
              onClick={() => setDiaNoCelular(i)}
            >
              {nome}
            </button>
          ))}
        </div>
      )}

      <div className="grade-da-semana" style={{ gridTemplateColumns: `40px repeat(${dias.length}, minmax(0, 1fr))` }}>
        <div />
        {dias.map((d) => (
          <div key={d} className="cabeca-do-dia">
            {larga ? CURTOS[d] : NOMES_DOS_DIAS[d]}
          </div>
        ))}
        <div className="regua" style={{ height: horas.length * ALTURA_DA_HORA }}>
          {horas.map((h) => (
            <span key={h} style={{ top: (h - comecaEm) * ALTURA_DA_HORA }}>
              {String(h).padStart(2, '0')}h
            </span>
          ))}
        </div>
        {dias.map((d) => (
          <div
            key={d}
            className="coluna-do-dia"
            style={{ height: horas.length * ALTURA_DA_HORA }}
            onClick={(e) => {
              const y = e.clientY - e.currentTarget.getBoundingClientRect().top
              const hora = comecaEm + Math.floor(y / ALTURA_DA_HORA)
              setEditando({ dia: d, inicio: `${String(hora).padStart(2, '0')}:00` })
            }}
          >
            {horas.map((h) => (
              <i key={h} className="linha-da-hora" style={{ top: (h - comecaEm) * ALTURA_DA_HORA }} />
            ))}
            {lista
              .filter((b) => b.dia === d)
              .map((b) => {
                const nomeDaArea = areas.find((a) => a.id === b.area_id)?.nome
                const topo = ((minutos(b.inicio) - comecaEm * 60) / 60) * ALTURA_DA_HORA
                const altura = duracaoEmHoras(b) * ALTURA_DA_HORA
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={b.para_o_ciclo ? 'bloco-da-semana para-o-ciclo' : 'bloco-da-semana'}
                    style={{
                      top: topo,
                      height: Math.max(altura - 2, 14),
                      borderLeftColor: b.para_o_ciclo ? undefined : nomeDaArea ? corDaArea(nomeDaArea) : undefined,
                    }}
                    title={`${b.titulo} · ${hhmm(b.inicio)} a ${hhmm(b.fim)}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditando(b)
                    }}
                  >
                    <span className="titulo-do-bloco">{b.titulo}</span>
                    {altura >= 34 && (
                      <small>
                        {hhmm(b.inicio)}–{hhmm(b.fim)}
                      </small>
                    )}
                  </button>
                )
              })}
          </div>
        ))}
      </div>
      <p className="ajuda">
        Toque num horário vazio para criar um bloco, ou num bloco para mudar. Marque como "para o ciclo" o tempo que
        fica para os objetivos.
      </p>

      {editando && (
        <FolhaDoBloco
          cicloId={cicloId}
          areas={areas}
          bloco={'id' in editando ? editando : null}
          novo={'id' in editando ? null : editando}
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

function FolhaDoBloco({
  cicloId,
  areas,
  bloco,
  novo,
  aoFechar,
  aoSalvar,
}: {
  cicloId: number
  areas: AreaCurta[]
  bloco: Bloco | null
  novo: { dia: number; inicio: string } | null
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const inicioPadrao = novo?.inicio ?? '08:00'
  const [titulo, setTitulo] = useState(bloco?.titulo ?? '')
  const [dias, setDias] = useState<number[]>(bloco ? [bloco.dia] : [novo?.dia ?? 1])
  const [inicio, setInicio] = useState(bloco ? hhmm(bloco.inicio) : inicioPadrao)
  const [fim, setFim] = useState(
    bloco ? hhmm(bloco.fim) : `${String(Math.min(Number(inicioPadrao.slice(0, 2)) + 1, 23)).padStart(2, '0')}:00`,
  )
  const [areaId, setAreaId] = useState<number | null>(bloco?.area_id ?? null)
  const [paraOCiclo, setParaOCiclo] = useState(bloco?.para_o_ciclo ?? false)
  const [erro, setErro] = useState<string | null>(null)
  const [apagando, setApagando] = useState(false)

  function alternarDia(d: number) {
    if (bloco) return setDias([d])
    setDias(dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d].sort())
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) return setErro('Dê um nome ao bloco.')
    if (dias.length === 0) return setErro('Escolha pelo menos um dia.')
    if (fim <= inicio) return setErro('O fim vem depois do início.')
    const dados = { titulo: titulo.trim(), inicio, fim, area_id: areaId, para_o_ciclo: paraOCiclo }
    const { error } = bloco
      ? await supabase
          .from('semana_base_bloco')
          .update({ ...dados, dia: dias[0] })
          .eq('id', bloco.id)
      : await supabase.from('semana_base_bloco').insert(dias.map((dia) => ({ ...dados, dia, ciclo_id: cicloId })))
    if (error) return setErro(textoDoErro(error, 'Não foi possível salvar o bloco.'))
    aoSalvar()
  }

  async function apagar() {
    if (!bloco) return
    const { error } = await supabase.from('semana_base_bloco').delete().eq('id', bloco.id)
    if (error) return setErro('Não foi possível apagar o bloco.')
    aoSalvar()
  }

  return (
    <Folha titulo={bloco ? 'Bloco da semana base' : 'Novo bloco'} aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        <label>
          Nome
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Por exemplo: Trabalho" />
        </label>
        <fieldset className="dias-do-bloco">
          <legend>{bloco ? 'Dia' : 'Dias (pode marcar vários)'}</legend>
          <div className="segmentos">
            {CURTOS.map((nome, i) => (
              <button
                key={nome}
                type="button"
                aria-pressed={dias.includes(i)}
                className={dias.includes(i) ? 'ativo' : undefined}
                onClick={() => alternarDia(i)}
              >
                {nome}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="lado-a-lado">
          <label>
            Início
            <input type="time" step={900} value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label>
            Fim
            <input type="time" step={900} value={fim} onChange={(e) => setFim(e.target.value)} />
          </label>
        </div>
        <label>
          Área
          <select value={areaId ?? ''} onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sem área (rotina)</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="marcavel">
          <input type="checkbox" checked={paraOCiclo} onChange={(e) => setParaOCiclo(e.target.checked)} />
          Tempo para os objetivos do ciclo
        </label>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <div className="acoes">
          {bloco &&
            (apagando ? (
              <button type="button" className="perigo" onClick={apagar}>
                Apagar de vez
              </button>
            ) : (
              <button type="button" onClick={() => setApagando(true)}>
                Apagar
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
