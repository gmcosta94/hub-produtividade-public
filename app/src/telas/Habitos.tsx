import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { CadastroDeHabitos } from './CadastroDeHabitos'
import { FolhaDoHistorico, HistoricoDosHabitos } from './HistoricoDosHabitos'
import { corDaArea } from '../lib/areas'
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
// As três camadas (o peso do hábito no banco): essencial = em construção, o
// hábito que se está adotando agora; base = padrão mínimo de uma área;
// livre = acompanhamento, registrado quando der, sem cobrança.
type Prioridade = 'essencial' | 'base' | 'livre'
const PESOS: Prioridade[] = ['essencial', 'base', 'livre']
const GRUPO_DO_PESO: Record<Prioridade, string> = {
  essencial: 'Em construção',
  base: 'Padrão mínimo',
  livre: 'Acompanhamento',
}
const DESCRICAO_DO_PESO: Record<Prioridade, string> = {
  essencial: 'O que você está adotando agora: meta na semana, versão mínima e atenção.',
  base: 'O mínimo que segura as áreas fora do foco.',
  livre: 'Registro quando der. Dia sem toque não é falha.',
}

// O filtro de área e o modo (dia ou histórico) ficam lembrados neste aparelho.
function lembrado(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}
function lembrar(chave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(chave)
    else localStorage.setItem(chave, valor)
  } catch {
    // sem armazenamento: o filtro vale só nesta visita
  }
}

