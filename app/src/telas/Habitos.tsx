import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { CadastroDeHabitos } from './CadastroDeHabitos'
import { Folha } from '../componentes/Folha'
import { lerNumero, numero } from '../lib/formato'
import {
  LETRAS_DA_SEMANA,
  diaDoMes,
  diasDaSemana,
  hoje,
  inicioDaSemana,
  intervaloDaSemana,
  porExtenso,
  somarDias,
  type Dia,
} from '../lib/datas'

type Estado = 'feito' | 'minimo' | 'nao' | 'dispensado'
// O peso do hábito no ciclo: essencial beira o inegociável, base sustenta o
// padrão mínimo de uma área, livre é registrado quando a pessoa quiser.
type Prioridade = 'essencial' | 'base' | 'livre'
const PESOS: Prioridade[] = ['essencial', 'base', 'livre']
const GRUPO_DO_PESO: Record<Prioridade, string> = {
  essencial: 'Essenciais do ciclo',
  base: 'Padrão mínimo das áreas',
  livre: 'Registro livre',
}

type Habito = {
  id: number
  nome: string
  tipo: 'sim_nao' | 'quantidade'
  unidade: string | null
  comparacao: 'pelo_menos' | 'no_maximo' | null
  meta_valor: number | null
  meta_dias: number | null
  versao_minima: string | null
  dias_da_semana: number[] | null
  prioridade: Prioridade
  ordem: number
  area: { id: number; nome: string; ordem: number }
}

type Metrica = {
  id: number
  nome: string
  unidade: string
  ordem: number
  area: { id: number; nome: string; ordem: number }
}

// Vem de v_habito_registro: "conta" é decidido pelo banco, não aqui.
type Registro = { habito_id: number; data: Dia; estado: Estado; valor: number | null; conta: boolean }
type Semana = {
  habito_id: number
  dias_que_contam: number
  soma: number | null
  meta_ajustada: number | null
}
type Medida = { metrica_id: number; data: Dia; valor: number }

type Editando = { tipo: 'habito'; habito: Habito; dia: Dia } | { tipo: 'metrica'; metrica: Metrica; dia: Dia }

function limiteDoHabito(h: Habito): string | null {
  if (h.tipo !== 'quantidade' || h.meta_valor === null) return null
  const prefixo = h.comparacao === 'no_maximo' ? 'no máximo' : 'pelo menos'
  return `${prefixo} ${numero.format(h.meta_valor)} ${h.unidade}`
}

function resumoDaSemana(h: Habito, s: Semana | undefined): string {
  if (h.tipo === 'quantidade' && h.meta_valor === null) {
    return `${numero.format(s?.soma ?? 0)} ${h.unidade}`
  }
  const dias = s?.dias_que_contam ?? 0
  if (h.meta_dias !== null) return `${dias} de ${s?.meta_ajustada ?? h.meta_dias}`
  return dias === 1 ? '1 dia' : `${dias} dias`
}

function textoDoEstado(h: Habito, r: Registro | undefined): string {
  if (!r) return 'sem registro'
  if (r.estado === 'dispensado') return 'dispensado'
  if (r.estado === 'nao') return 'não fiz'
  const base = r.estado === 'minimo' ? 'versão mínima' : 'feito'
  return r.valor !== null ? `${numero.format(r.valor)} ${h.unidade ?? ''}, ${base}` : base
}

