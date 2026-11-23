import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Estrategias } from '../componentes/Estrategias'
import { lerNumero, numero } from '../lib/formato'
import { useConsulta, type Ir } from '../lib/dados'
import { CAIXA, ELOS, POSICAO, SETAS, TAMANHO_DO_MAPA, type IdDoElo } from '../lib/fluxo'

type Parametro = { chave: string; valor: number; unidade: string | null; descricao: string | null }
type TextoCurto = { id: number; chave: string | null; titulo: string }

// A Constituição: como o hub é construído, em que teoria cada parte se apoia,
// como as partes se ligam, onde entra a sua escolha e quais são as regras.
export function Sistema({ textoId, ir }: { textoId?: number; ir: Ir }) {
  const area = useConsulta<{ id: number } | null>(() =>
    supabase.from('area').select('id').eq('tipo', 'sistema').maybeSingle(),
  )
  const parametros = useConsulta<Parametro[]>(() =>
    supabase.from('parametro').select('chave, valor, unidade, descricao').order('chave'),
  )
  const textos = useConsulta<TextoCurto[]>(() =>
    supabase.from('estrategia').select('id, chave, titulo, area:area_id!inner (tipo)').eq('area.tipo', 'sistema'),
  )
  const areas = useConsulta<{ nome: string; modo: string }[]>(() =>
    supabase.from('area').select('nome, modo').eq('tipo', 'vida').eq('ativa', true).order('ordem'),
  )
  const [elo, setElo] = useState<IdDoElo>('sistema')
  const [abrir, setAbrir] = useState<number | undefined>(textoId)
  const documento = useRef<HTMLElement>(null)

  function abrirTexto(id: number) {
    setAbrir(id)
    requestAnimationFrame(() => documento.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <main>
      <h1 className="titulo-tela">Sistema</h1>
      <p className="ajuda">
        A Constituição do hub: como ele é construído, em que cada parte se apoia, como as partes se ligam, onde entra a
        sua escolha e quais regras valem. Toque numa parte do mapa para ver a explicação.
      </p>

      <div className="colunas larga-estreita">
        <div className="coluna">
          <section className="bloco primeiro">
            <h2 className="titulo-bloco">Como o hub funciona</h2>
            <MapaDoHub selecionado={elo} aoSelecionar={setElo} />
            <p className="legenda-do-mapa">
              <span>
                <i className="traco cheio" /> o plano desce de escala
              </span>
              <span>
                <i className="traco tracejado" /> a revisão sobe: fim do dia, sexta, fim do ciclo
              </span>
            </p>
          </section>

          <ExplicacaoDoElo
            id={elo}
            parametros={parametros.dados ?? []}
            textos={textos.dados ?? []}
            areas={areas.dados ?? []}
            aoSelecionar={setElo}
            aoAbrirTexto={abrirTexto}
            aoMudarParametro={parametros.recarregar}
            ir={ir}
          />

          <section className="bloco" ref={documento}>
            <h2 className="titulo-bloco">Textos da Constituição</h2>
            <p className="ajuda">
              O que cada parte executa, em texto. Mudar um texto é uma emenda e pede o motivo; o histórico fica
              guardado.
            </p>
            {area.dados && <Estrategias key={abrir ?? 'nenhum'} areaId={area.dados.id} constituicao abrirId={abrir} />}
          </section>
        </div>

        <section className="bloco coluna fixa">
          <h2 className="titulo-bloco">Limites em números</h2>
          <p className="ajuda">
            O banco aplica estes números: quando um limite é atingido, o hub recusa em vez de aceitar mais.
          </p>
          <ul className="lista">
            {(parametros.dados ?? []).map((p) => (
              <LinhaDoParametro
                key={`${p.chave}-${p.valor}`}
                prefixo="limite"
                parametro={p}
                aoMudar={parametros.recarregar}
              />
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}

function MapaDoHub({ selecionado, aoSelecionar }: { selecionado: IdDoElo; aoSelecionar: (id: IdDoElo) => void }) {
  const ligados = new Set<IdDoElo>(ELOS[selecionado].ligacoes.map((l) => l.com))
  const tocaASeta = (de: IdDoElo, para: IdDoElo) => selecionado === de || selecionado === para
  const { largura, altura } = TAMANHO_DO_MAPA

  return (
    <svg
      className="mapa-do-hub"
      viewBox={`0 0 ${largura} ${altura}`}
      role="group"
      aria-label="Mapa do hub: áreas, escalas do plano e execução, dentro da moldura do Sistema"
    >
      <defs>
        <marker
          id="ponta"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" />
        </marker>
      </defs>
      <g
        className={`moldura${selecionado === 'sistema' ? ' selecionada' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={selecionado === 'sistema'}
        aria-label="Sistema"
        onClick={() => aoSelecionar('sistema')}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && aoSelecionar('sistema')}
      >
        <rect x={2} y={2} width={largura - 4} height={altura - 6} rx={14} />
        <text x={16} y={24}>
          Sistema: regras e limites em cada escala
        </text>
      </g>
      {SETAS.map((s, i) => (
        <path
          key={i}
          d={s.d}
          className={`seta ${s.tipo}${tocaASeta(s.de, s.para) ? ' acesa' : ''}`}
          markerEnd="url(#ponta)"
        />
      ))}
      {(Object.keys(POSICAO) as Exclude<IdDoElo, 'sistema'>[]).map((id) => {
        const { x, y } = POSICAO[id]
        const estado = id === selecionado ? ' selecionado' : ligados.has(id) ? ' ligado' : ''
        return (
          <g
            key={id}
            className={`elo grupo-${grupoDoElo(id)}${estado}`}
            role="button"
            tabIndex={0}
            aria-pressed={id === selecionado}
            aria-label={ELOS[id].titulo}
            onClick={() => aoSelecionar(id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && aoSelecionar(id)}
          >
            <rect x={x} y={y} width={CAIXA.largura} height={CAIXA.altura} rx={10} />
            <text x={x + CAIXA.largura / 2} y={y + CAIXA.altura / 2} textAnchor="middle" dominantBaseline="central">
              {ELOS[id].nome}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function grupoDoElo(id: IdDoElo) {
  if (id === 'areas' || id === 'habitos') return 'areas'
  if (id === 'projetos' || id === 'tarefas' || id === 'captura' || id === 'notas') return 'execucao'
  return 'escalas'
}

function ExplicacaoDoElo({
  id,
  parametros,
  textos,
  areas,
  aoSelecionar,
  aoAbrirTexto,
  aoMudarParametro,
  ir,
}: {
  id: IdDoElo
  parametros: Parametro[]
  textos: TextoCurto[]
  areas: { nome: string; modo: string }[]
  aoSelecionar: (id: IdDoElo) => void
  aoAbrirTexto: (id: number) => void
  aoMudarParametro: () => void
  ir: Ir
}) {
  const elo = ELOS[id]
  const meusParametros = elo.parametros
    .map((chave) => parametros.find((p) => p.chave === chave))
    .filter((p): p is Parametro => Boolean(p))
  const meusTextos = elo.textos
    .map((chave) => textos.find((t) => t.chave === chave))
    .filter((t): t is TextoCurto => Boolean(t))

  return (
    <section className="bloco explicacao-do-elo" aria-live="polite">
      <h2 className="titulo-bloco">{elo.titulo}</h2>
      <div className="cartao">
        <p>{elo.faz}</p>

        <h3>Base</h3>
        <ul className="bases">
          {elo.bases.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>

        <h3>Liga com</h3>
        <ul className="ligacoes">
          {elo.ligacoes.map((l) => (
            <li key={l.com}>
              <button type="button" className="chip-botao" onClick={() => aoSelecionar(l.com)}>
                {ELOS[l.com].nome}
              </button>
              <span>{l.como}</span>
            </li>
          ))}
        </ul>

        <h3>Onde entra você</h3>
        <p>{elo.voce}</p>
        {id === 'areas' && areas.length > 0 && (
          <p className="ajuda">
            Hoje: {areas.map((a) => (a.modo === 'foco' ? `${a.nome} (em foco)` : a.nome)).join(', ')}.
          </p>
        )}

        {(meusParametros.length > 0 || meusTextos.length > 0) && <h3>Regras</h3>}
        {meusParametros.length > 0 && (
          <ul className="lista">
            {meusParametros.map((p) => (
              <LinhaDoParametro key={`${p.chave}-${p.valor}`} prefixo="elo" parametro={p} aoMudar={aoMudarParametro} />
            ))}
          </ul>
        )}
        {meusTextos.length > 0 && (
          <p className="textos-do-elo">
            {meusTextos.map((t) => (
              <button key={t.id} type="button" className="link" onClick={() => aoAbrirTexto(t.id)}>
                Ler: {t.titulo}
              </button>
            ))}
          </p>
        )}

        {elo.tela && (
          <p>
            <button type="button" className="link" onClick={() => ir({ tela: elo.tela! })}>
              Abrir a tela
            </button>
          </p>
        )}
      </div>
    </section>
  )
}

function LinhaDoParametro({
  parametro,
  prefixo,
  aoMudar,
}: {
  parametro: Parametro
  prefixo: string
  aoMudar: () => void
}) {
  const [texto, setTexto] = useState(numero.format(parametro.valor))
  const [erro, setErro] = useState(false)

  async function salvar() {
    const valor = lerNumero(texto)
    if (valor === null) return setErro(true)
    if (valor === Number(parametro.valor)) return setErro(false)
    const { error } = await supabase.from('parametro').update({ valor }).eq('chave', parametro.chave)
    setErro(Boolean(error))
    aoMudar()
  }

  return (
    <li>
      <label className="item" htmlFor={`${prefixo}-${parametro.chave}`}>
        <span>{parametro.descricao ?? parametro.chave}</span>
        {parametro.unidade && <small>{parametro.unidade}</small>}
      </label>
      <input
        id={`${prefixo}-${parametro.chave}`}
        className={erro ? 'campo curto invalido' : 'campo curto'}
        inputMode="decimal"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={salvar}
      />
    </li>
  )
}