export type Habito = {
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

export type Metrica = {
  id: number
  nome: string
  unidade: string
  ordem: number
  area: { id: number; nome: string; ordem: number }
}

// Vem de v_habito_registro: "conta" é decidido pelo banco, não aqui.
export type Registro = { habito_id: number; data: Dia; estado: Estado; valor: number | null; conta: boolean }
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
  agruparPor = 'peso',
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
  const [historicoDe, setHistoricoDe] = useState<{ habito: Habito } | { metrica: Metrica } | null>(null)
  // Filtro e modo só existem na tela cheia de Hábitos; embutida, ela segue quem a chamou.
  const comControles = !embutido && areaId === undefined
  const [areaFiltro, setAreaFiltro] = useState<number | null>(() =>
    comControles && lembrado('habitos.area') ? Number(lembrado('habitos.area')) : null,
  )
  const [modo, setModo] = useState<'dia' | 'historico'>(() =>
    comControles && lembrado('habitos.modo') === 'historico' ? 'historico' : 'dia',
  )
  const [vagas, setVagas] = useState<number | null>(null)
  useEffect(() => {
    if (!comControles) return
    supabase
      .from('parametro')
      .select('valor')
      .eq('chave', 'habitos_essenciais_max')
      .maybeSingle()
      .then(({ data }) => setVagas(data ? Number(data.valor) : null))
  }, [comControles])
  // Hábitos em construção que bateram a meta nas últimas 4 semanas completas:
  // candidatos a graduar para acompanhamento, abrindo a vaga para o próximo.
  const [graduaveis, setGraduaveis] = useState<number[]>([])
  useEffect(() => {
    if (embutido) return
    let cancelado = false
    supabase
      .from('v_habito_semana')
      .select('habito_id, semana, dias_que_contam, meta_ajustada')
      .gte('semana', somarDias(semanaAtual, -28))
      .lt('semana', semanaAtual)
      .then(({ data }) => {
        if (cancelado || !data) return
        const naMeta = new Map<number, number>()
        for (const w of data as { habito_id: number; dias_que_contam: number; meta_ajustada: number | null }[]) {
          if (w.meta_ajustada !== null && w.dias_que_contam >= w.meta_ajustada)
            naMeta.set(w.habito_id, (naMeta.get(w.habito_id) ?? 0) + 1)
        }
        setGraduaveis([...naMeta.entries()].filter(([, n]) => n >= 4).map(([id]) => id))
      })
    return () => {
      cancelado = true
    }
  }, [embutido, semanaAtual, versaoDoCadastro])

  async function graduar(h: Habito) {
    const { error } = await supabase.from('habito').update({ prioridade: 'livre' }).eq('id', h.id)
    if (error) return setErro(`Não foi possível graduar "${h.nome}".`)
    setVersaoDoCadastro((v) => v + 1)
  }

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

  // As áreas que têm hábito ou medida, na ordem das áreas: as opções do filtro.
  const areasDoFiltro = new Map<number, { nome: string; ordem: number; quantos: number }>()
  for (const x of [...habitos, ...metricas]) {
    const a = areasDoFiltro.get(x.area.id) ?? { nome: x.area.nome, ordem: x.area.ordem, quantos: 0 }
    a.quantos++
    areasDoFiltro.set(x.area.id, a)
  }
  const opcoesDeArea = [...areasDoFiltro.entries()].sort((a, b) => a[1].ordem - b[1].ordem)
  const areaEmTela = areaId ?? (areaFiltro !== null && areasDoFiltro.has(areaFiltro) ? areaFiltro : undefined)
  const emConstrucao = habitos.filter((h) => h.prioridade === 'essencial').length

  // Agrupa por área, na ordem das áreas; métricas vêm depois dos hábitos da área.
  const areas = new Map<string, { ordem: number; habitos: Habito[]; metricas: Metrica[] }>()
  // Sem filtro, "Em construção" aparece mesmo vazia: é a vaga à espera do próximo hábito.
  if (agruparPor === 'peso' && comControles && areaEmTela === undefined)
    areas.set(GRUPO_DO_PESO.essencial, { ordem: 0, habitos: [], metricas: [] })
  // Dentro do grupo, os essenciais vêm primeiro.
  const porPeso = [...habitos].sort((a, b) => PESOS.indexOf(a.prioridade) - PESOS.indexOf(b.prioridade))
  for (const h of porPeso) {
    if (areaEmTela !== undefined && h.area.id !== areaEmTela) continue
    const [nome, ordem] =
      agruparPor === 'peso' ? [GRUPO_DO_PESO[h.prioridade], PESOS.indexOf(h.prioridade)] : [h.area.nome, h.area.ordem]
    const g = areas.get(nome) ?? { ordem, habitos: [], metricas: [] }
    g.habitos.push(h)
    areas.set(nome, g)
  }
  // Métrica é sempre acompanhamento.
  for (const m of metricas) {
    if (areaEmTela !== undefined && m.area.id !== areaEmTela) continue
    const [nome, ordem] =
      agruparPor === 'peso' ? [GRUPO_DO_PESO.livre, PESOS.indexOf('livre')] : [m.area.nome, m.area.ordem]
    const g = areas.get(nome) ?? { ordem, habitos: [], metricas: [] }
    g.metricas.push(m)
    areas.set(nome, g)
  }
  const grupos = [...areas.entries()].sort((a, b) => a[1].ordem - b[1].ordem)

  return (
    <Raiz
      className={classes(
        'habitos',
        embutido && 'embutido',
        soHoje && 'so-hoje',
        modo === 'historico' && 'em-historico',
      )}
    >
      {modo === 'historico' ? (
        <header className="cabecalho-do-historico">
          <h1 className="titulo-tela">Histórico</h1>
          <p className="dia-em-tela">Últimas 12 semanas. Toque num hábito para ver seis meses.</p>
        </header>
      ) : (
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
      )}

      {comControles && (
        <div className="controles-dos-habitos">
          <div className="segmentos" role="radiogroup" aria-label="Ver">
            {(['dia', 'historico'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modo === m}
                className={modo === m ? 'ativo' : undefined}
                onClick={() => {
                  setModo(m)
                  lembrar('habitos.modo', m)
                }}
              >
                {m === 'dia' ? 'Dia' : 'Histórico'}
              </button>
            ))}
          </div>
          {opcoesDeArea.length > 1 && (
            <div className="fatias" role="group" aria-label="Filtrar por área">
              <button
                type="button"
                aria-pressed={areaEmTela === undefined}
                onClick={() => {
                  setAreaFiltro(null)
                  lembrar('habitos.area', null)
                }}
              >
                Todas
              </button>
              {opcoesDeArea.map(([id, a]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={areaEmTela === id}
                  onClick={() => {
                    const novo = areaEmTela === id ? null : id
                    setAreaFiltro(novo)
                    lembrar('habitos.area', novo === null ? null : String(novo))
                  }}
                >
                  <i className="ponto-da-area" style={{ background: corDaArea(a.nome) }} />
                  {a.nome}
                  <small>{a.quantos}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {modo === 'historico' ? (
        <HistoricoDosHabitos
          grupos={grupos.map(([titulo, g]) => ({ titulo, habitos: g.habitos, metricas: g.metricas }))}
          semanas={12}
          versao={versaoDoCadastro}
          aoAbrir={setHistoricoDe}
        />
      ) : (
        <>
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
              {areaEmTela === undefined ? 'Nenhum hábito cadastrado ainda.' : 'Esta área ainda não tem hábitos.'}
            </p>
          )}

          <div className="grupos">
            {grupos.map(([area, g]) =>
              agruparPor === 'peso' && area === GRUPO_DO_PESO.livre ? (
                <section key={area} className="acompanhamento camada camada-livre">
                  <h2>{area}</h2>
                  {comControles && <p className="descricao-da-camada">{DESCRICAO_DO_PESO.livre}</p>}
                  <div className="fichas" role="group" aria-label="Acompanhamento">
                    {g.habitos.map((h) => {
                      const r = registros.find((x) => x.habito_id === h.id && x.data === dia)
                      const marcado = r?.estado === 'feito' || r?.estado === 'minimo'
                      return (
                        <button
                          key={h.id}
                          type="button"
                          className={classes('ficha', marcado && 'marcada')}
                          aria-pressed={marcado}
                          onClick={() =>
                            h.tipo === 'sim_nao'
                              ? tocar(h, dia, r, 'sim')
                              : setEditando({ tipo: 'habito', habito: h, dia })
                          }
                        >
                          <i className="ponto-da-area" style={{ background: corDaArea(h.area.nome) }} />
                          {h.nome}
                          {h.tipo === 'quantidade' && r?.valor != null && (
                            <small>
                              {numero.format(r.valor)} {h.unidade}
                            </small>
                          )}
                        </button>
                      )
                    })}
                    {g.metricas.map((m) => {
                      const medida = medidas.find((x) => x.metrica_id === m.id && x.data === dia)
                      return (
                        <button
                          key={`m${m.id}`}
                          type="button"
                          className={classes('ficha', medida && 'marcada')}
                          onClick={() => setEditando({ tipo: 'metrica', metrica: m, dia })}
                        >
                          <i className="ponto-da-area" style={{ background: corDaArea(m.area.nome) }} />
                          {m.nome}
                          {medida && (
                            <small>
                              {numero.format(medida.valor)} {m.unidade}
                            </small>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ) : (
                <Grupo
                  key={area}
                  titulo={areaId === undefined ? area : null}
                  recolhido={false}
                  quantos={g.habitos.length + g.metricas.length}
                  classe={agruparPor === 'peso' ? `camada camada-${pesoDoGrupo(area)}` : undefined}
                  detalhe={
                    comControles && pesoDoGrupo(area) === 'essencial' && vagas !== null
                      ? `${emConstrucao} de ${vagas} vagas`
                      : undefined
                  }
                  descricao={
                    comControles && agruparPor === 'peso' ? DESCRICAO_DO_PESO[pesoDoGrupo(area) ?? 'base'] : undefined
                  }
                >
                  {g.habitos.length === 0 && g.metricas.length === 0 && (
                    <p className="vazio-da-camada">
                      Nenhum hábito em construção. Quando quiser adotar um, cadastre abaixo com meta e versão mínima.
                    </p>
                  )}
                  {g.habitos.map((h) => {
                    const limite = limiteDoHabito(h)
                    const r = registros.find((x) => x.habito_id === h.id && x.data === dia)
                    const foraDoDia = h.dias_da_semana !== null && !h.dias_da_semana.includes(indiceDoDia)
                    return (
                      <div key={h.id} className="linha">
                        <div className="rotulo">
                          <span className="nome">
                            {agruparPor === 'peso' && areaId === undefined && (
                              <i className="ponto-da-area" style={{ background: corDaArea(h.area.nome) }} />
                            )}
                            {soHoje ? (
                              h.nome
                            ) : (
                              <button
                                type="button"
                                className="nome-do-habito"
                                aria-label={`Histórico de ${h.nome}`}
                                onClick={() => setHistoricoDe({ habito: h })}
                              >
                                {h.nome}
                              </button>
                            )}
                            {agruparPor === 'area' && h.prioridade === 'essencial' && (
                              <small className="chip">em construção</small>
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
                          {h.prioridade === 'essencial' && graduaveis.includes(h.id) && (
                            <span className="graduar">
                              4 semanas na meta: já virou rotina?{' '}
                              <button type="button" className="link" onClick={() => graduar(h)}>
                                passar para acompanhamento
                              </button>
                            </span>
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
                            {soHoje ? (
                              m.nome
                            ) : (
                              <button
                                type="button"
                                className="nome-do-habito"
                                aria-label={`Histórico de ${m.nome}`}
                                onClick={() => setHistoricoDe({ metrica: m })}
                              >
                                {m.nome}
                              </button>
                            )}
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
              ),
            )}
          </div>
        </>
      )}

      <details className="como-funciona dica">
        <summary>Como funciona</summary>
        <p>
          Três camadas. <strong>Em construção</strong>: os poucos hábitos que você está adotando agora, com meta na
          semana e versão mínima. <strong>Padrão mínimo</strong>: o que segura as áreas fora do foco.{' '}
          <strong>Acompanhamento</strong>: o que vale registrar quando der (suplementos, passos, peso). Um toque marca,
          e dia sem toque não é falha.
        </p>
        <p>
          Nas duas primeiras, ✓ marca feito e ✕ marca "não fiz"; tocar de novo limpa. Segure para versão mínima ou para
          dispensar o dia. Quando um hábito em construção passa 4 semanas na meta, o hub sugere levá-lo para
          acompanhamento, abrindo a vaga para o próximo.
        </p>
        <p>
          O filtro de área mostra só os hábitos de uma área. Em Histórico, cada hábito aparece como um calendário das
          últimas semanas (uma coluna por semana, de domingo a sábado) e, se tem meta, uma faixa embaixo com as semanas
          em que ela foi cumprida. Tocar no nome de um hábito abre seis meses.
        </p>
      </details>

      {!embutido && <CadastroDeHabitos aoMudar={() => setVersaoDoCadastro((v) => v + 1)} />}

      {historicoDe && (
        <FolhaDoHistorico alvo={historicoDe} versao={versaoDoCadastro} aoFechar={() => setHistoricoDe(null)} />
      )}
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
  classe,
  detalhe,
  descricao,
  children,
}: {
  titulo: string | null
  recolhido: boolean
  quantos: number
  classe?: string
  detalhe?: string
  descricao?: string
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
    <section className={classe}>
      {titulo && (
        <h2>
          {titulo}
          {detalhe && <span className="vagas">{detalhe}</span>}
        </h2>
      )}
      {descricao && <p className="descricao-da-camada">{descricao}</p>}
      {children}
    </section>
  )
}

function pesoDoGrupo(titulo: string): Prioridade | undefined {
  return PESOS.find((p) => GRUPO_DO_PESO[p] === titulo)
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