// Sem areaId, mostra os hábitos de todas as áreas. Com areaId, só os dela;
// é assim que a página de uma área mostra os próprios hábitos.
// soHoje esconde a semana e o seletor de dia (é como Hoje mostra os hábitos).
// marcarComo diz o que um toque grava: num dia mínimo, a versão mínima.
export function Habitos({
  areaId,
  embutido = false,
  soHoje = false,
  marcarComo = 'feito',
  mostrarMinima = false,
  agruparPor = 'area',
  diaInicial,
}: {
  areaId?: number
  embutido?: boolean
  soHoje?: boolean
  marcarComo?: 'feito' | 'minimo'
  mostrarMinima?: boolean
  agruparPor?: 'area' | 'peso'
  diaInicial?: Dia
}) {
  const Raiz = embutido ? 'div' : 'main'
  const diaDeHoje = hoje()
  const semanaAtual = inicioDaSemana(diaDeHoje)
  // O dia selecionado manda na tela: cada linha tem um box só, o desse dia.
  // A semana em tela é a semana do dia selecionado.
  const [dia, setDia] = useState<Dia>(diaInicial && diaInicial <= diaDeHoje ? diaInicial : diaDeHoje)
  const [versaoDoCadastro, setVersaoDoCadastro] = useState(0)
  const semana = inicioDaSemana(dia)
  const dias = diasDaSemana(semana)
  const indiceDoDia = dias.indexOf(dia)

  const [habitos, setHabitos] = useState<Habito[] | null>(null)
  const [metricas, setMetricas] = useState<Metrica[]>([])
  const [registros, setRegistros] = useState<Registro[]>([])
  const [semanas, setSemanas] = useState<Semana[]>([])
  const [medidas, setMedidas] = useState<Medida[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<Editando | null>(null)

  // Cadastro: muda pouco, carrega uma vez.
  useEffect(() => {
    let cancelado = false
    Promise.all([
      supabase
        .from('habito')
        .select(
          'id, nome, tipo, unidade, comparacao, meta_valor, meta_dias, versao_minima, dias_da_semana, prioridade, ordem, area:area_id (id, nome, ordem)',
        )
        .eq('ativo', true)
        .order('ordem'),
      supabase
        .from('metrica')
        .select('id, nome, unidade, ordem, area:area_id (id, nome, ordem)')
        .eq('ativa', true)
        .order('ordem'),
    ]).then(([h, m]) => {
      if (cancelado) return
      if (h.error || m.error) {
        setErro('Não foi possível carregar os hábitos.')
        setHabitos([])
        return
      }
      setHabitos(h.data as unknown as Habito[])
      setMetricas(m.data as unknown as Metrica[])
    })
    return () => {
      cancelado = true
    }
  }, [versaoDoCadastro])

  // Registros da semana em tela. Devolve a função que cancela a aplicação do resultado.
  const carregarSemana = useCallback((inicio: Dia) => {
    let cancelado = false
    const fim = somarDias(inicio, 6)
    Promise.all([
      supabase
        .from('v_habito_registro')
        .select('habito_id, data, estado, valor, conta')
        .gte('data', inicio)
        .lte('data', fim),
      supabase.from('v_habito_semana').select('habito_id, dias_que_contam, soma, meta_ajustada').eq('semana', inicio),
      supabase.from('metrica_registro').select('metrica_id, data, valor').gte('data', inicio).lte('data', fim),
    ]).then(([r, s, m]) => {
      if (cancelado) return
      if (r.error || s.error || m.error) {
        setErro('Não foi possível carregar a semana.')
        return
      }
      setRegistros(r.data as Registro[])
      setSemanas(s.data as Semana[])
      setMedidas(m.data as Medida[])
    })
    return () => {
      cancelado = true
    }
  }, [])

  useEffect(() => carregarSemana(semana), [semana, carregarSemana])

  async function marcarHabito(h: Habito, dia: Dia, estado: Estado | null, valor: number | null) {
    setErro(null)
    const { error } = await supabase.rpc('marcar_habito', {
      p_habito_id: h.id,
      p_data: dia,
      p_estado: estado,
      p_valor: valor,
    })
    if (error) setErro(`Não foi possível salvar "${h.nome}". Tente de novo.`)
    carregarSemana(semana)
  }

  async function marcarMetrica(m: Metrica, dia: Dia, valor: number | null) {
    setErro(null)
    const { error } = await supabase.rpc('marcar_metrica', {
      p_metrica_id: m.id,
      p_data: dia,
      p_valor: valor,
    })
    if (error) setErro(`Não foi possível salvar "${m.nome}". Tente de novo.`)
    carregarSemana(semana)
  }

  // Sim ou não: o ✓ marca feito (ou mínimo, num dia mínimo) e o ✕ marca "não fiz".
  // Tocar de novo no que já está marcado limpa o dia.
  // Quantidade sempre abre a folha, porque precisa do número.
  function tocar(h: Habito, dia: Dia, r: Registro | undefined, botao: 'sim' | 'nao' = 'sim') {
    if (h.tipo === 'quantidade') {
      setEditando({ tipo: 'habito', habito: h, dia })
      return
    }
    const jaMarcado = botao === 'sim' ? r?.estado === 'feito' || r?.estado === 'minimo' : r?.estado === 'nao'
    const novo: Estado | null = jaMarcado ? null : botao === 'sim' ? marcarComo : 'nao'
    // Resposta imediata na tela; o banco confirma em seguida.
    setRegistros((atuais) => {
      const outros = atuais.filter((x) => !(x.habito_id === h.id && x.data === dia))
      return novo
        ? [...outros, { habito_id: h.id, data: dia, estado: novo, valor: null, conta: novo !== 'nao' }]
        : outros
    })
    void marcarHabito(h, dia, novo, null)
  }

  if (habitos === null) return null

  // Agrupa por área, na ordem das áreas; métricas vêm depois dos hábitos da área.
  const areas = new Map<string, { ordem: number; habitos: Habito[]; metricas: Metrica[] }>()
  // Dentro do grupo, os essenciais vêm primeiro.
  const porPeso = [...habitos].sort((a, b) => PESOS.indexOf(a.prioridade) - PESOS.indexOf(b.prioridade))
  for (const h of porPeso) {
    if (areaId !== undefined && h.area.id !== areaId) continue
    const [nome, ordem] =
      agruparPor === 'peso' ? [GRUPO_DO_PESO[h.prioridade], PESOS.indexOf(h.prioridade)] : [h.area.nome, h.area.ordem]
    const g = areas.get(nome) ?? { ordem, habitos: [], metricas: [] }
    g.habitos.push(h)
    areas.set(nome, g)
  }
  // Métrica é sempre registro livre.
  for (const m of metricas) {
    if (areaId !== undefined && m.area.id !== areaId) continue
    const [nome, ordem] =
      agruparPor === 'peso' ? [GRUPO_DO_PESO.livre, PESOS.indexOf('livre')] : [m.area.nome, m.area.ordem]
    const g = areas.get(nome) ?? { ordem, habitos: [], metricas: [] }
    g.metricas.push(m)
    areas.set(nome, g)
  }
  const grupos = [...areas.entries()].sort((a, b) => a[1].ordem - b[1].ordem)

  return (
    <Raiz className={classes('habitos', embutido && 'embutido', soHoje && 'so-hoje')}>
      <header className="semana">
        <button type="button" aria-label="Semana anterior" onClick={() => setDia(somarDias(dia, -7))}>
          ‹
        </button>
        <div>
          <h1 className="titulo-tela">{intervaloDaSemana(semana)}</h1>
          <p className="dia-em-tela">
            {porExtenso(dia)}
            {dia === diaDeHoje ? (
              ' · hoje'
            ) : (
              <>
                {' · '}
                <button type="button" className="link" onClick={() => setDia(diaDeHoje)}>
                  voltar para hoje
                </button>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          aria-label="Próxima semana"
          disabled={semana === semanaAtual}
          onClick={() => {
            const d = somarDias(dia, 7)
            setDia(d > diaDeHoje ? diaDeHoje : d)
          }}
        >
          ›
        </button>
      </header>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <div className="dias cabecalho" role="tablist" aria-label="Dia da semana">
        {dias.map((d, i) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === dia}
            aria-label={porExtenso(d)}
            className={classes(d === dia && 'selecionado', d === diaDeHoje && 'hoje')}
            disabled={d > diaDeHoje}
            onClick={() => setDia(d)}
          >
            {LETRAS_DA_SEMANA[i]}
            <small>{diaDoMes(d)}</small>
          </button>
        ))}
      </div>

      {grupos.length === 0 && (
        <p className="vazio">
          {areaId === undefined ? 'Nenhum hábito cadastrado ainda.' : 'Esta área ainda não tem hábitos.'}
        </p>
      )}

      <div className="grupos">
        {grupos.map(([area, g]) => (
          <Grupo
            key={area}
            titulo={areaId === undefined ? area : null}
            recolhido={agruparPor === 'peso' && area === GRUPO_DO_PESO.livre}
            quantos={g.habitos.length + g.metricas.length}
          >
            {g.habitos.map((h) => {
              const limite = limiteDoHabito(h)
              const r = registros.find((x) => x.habito_id === h.id && x.data === dia)
              const foraDoDia = h.dias_da_semana !== null && !h.dias_da_semana.includes(indiceDoDia)
              return (
                <div key={h.id} className="linha">
                  <div className="rotulo">
                    <span className="nome">
                      {h.nome}
                      {agruparPor === 'area' && h.prioridade === 'essencial' && (
                        <small className="chip">essencial</small>
                      )}
                      {agruparPor === 'area' && h.prioridade === 'base' && (
                        <small className="chip neutro">padrão mínimo</small>
                      )}
                      {limite && <small>{limite}</small>}
                      {mostrarMinima && h.versao_minima && <small>mínimo: {h.versao_minima}</small>}
                    </span>
                    <span className="na-semana">
                      <span className="marcas" aria-hidden="true">
                        {dias.map((d) => (
                          <i
                            key={d}
                            className={classes(
                              classeDaCelula(registros.find((x) => x.habito_id === h.id && x.data === d)),
                              d === dia && 'atual',
                            )}
                          />
                        ))}
                      </span>
                      <span className="resumo">
                        {resumoDaSemana(
                          h,
                          semanas.find((s) => s.habito_id === h.id),
                        )}
                      </span>
                    </span>
                    {h.meta_dias !== null && (
                      <MetaDaSemana semana={semanas.find((s) => s.habito_id === h.id)} meta={h.meta_dias} />
                    )}
                  </div>
                  {h.tipo === 'sim_nao' ? (
                    <div className="botoes-habito">
                      <Celula
                        rotulo={`${h.nome}, ${porExtenso(dia)}: marcar feito (agora: ${textoDoEstado(h, r)})`}
                        desligada={foraDoDia}
                        classe={
                          classes(
                            'pequena',
                            r?.estado === 'feito' && 'feito',
                            r?.estado === 'minimo' && 'minimo',
                            r?.estado === 'dispensado' && 'dispensado',
                          ) ?? ''
                        }
                        aoTocar={() => tocar(h, dia, r, 'sim')}
                        aoSegurar={() => setEditando({ tipo: 'habito', habito: h, dia })}
                      >
                        {r?.estado === 'minimo' ? 'mín' : r?.estado === 'dispensado' ? '–' : '✓'}
                      </Celula>
                      <Celula
                        rotulo={`${h.nome}, ${porExtenso(dia)}: marcar não fiz`}
                        desligada={foraDoDia}
                        classe={classes('pequena', r?.estado === 'nao' && 'nao') ?? ''}
                        aoTocar={() => tocar(h, dia, r, 'nao')}
                        aoSegurar={() => setEditando({ tipo: 'habito', habito: h, dia })}
                      >
                        ✕
                      </Celula>
                    </div>
                  ) : (
                    <Celula
                      rotulo={`${h.nome}, ${porExtenso(dia)}: ${textoDoEstado(h, r)}`}
                      desligada={foraDoDia}
                      classe={classes('campo-numero', classeDaCelula(r)) ?? ''}
                      aoTocar={() => tocar(h, dia, r)}
                      aoSegurar={() => setEditando({ tipo: 'habito', habito: h, dia })}
                    >
                      <CampoNumero
                        valor={r?.estado === 'dispensado' ? null : (r?.valor ?? null)}
                        unidade={h.unidade ?? ''}
                        dispensado={r?.estado === 'dispensado'}
                      />
                    </Celula>
                  )}
                </div>
              )
            })}
            {g.metricas.map((m) => {
              const medida = medidas.find((x) => x.metrica_id === m.id && x.data === dia)
              const abrir = () => setEditando({ tipo: 'metrica', metrica: m, dia })
              return (
                <div key={`m${m.id}`} className="linha">
                  <div className="rotulo">
                    <span className="nome">
                      {m.nome}
                      <small>{m.unidade}</small>
                    </span>
                    <span className="na-semana">
                      <span className="marcas" aria-hidden="true">
                        {dias.map((d) => (
                          <i
                            key={d}
                            className={classes(
                              medidas.some((x) => x.metrica_id === m.id && x.data === d) && 'feito',
                              d === dia && 'atual',
                            )}
                          />
                        ))}
                      </span>
                    </span>
                  </div>
                  <Celula
                    rotulo={`${m.nome}, ${porExtenso(dia)}: ${
                      medida ? `${numero.format(medida.valor)} ${m.unidade}` : 'sem registro'
                    }`}
                    desligada={false}
                    classe="campo-numero"
                    aoTocar={abrir}
                    aoSegurar={abrir}
                  >
                    <CampoNumero valor={medida?.valor ?? null} unidade={m.unidade} dispensado={false} />
                  </Celula>
                </div>
              )
            })}
          </Grupo>
        ))}
      </div>

      <details className="como-funciona dica">
        <summary>Como funciona</summary>
        <p>
          ✓ marca feito e ✕ marca "não fiz"; tocar de novo limpa. Nos números, toque para digitar. Segure para versão
          mínima ou para dispensar o dia. Os quadradinhos mostram a semana, e a barra fina, a meta semanal.
        </p>
      </details>

      {!embutido && <CadastroDeHabitos aoMudar={() => setVersaoDoCadastro((v) => v + 1)} />}

      {editando?.tipo === 'habito' && (
        <FolhaDoHabito
          key={`${editando.habito.id}-${editando.dia}`}
          habito={editando.habito}
          dia={editando.dia}
          registro={registros.find((x) => x.habito_id === editando.habito.id && x.data === editando.dia)}
          aoFechar={() => setEditando(null)}
          aoSalvar={(estado, valor) => {
            const { habito, dia } = editando
            setEditando(null)
            void marcarHabito(habito, dia, estado, valor)
          }}
        />
      )}
      {editando?.tipo === 'metrica' && (
        <FolhaDaMetrica
          key={`m${editando.metrica.id}-${editando.dia}`}
          metrica={editando.metrica}
          dia={editando.dia}
          medida={medidas.find((x) => x.metrica_id === editando.metrica.id && x.data === editando.dia)}
          aoFechar={() => setEditando(null)}
          aoSalvar={(valor) => {
            const { metrica, dia } = editando
            setEditando(null)
            void marcarMetrica(metrica, dia, valor)
          }}
        />
      )}
    </Raiz>
  )
}

// Um grupo de linhas. O grupo de registro livre, em Hoje, vem recolhido.
function Grupo({
  titulo,
  recolhido,
  quantos,
  children,
}: {
  titulo: string | null
  recolhido: boolean
  quantos: number
  children: ReactNode
}) {
  if (recolhido) {
    return (
      <details className="grupo">
        <summary>
          {titulo} ({quantos})
        </summary>
        {children}
      </details>
    )
  }
  return (
    <section>
      {titulo && <h2>{titulo}</h2>}
      {children}
    </section>
  )
}

function classes(...nomes: (string | false | null | undefined)[]): string | undefined {
  return nomes.filter(Boolean).join(' ') || undefined
}

function classeDaCelula(r: Registro | undefined): string {
  if (!r) return ''
  if (r.estado === 'dispensado') return 'dispensado'
  if (r.estado === 'nao') return 'nao'
  if (r.estado === 'minimo') return 'minimo'
  if (r.valor !== null) return r.conta ? 'feito' : 'numero'
  return 'feito'
}

// A barra fina da meta da semana, como a do orçamento no hub financeiro.
function MetaDaSemana({ semana, meta }: { semana: Semana | undefined; meta: number }) {
  const alvo = semana?.meta_ajustada ?? meta
  const feitos = semana?.dias_que_contam ?? 0
  const parte = alvo > 0 ? Math.min(1, feitos / alvo) : 0
  return (
    <span className="meta-da-semana" role="img" aria-label={`${feitos} de ${alvo} dias da meta da semana`}>
      <i style={{ width: `${Math.round(parte * 100)}%` }} />
    </span>
  )
}

// O box de um hábito de quantidade ou de uma medida: mostra que ali vai um número.
function CampoNumero({ valor, unidade, dispensado }: { valor: number | null; unidade: string; dispensado: boolean }) {
  return (
    <>
      <strong>{dispensado ? '–' : valor !== null ? numero.format(valor) : '#'}</strong>
      <small>{unidade}</small>
    </>
  )
}

// Uma célula da grade. Toque curto e toque longo (ou clique direito) fazem coisas diferentes.
function Celula({
  rotulo,
  desligada,
  classe,
  aoTocar,
  aoSegurar,
  children,
}: {
  rotulo: string
  desligada: boolean
  classe: string
  aoTocar: () => void
  aoSegurar: () => void
  children: ReactNode
}) {
  const temporizador = useRef<number | undefined>(undefined)
  const segurou = useRef(false)

  function cancelar() {
    window.clearTimeout(temporizador.current)
  }

  return (
    <button
      type="button"
      className={`celula ${classe}`}
      aria-label={rotulo}
      disabled={desligada}
      onPointerDown={() => {
        segurou.current = false
        temporizador.current = window.setTimeout(() => {
          segurou.current = true
          aoSegurar()
        }, 500)
      }}
      onPointerUp={cancelar}
      onPointerLeave={cancelar}
      onPointerCancel={cancelar}
      onContextMenu={(e) => {
        e.preventDefault()
        cancelar()
        segurou.current = true
        aoSegurar()
      }}
      onClick={() => {
        if (segurou.current) {
          segurou.current = false
          return
        }
        aoTocar()
      }}
    >
      {children}
    </button>
  )
}

function FolhaDoHabito({
  habito,
  dia,
  registro,
  aoFechar,
  aoSalvar,
}: {
  habito: Habito
  dia: Dia
  registro: Registro | undefined
  aoFechar: () => void
  aoSalvar: (estado: Estado | null, valor: number | null) => void
}) {
  const [estado, setEstado] = useState<Estado>(registro?.estado ?? 'feito')
  const [texto, setTexto] = useState(registro?.valor != null ? numero.format(registro.valor) : '')
  const [aviso, setAviso] = useState<string | null>(null)
  const pedeNumero = habito.tipo === 'quantidade' && estado !== 'dispensado' && estado !== 'nao'
  const limite = limiteDoHabito(habito)

  function salvar(e: FormEvent) {
    e.preventDefault()
    if (!pedeNumero) {
      aoSalvar(estado, null)
      return
    }
    const valor = lerNumero(texto)
    if (valor === null) {
      setAviso('Digite um número.')
      return
    }
    aoSalvar(estado, valor)
  }

  return (
    <Folha titulo={habito.nome} subtitulo={porExtenso(dia)} aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        <div className="segmentos" role="radiogroup" aria-label="Como foi">
          {(habito.tipo === 'sim_nao'
            ? (['feito', 'minimo', 'nao', 'dispensado'] as const)
            : (['feito', 'minimo', 'dispensado'] as const)
          ).map((op) => (
            <button
              key={op}
              type="button"
              role="radio"
              aria-checked={estado === op}
              className={estado === op ? 'ativo' : undefined}
              onClick={() => setEstado(op)}
            >
              {op === 'feito' ? 'Feito' : op === 'minimo' ? 'Mínimo' : op === 'nao' ? 'Não fiz' : 'Dispensado'}
            </button>
          ))}
        </div>
        {estado === 'minimo' && (
          <p className="ajuda">
            {habito.versao_minima
              ? `Versão mínima: ${habito.versao_minima}. Conta para a semana.`
              : 'A versão mínima conta para a semana.'}
          </p>
        )}
        {estado === 'dispensado' && (
          <p className="ajuda">O dia sai da conta da semana. Serve para viagem, doença e afins.</p>
        )}
        {estado === 'nao' && (
          <p className="ajuda">Fica registrado que não aconteceu. Não conta para a semana, e a meta não muda.</p>
        )}
        {pedeNumero && (
          <label>
            <span>
              Quanto ({habito.unidade}){limite && <small> · {limite}</small>}
            </span>
            <input
              inputMode="decimal"
              autoFocus
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value)
                setAviso(null)
              }}
            />
          </label>
        )}
        {aviso && <p className="erro">{aviso}</p>}
        <div className="acoes">
          {registro && (
            <button type="button" onClick={() => aoSalvar(null, null)}>
              Limpar o dia
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

function FolhaDaMetrica({
  metrica,
  dia,
  medida,
  aoFechar,
  aoSalvar,
}: {
  metrica: Metrica
  dia: Dia
  medida: Medida | undefined
  aoFechar: () => void
  aoSalvar: (valor: number | null) => void
}) {
  const [texto, setTexto] = useState(medida ? numero.format(medida.valor) : '')
  const [aviso, setAviso] = useState<string | null>(null)

  function salvar(e: FormEvent) {
    e.preventDefault()
    const valor = lerNumero(texto)
    if (valor === null) {
      setAviso('Digite um número.')
      return
    }
    aoSalvar(valor)
  }

  return (
    <Folha titulo={metrica.nome} subtitulo={porExtenso(dia)} aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        <label>
          Valor ({metrica.unidade})
          <input
            inputMode="decimal"
            autoFocus
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              setAviso(null)
            }}
          />
        </label>
        {aviso && <p className="erro">{aviso}</p>}
        <div className="acoes">
          {medida && (
            <button type="button" onClick={() => aoSalvar(null)}>
              Limpar o dia
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
