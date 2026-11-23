import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { corDaArea } from '../lib/areas'
import { SemanaBase } from '../componentes/SemanaBase'
import { PlanoSemanal } from './Semana'
import { CadastroDeHabitos } from './CadastroDeHabitos'
import { hoje } from '../lib/datas'
import { numero } from '../lib/formato'
import { NOME_DO_MODO, textoDoErro, useConsulta, type Ir, type Modo } from '../lib/dados'

type Ciclo = {
  id: number
  nome: string
  inicio: string
  fim: string
  intencao: string | null
  unica_coisa: string | null
  horas_livres: number | null
  planejado_em: string | null
}
type AreaDoPlano = { id: number; nome: string; modo: Modo; visao: string | null; padrao_minimo: string | null }
type Nivel = 'leve' | 'moderado' | 'intenso'
type Objetivo = {
  id: number
  area_id: number
  titulo: string
  nivel: Nivel
  minimo: string | null
  por_que: string | null
  pronto_quando: string | null
  obstaculos: string | null
  estado: 'ativo' | 'concluido' | 'abandonado'
}
type ProjetoCurto = { id: number; nome: string; objetivo_id: number | null; estado: string }
type Parametro = { chave: string; valor: number }
type Regra = {
  chave: string
  titulo: string
  valor: number | null
  limite: number | null
  ok: boolean
  texto: string | null
}

const NIVEIS: Record<Nivel, string> = {
  leve: 'Leve (1 a 2 h por semana)',
  moderado: 'Moderado (3 a 4 h por semana)',
  intenso: 'Intenso (5 h ou mais por semana)',
}
const PASSOS = ['Semana base', 'Áreas', 'Única coisa', 'Objetivos', 'Hábitos', 'Conferência'] as const
const br = (dia: string) => dia.split('-').reverse().join('/')
const fasesQueFaltam = (o: Objetivo) =>
  [
    !o.por_que && 'o porquê',
    !o.pronto_quando && 'como saber que acabou',
    !o.minimo && 'o mínimo da semana ruim',
  ].filter(Boolean) as string[]

function useParametros() {
  const parametros = useConsulta<Parametro[]>(() => supabase.from('parametro').select('chave, valor'))
  return (chave: string, padrao: number) =>
    Number((parametros.dados ?? []).find((x) => x.chave === chave)?.valor ?? padrao)
}

function PontoDaArea({ nome }: { nome: string }) {
  return <i className="ponto-da-area" style={{ background: corDaArea(nome) }} />
}

// O plano em escalas. A visão de longo prazo vem primeiro: é o Norte, escrito
// por área e lido antes de cada ciclo. Depois vêm o ciclo, a semana e o dia
// (que fica em Hoje).
export function Plano({ ir }: { ir: Ir }) {
  const ciclo = useConsulta<Ciclo | null>(() => supabase.from('v_ciclo_atual').select('*').maybeSingle())
  const areas = useConsulta<AreaDoPlano[]>(() =>
    supabase
      .from('area')
      .select('id, nome, modo, visao, padrao_minimo')
      .eq('tipo', 'vida')
      .eq('ativa', true)
      .order('ordem'),
  )
  const [guiado, setGuiado] = useState(false)
  const [escolhida, setEscala] = useState<'ciclo' | 'semana' | null>(null)
  const listaDeAreas = areas.dados ?? []
  const planejando = Boolean(ciclo.dados && (guiado || !ciclo.dados.planejado_em))
  // Com o ciclo planejado, o Plano abre na semana; senão, no ciclo.
  const escala = escolhida ?? (ciclo.dados?.planejado_em && !guiado ? 'semana' : 'ciclo')

  const blocoDoCiclo = ciclo.carregou && (
    <section className="bloco">
      <h2 className="titulo-bloco">Ciclo</h2>
      {!ciclo.dados ? (
        <NovoCiclo
          aoCriar={() => {
            setGuiado(true)
            ciclo.recarregar()
          }}
        />
      ) : planejando ? (
        <PlanoGuiado
          ciclo={ciclo.dados}
          areas={listaDeAreas}
          aoMudarCiclo={ciclo.recarregar}
          aoMudarAreas={areas.recarregar}
          aoConcluir={() => {
            setGuiado(false)
            ciclo.recarregar()
          }}
        />
      ) : (
        <ResumoDoCiclo
          ciclo={ciclo.dados}
          areas={listaDeAreas}
          ir={ir}
          aoRever={() => setGuiado(true)}
          aoMudar={ciclo.recarregar}
        />
      )}
    </section>
  )

  return (
    <main>
      <h1 className="titulo-tela">Plano</h1>

      <div className="segmentos escalas-do-plano" role="tablist" aria-label="Escala do plano">
        {(['ciclo', 'semana'] as const).map((e) => (
          <button
            key={e}
            type="button"
            role="tab"
            aria-selected={escala === e}
            className={escala === e ? 'ativo' : undefined}
            onClick={() => setEscala(e)}
          >
            {e === 'ciclo' ? 'Ciclo' : 'Semana'}
          </button>
        ))}
      </div>

      {escala === 'semana' ? (
        ciclo.carregou && (
          <>
            <PlanoSemanal ciclo={ciclo.dados} areas={listaDeAreas} ir={ir} />
            <p className="resumo-linha bloco">
              <span>O dia (tamanho, única coisa e espaços) fica em Hoje; a revisão de sexta, em Assistente.</span>
              <button type="button" className="link" onClick={() => ir({ tela: 'hoje' })}>
                Abrir Hoje
              </button>
            </p>
          </>
        )
      ) : (
        <>
          {areas.carregou && <VisaoDeLongoPrazo areas={listaDeAreas} aoMudar={areas.recarregar} />}
          {blocoDoCiclo}
        </>
      )}
    </main>
  )
}

// A visão de longo prazo: o Norte, escrito por área antes de qualquer ciclo.
// Fica no alto do Plano, recolhível, como referência para o resto.
function VisaoDeLongoPrazo({ areas, aoMudar }: { areas: AreaDoPlano[]; aoMudar: () => void }) {
  const escritas = areas.filter((a) => a.visao).length
  return (
    <details className="visao-norte" open={escritas < areas.length}>
      <summary>
        <span className="titulo-bloco">Visão de longo prazo</span>
        <small>
          {escritas === areas.length
            ? 'o Norte de cada área'
            : `${escritas} de ${areas.length} áreas com visão escrita`}
        </small>
      </summary>
      <p className="ajuda">
        Vem antes do ciclo: como cada área está daqui a alguns anos, se der certo. O ciclo escolhe o foco e os objetivos
        olhando para ela.
      </p>
      <ul className="lista-de-visoes">
        {areas.map((a) => (
          <VisaoDaArea key={a.id} area={a} aoMudar={aoMudar} />
        ))}
      </ul>
    </details>
  )
}

function VisaoDaArea({ area, aoMudar }: { area: AreaDoPlano; aoMudar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(area.visao ?? '')
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase
      .from('area')
      .update({ visao: texto.trim() || null })
      .eq('id', area.id)
    if (error) return setErro('Não foi possível salvar a visão.')
    setErro(null)
    setEditando(false)
    aoMudar()
  }

  return (
    <li className="visao-da-area">
      <p className="nome-da-area">
        <PontoDaArea nome={area.nome} />
        {area.nome}
        {area.modo === 'foco' && <small className="chip">em foco</small>}
        {!editando && (
          <button type="button" className="link" onClick={() => setEditando(true)}>
            {area.visao ? 'editar' : 'escrever'}
          </button>
        )}
      </p>
      {editando ? (
        <form onSubmit={salvar}>
          <textarea
            rows={4}
            autoFocus
            aria-label={`Visão de longo prazo de ${area.nome}`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          {erro && <p className="erro">{erro}</p>}
          <div className="acoes">
            <button
              type="button"
              onClick={() => {
                setTexto(area.visao ?? '')
                setEditando(false)
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="principal">
              Salvar
            </button>
          </div>
        </form>
      ) : (
        <p className={area.visao ? 'texto-da-visao' : 'texto-da-visao sem-texto'}>{area.visao ?? 'Ainda sem visão.'}</p>
      )}
    </li>
  )
}

function NovoCiclo({ aoCriar }: { aoCriar: () => void }) {
  const [nome, setNome] = useState('')
  const [inicio, setInicio] = useState(hoje())
  const [fim, setFim] = useState('')
  const [intencao, setIntencao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !fim) return setErro('Dê um nome e uma data de fim ao ciclo.')
    if (fim < inicio) return setErro('O fim vem depois do início.')
    const { error } = await supabase
      .from('ciclo')
      .insert({ nome: nome.trim(), inicio, fim, intencao: intencao.trim() || null })
    if (error) return setErro('Não foi possível abrir o ciclo.')
    aoCriar()
  }

  return (
    <div className="cartao">
      <p className="ajuda">
        Não há ciclo em andamento. Um ciclo é um período com poucas áreas em foco, uma única coisa e até dois objetivos
        por área em foco. Ele tem o tamanho que o período pede: pode ser um mês, pode ser um trimestre. Depois de abrir,
        o hub conduz o plano em seis passos.
      </p>
      <form onSubmit={salvar}>
        <label>
          Nome do ciclo
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Por exemplo: Adaptação" />
        </label>
        <div className="lado-a-lado">
          <label>
            Início
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label>
            Fim
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </label>
        </div>
        <label>
          Intenção: o que este período pede
          <textarea rows={2} value={intencao} onChange={(e) => setIntencao(e.target.value)} />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <div className="acoes">
          <button type="submit" className="principal">
            Abrir ciclo
          </button>
        </div>
      </form>
    </div>
  )
}

// ── O plano guiado ─────────────────────────────────────────────────────────

function PlanoGuiado({
  ciclo,
  areas,
  aoMudarCiclo,
  aoMudarAreas,
  aoConcluir,
}: {
  ciclo: Ciclo
  areas: AreaDoPlano[]
  aoMudarCiclo: () => void
  aoMudarAreas: () => void
  aoConcluir: () => void
}) {
  const [passo, setPassoAgora] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const topo = useRef<HTMLDivElement>(null)

  function setPasso(n: number) {
    setPassoAgora(n)
    const caixa = topo.current?.getBoundingClientRect()
    if (caixa && caixa.top < 0) topo.current?.scrollIntoView({ block: 'start' })
  }

  async function mudarCiclo(mudanca: Partial<Ciclo>) {
    const { error } = await supabase.from('ciclo').update(mudanca).eq('id', ciclo.id)
    setErro(error ? textoDoErro(error, 'Não foi possível salvar o ciclo.') : null)
    aoMudarCiclo()
    return !error
  }

  return (
    <div className="plano-guiado" ref={topo}>
      <div className="cartao">
        <p className="destaque-linha">
          {ciclo.nome}
          <small>
            {br(ciclo.inicio)} a {br(ciclo.fim)}
          </small>
        </p>
        {ciclo.intencao && <p>{ciclo.intencao}</p>}
      </div>

      <ol className="passos" aria-label="Passos do plano do ciclo">
        {PASSOS.map((nome, i) => (
          <li key={nome}>
            <button
              type="button"
              className={i === passo ? 'ativo' : i < passo ? 'feito' : undefined}
              aria-current={i === passo ? 'step' : undefined}
              onClick={() => setPasso(i)}
            >
              <span className="numero-do-passo">{i + 1}</span>
              <span className="nome-do-passo">{nome}</span>
            </button>
          </li>
        ))}
      </ol>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {passo === 0 && <PassoSemanaBase ciclo={ciclo} areas={areas} aoMudarCiclo={aoMudarCiclo} />}
      {passo === 1 && <PassoAreas areas={areas} aoMudar={aoMudarAreas} />}
      {passo === 2 && <PassoUnicaCoisa ciclo={ciclo} areas={areas} mudarCiclo={mudarCiclo} />}
      {passo === 3 && <PassoObjetivos ciclo={ciclo} areas={areas} />}
      {passo === 4 && <PassoHabitos />}
      {passo === 5 && (
        <PassoConferencia
          ciclo={ciclo}
          concluir={async () => {
            if (await mudarCiclo({ planejado_em: new Date().toISOString() })) aoConcluir()
          }}
          irPara={setPasso}
        />
      )}

      <div className="botoes bloco navegacao-dos-passos">
        {passo > 0 && (
          <button type="button" className="botao" onClick={() => setPasso(passo - 1)}>
            Voltar
          </button>
        )}
        {passo < PASSOS.length - 1 && (
          <button type="button" className="botao principal" onClick={() => setPasso(passo + 1)}>
            Seguir para {PASSOS[passo + 1].toLowerCase()}
          </button>
        )}
        {ciclo.planejado_em && (
          <button type="button" className="link" onClick={aoConcluir}>
            Fechar sem mudar
          </button>
        )}
      </div>

      <AcoesDoCiclo ciclo={ciclo} aoMudar={aoMudarCiclo} />
    </div>
  )
}

// Interromper o ciclo guarda o que foi feito; excluir apaga o ciclo para
// refazer do zero (objetivos e semana base vão junto; projetos e tarefas ficam).
function AcoesDoCiclo({ ciclo, aoMudar }: { ciclo: Ciclo; aoMudar: () => void }) {
  const [confirmando, setConfirmando] = useState<'encerrar' | 'excluir' | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function executar() {
    const { error } =
      confirmando === 'excluir'
        ? await supabase.from('ciclo').delete().eq('id', ciclo.id)
        : await supabase.from('ciclo').update({ encerrado_em: new Date().toISOString() }).eq('id', ciclo.id)
    if (error) return setErro('Não foi possível mudar o ciclo.')
    setConfirmando(null)
    aoMudar()
  }

  return (
    <div className="acoes-do-ciclo">
      {confirmando ? (
        <div className="cartao confirmacao">
          <p>
            {confirmando === 'excluir'
              ? 'Excluir apaga o ciclo, os objetivos e a semana base, para refazer do zero. Projetos e tarefas continuam, sem objetivo. Não dá para desfazer.'
              : 'Interromper encerra o ciclo hoje e guarda o que foi feito. Depois você abre um ciclo novo.'}
          </p>
          {erro && <p className="erro">{erro}</p>}
          <div className="botoes">
            <button type="button" className="botao" onClick={() => setConfirmando(null)}>
              Cancelar
            </button>
            <button type="button" className="botao perigo" onClick={executar}>
              {confirmando === 'excluir' ? 'Excluir o ciclo' : 'Interromper o ciclo'}
            </button>
          </div>
        </div>
      ) : (
        <p className="links-do-ciclo">
          <button type="button" className="link" onClick={() => setConfirmando('encerrar')}>
            Interromper o ciclo
          </button>
          <button type="button" className="link perigo" onClick={() => setConfirmando('excluir')}>
            Excluir o ciclo
          </button>
        </p>
      )}
    </div>
  )
}

function PassoSemanaBase({
  ciclo,
  areas,
  aoMudarCiclo,
}: {
  ciclo: Ciclo
  areas: AreaDoPlano[]
  aoMudarCiclo: () => void
}) {
  const p = useParametros()
  return (
    <div className="passo">
      <p className="ajuda">
        A semana que se repete durante o ciclo: trabalho, rotina, família, o que já tem hora marcada. O tempo que sobra
        para os objetivos, marcado como "para o ciclo", vira a capacidade da semana. Um objetivo leve pede{' '}
        {numero.format(p('horas_nivel_leve', 1))} h, um moderado {numero.format(p('horas_nivel_moderado', 3))} h e um
        intenso {numero.format(p('horas_nivel_intenso', 5))} h.
      </p>
      <SemanaBase cicloId={ciclo.id} areas={areas} margem={p('margem_capacidade', 0.7)} aoMudar={aoMudarCiclo} />
    </div>
  )
}

function PassoAreas({ areas, aoMudar }: { areas: AreaDoPlano[]; aoMudar: () => void }) {
  return (
    <div className="passo">
      <p className="ajuda">
        Com a visão de cada área à vista, escolha o modo dela neste ciclo. Poucas em foco: elas recebem objetivos no
        passo 4. As outras ficam em manutenção, sustentadas pelo padrão mínimo, ou em pausa.
      </p>
      <ul className="lista-de-cartoes">
        {areas.map((a) => (
          <AreaNoCiclo key={a.id} area={a} aoMudar={aoMudar} />
        ))}
      </ul>
    </div>
  )
}

function AreaNoCiclo({ area, aoMudar }: { area: AreaDoPlano; aoMudar: () => void }) {
  const [minimo, setMinimo] = useState(area.padrao_minimo ?? '')
  const [erro, setErro] = useState<string | null>(null)

  async function mudar(mudanca: Record<string, unknown>) {
    const { error } = await supabase.from('area').update(mudanca).eq('id', area.id)
    setErro(error ? textoDoErro(error, 'Não foi possível salvar a área.') : null)
    aoMudar()
  }

  return (
    <li className="cartao">
      <p className="nome-da-area">
        <PontoDaArea nome={area.nome} />
        {area.nome}
      </p>
      <p className={area.visao ? 'visao-ao-lado' : 'visao-ao-lado sem-texto'}>
        {area.visao ?? 'Sem visão escrita: escreva no alto da tela.'}
      </p>
      <div className="segmentos" role="radiogroup" aria-label={`Modo de ${area.nome} no ciclo`}>
        {(['foco', 'manutencao', 'pausa'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={area.modo === m}
            className={area.modo === m ? 'ativo' : undefined}
            onClick={() => area.modo !== m && mudar({ modo: m, rever_em: null })}
          >
            {NOME_DO_MODO[m]}
          </button>
        ))}
      </div>
      {area.modo === 'foco' ? (
        <p className="ajuda">Em foco: os objetivos desta área entram no passo 4.</p>
      ) : (
        <label>
          {area.modo === 'pausa'
            ? 'O que fica de pé mesmo em pausa (se algo)'
            : 'Padrão mínimo neste ciclo: o que significa "está ok"'}
          <textarea
            rows={2}
            value={minimo}
            onChange={(e) => setMinimo(e.target.value)}
            onBlur={() =>
              (minimo.trim() || null) !== area.padrao_minimo && mudar({ padrao_minimo: minimo.trim() || null })
            }
          />
        </label>
      )}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </li>
  )
}

function PassoUnicaCoisa({
  ciclo,
  areas,
  mudarCiclo,
}: {
  ciclo: Ciclo
  areas: AreaDoPlano[]
  mudarCiclo: (m: Partial<Ciclo>) => Promise<boolean>
}) {
  const [texto, setTexto] = useState(ciclo.unica_coisa ?? '')
  const emFoco = areas.filter((a) => a.modo === 'foco')

  return (
    <div className="passo">
      <section className="unica-coisa">
        <p className="rotulo-ambar">
          <i aria-hidden="true" />A única coisa do ciclo
        </p>
        <textarea
          className="destaque"
          rows={3}
          aria-label="A única coisa do ciclo"
          placeholder="Qual é a única coisa que, feita neste ciclo, torna o resto mais fácil ou desnecessário?"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() =>
            (texto.trim() || null) !== ciclo.unica_coisa && mudarCiclo({ unica_coisa: texto.trim() || null })
          }
        />
      </section>
      <p className="ajuda">
        A semana herda esta única coisa; o dia continua com a sua, em Hoje. Ela costuma sair de uma área em foco.
      </p>
      {emFoco.length === 0 ? (
        <p className="vazio pequeno">Nenhuma área em foco ainda. Volte ao passo Áreas.</p>
      ) : (
        <ul className="lista visoes">
          {emFoco.map((a) => (
            <li key={a.id}>
              <div className="item">
                <span>
                  <PontoDaArea nome={a.nome} />
                  {a.nome}
                </span>
                <small>{a.visao ?? 'Sem visão escrita.'}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PassoObjetivos({ ciclo, areas }: { ciclo: Ciclo; areas: AreaDoPlano[] }) {
  const p = useParametros()
  const objetivos = useConsulta<Objetivo[]>(
    () => supabase.from('objetivo').select('*').eq('ciclo_id', ciclo.id).order('id'),
    [ciclo.id],
  )
  const projetos = useConsulta<ProjetoCurto[]>(() =>
    supabase.from('projeto').select('id, nome, objetivo_id, estado').neq('estado', 'concluido').order('id'),
  )
  const lista = objetivos.dados ?? []
  const max = p('objetivos_por_area_max', 2)
  const comObjetivo = new Set(lista.map((o) => o.area_id))
  const mostradas = areas.filter((a) => a.modo === 'foco' || comObjetivo.has(a.id))

  return (
    <div className="passo">
      <p className="ajuda">
        Cada objetivo passa por três fases. Definir: o resultado em uma frase, por que importa e como saber que acabou.
        Planejar: os projetos, os obstáculos e o esforço. Executar: o mínimo que fica de pé numa semana ruim; as sessões
        de foco e a revisão de sexta fazem o resto. Até {numero.format(max)} por área em foco.
      </p>
      {mostradas.length === 0 && <p className="vazio pequeno">Nenhuma área em foco. Volte ao passo Áreas.</p>}
      {mostradas.map((a) => {
        const daArea = lista.filter((o) => o.area_id === a.id)
        return (
          <section key={a.id} className="bloco objetivos-da-area">
            <h3 className="nome-da-area">
              <PontoDaArea nome={a.nome} />
              {a.nome}
              {a.modo !== 'foco' && <small className="chip neutro">{NOME_DO_MODO[a.modo].toLowerCase()}</small>}
            </h3>
            {a.visao && <p className="ajuda visao-ao-lado">{a.visao}</p>}
            {daArea.map((o) => (
              <ObjetivoNoPlano
                key={o.id}
                objetivo={o}
                projetos={(projetos.dados ?? []).filter((x) => x.objetivo_id === o.id)}
                aoMudar={() => {
                  objetivos.recarregar()
                  projetos.recarregar()
                }}
              />
            ))}
            {a.modo === 'foco' && daArea.filter((o) => o.estado === 'ativo').length < max && (
              <NovoObjetivo cicloId={ciclo.id} area={a} aoCriar={objetivos.recarregar} />
            )}
          </section>
        )
      })}
      {areas.some((a) => a.modo !== 'foco' && !comObjetivo.has(a.id)) && (
        <p className="ajuda">
          As áreas em manutenção e em pausa não levam objetivo: o que elas pedem fica nos hábitos de base.
        </p>
      )}
    </div>
  )
}

function NovoObjetivo({ cicloId, area, aoCriar }: { cicloId: number; area: AreaDoPlano; aoCriar: () => void }) {
  const [aberto, setAberto] = useState(false)
  if (!aberto)
    return (
      <button type="button" className="botao" onClick={() => setAberto(true)}>
        Novo objetivo em {area.nome}
      </button>
    )
  return (
    <FormDoObjetivo
      inicial={{ titulo: '', nivel: 'leve', por_que: null, pronto_quando: null, obstaculos: null, minimo: null }}
      aoCancelar={() => setAberto(false)}
      salvar={async (dados) => {
        const { error } = await supabase.from('objetivo').insert({ ciclo_id: cicloId, area_id: area.id, ...dados })
        if (!error) {
          setAberto(false)
          aoCriar()
        }
        return error
      }}
    />
  )
}

function ObjetivoNoPlano({
  objetivo,
  projetos,
  aoMudar,
}: {
  objetivo: Objetivo
  projetos: ProjetoCurto[]
  aoMudar: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [novoProjeto, setNovoProjeto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const faltam = fasesQueFaltam(objetivo)

  async function criarProjeto(e: FormEvent) {
    e.preventDefault()
    if (!novoProjeto.trim()) return
    const { error } = await supabase
      .from('projeto')
      .insert({ nome: novoProjeto.trim(), area_id: objetivo.area_id, objetivo_id: objetivo.id })
    setErro(error ? textoDoErro(error, 'Não foi possível criar o projeto.') : null)
    if (!error) setNovoProjeto('')
    aoMudar()
  }

  if (editando)
    return (
      <FormDoObjetivo
        inicial={objetivo}
        aoCancelar={() => setEditando(false)}
        salvar={async (dados) => {
          const { error } = await supabase.from('objetivo').update(dados).eq('id', objetivo.id)
          if (!error) {
            setEditando(false)
            aoMudar()
          }
          return error
        }}
      />
    )

  return (
    <div className="cartao objetivo">
      <div className="cabecalho-do-objetivo">
        <p className={objetivo.estado === 'ativo' ? 'titulo-do-objetivo' : 'titulo-do-objetivo riscado'}>
          {objetivo.titulo}
        </p>
        <button type="button" className="link" onClick={() => setEditando(true)}>
          editar
        </button>
      </div>
      <dl className="fases">
        {objetivo.por_que && (
          <>
            <dt>Por que importa</dt>
            <dd>{objetivo.por_que}</dd>
          </>
        )}
        {objetivo.pronto_quando && (
          <>
            <dt>Acaba quando</dt>
            <dd>{objetivo.pronto_quando}</dd>
          </>
        )}
        <dt>Esforço</dt>
        <dd>{NIVEIS[objetivo.nivel]}</dd>
        {objetivo.obstaculos && (
          <>
            <dt>Obstáculos</dt>
            <dd className="quebra">{objetivo.obstaculos}</dd>
          </>
        )}
        {objetivo.minimo && (
          <>
            <dt>Semana ruim</dt>
            <dd>{objetivo.minimo}</dd>
          </>
        )}
        <dt>Projetos</dt>
        <dd>{projetos.length === 0 ? 'Nenhum ainda.' : projetos.map((x) => x.nome).join(' · ')}</dd>
      </dl>
      {faltam.length > 0 && <p className="ajuda aviso">Falta {faltam.join(', ')}.</p>}
      <form className="linha-de-captura" onSubmit={criarProjeto}>
        <input
          value={novoProjeto}
          onChange={(e) => setNovoProjeto(e.target.value)}
          placeholder="Novo projeto para este objetivo"
          aria-label="Novo projeto para este objetivo"
        />
        <button type="submit" className="botao">
          Criar
        </button>
      </form>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}

type DadosDoObjetivo = Pick<Objetivo, 'titulo' | 'nivel' | 'por_que' | 'pronto_quando' | 'obstaculos' | 'minimo'>

function FormDoObjetivo({
  inicial,
  aoCancelar,
  salvar,
}: {
  inicial: DadosDoObjetivo
  aoCancelar: () => void
  salvar: (dados: DadosDoObjetivo) => Promise<{ code?: string; message: string } | null>
}) {
  const [titulo, setTitulo] = useState(inicial.titulo)
  const [porQue, setPorQue] = useState(inicial.por_que ?? '')
  const [prontoQuando, setProntoQuando] = useState(inicial.pronto_quando ?? '')
  const [nivel, setNivel] = useState<Nivel>(inicial.nivel)
  const [obstaculos, setObstaculos] = useState(inicial.obstaculos ?? '')
  const [minimo, setMinimo] = useState(inicial.minimo ?? '')
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) return setErro('Escreva o resultado em uma frase.')
    const error = await salvar({
      titulo: titulo.trim(),
      por_que: porQue.trim() || null,
      pronto_quando: prontoQuando.trim() || null,
      nivel,
      obstaculos: obstaculos.trim() || null,
      minimo: minimo.trim() || null,
    })
    setErro(error ? textoDoErro(error, 'Não foi possível salvar o objetivo.') : null)
  }

  return (
    <form className="cartao form-do-objetivo" onSubmit={enviar}>
      <fieldset>
        <legend>Definir</legend>
        <label>
          O resultado, em uma frase
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label>
          Por que importa (o que ele tem a ver com a visão)
          <textarea rows={2} value={porQue} onChange={(e) => setPorQue(e.target.value)} />
        </label>
        <label>
          Como saber que acabou
          <input value={prontoQuando} onChange={(e) => setProntoQuando(e.target.value)} />
        </label>
      </fieldset>
      <fieldset>
        <legend>Planejar</legend>
        <label>
          Esforço por semana
          <select value={nivel} onChange={(e) => setNivel(e.target.value as Nivel)}>
            {(Object.keys(NIVEIS) as Nivel[]).map((n) => (
              <option key={n} value={n}>
                {NIVEIS[n]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Obstáculos: uma linha por obstáculo, no formato "se X, faço Y"
          <textarea rows={3} value={obstaculos} onChange={(e) => setObstaculos(e.target.value)} />
        </label>
        <p className="ajuda">Os projetos do objetivo se criam depois de salvar.</p>
      </fieldset>
      <fieldset>
        <legend>Executar</legend>
        <label>
          O mínimo que fica de pé numa semana ruim
          <input value={minimo} onChange={(e) => setMinimo(e.target.value)} />
        </label>
      </fieldset>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <div className="acoes">
        <button type="button" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="submit" className="principal">
          Salvar objetivo
        </button>
      </div>
    </form>
  )
}

function PassoHabitos() {
  const p = useParametros()
  return (
    <div className="passo">
      <p className="ajuda">
        Revise os hábitos para este ciclo: os essenciais (até {numero.format(p('habitos_essenciais_max', 3))}) não se
        negociam, os de padrão mínimo sustentam as áreas fora do foco e os livres não cobram. Toque num hábito para
        editar ou mudar o peso. "Guardar" tira o hábito de cena sem perder o histórico; ele pode voltar quando quiser.
      </p>
      <CadastroDeHabitos sempreAberto aoMudar={() => {}} />
    </div>
  )
}

function ListaDaConferencia({ regras }: { regras: Regra[] }) {
  return (
    <ul className="conferencia">
      {regras.map((r) => (
        <li key={r.chave} className={r.ok ? 'ok' : 'fora'}>
          <span className="marca" aria-label={r.ok ? 'Dentro' : 'Fora'}>
            {r.ok ? '✓' : '!'}
          </span>
          <span className="regra">
            {r.titulo}
            {r.valor !== null && (
              <small>
                {numero.format(r.valor)}
                {r.limite !== null && r.limite > 0 && ` de ${numero.format(r.limite)}`}
              </small>
            )}
            {!r.ok && r.texto && <small className="texto">{r.texto}</small>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function useConferencia(cicloId: number, chave: unknown = null) {
  return useConsulta<Regra[]>(() => supabase.rpc('conferir_ciclo', { p_ciclo: cicloId }), [cicloId, chave])
}

function PassoConferencia({
  ciclo,
  concluir,
  irPara,
}: {
  ciclo: Ciclo
  concluir: () => void
  irPara: (passo: number) => void
}) {
  const conferencia = useConferencia(ciclo.id)
  const regras = conferencia.dados ?? []
  const fora = regras.filter((r) => !r.ok)
  const passoDa: Record<string, number> = {
    unica_coisa: 2,
    areas_em_foco: 1,
    objetivos_por_area: 3,
    objetivos_fora_do_foco: 3,
    objetivos_completos: 3,
    carga: 0,
    habitos_essenciais: 4,
  }

  return (
    <div className="passo">
      <p className="ajuda">As regras do Sistema, conferidas contra o plano que você montou.</p>
      <ListaDaConferencia regras={regras} />
      {fora.length > 0 && (
        <p className="ajuda">
          Ajustar:{' '}
          {fora
            .filter((r) => passoDa[r.chave] !== undefined)
            .map((r) => (
              <button key={r.chave} type="button" className="link" onClick={() => irPara(passoDa[r.chave])}>
                {PASSOS[passoDa[r.chave]].toLowerCase()}
              </button>
            ))
            .reduce<ReactNode[]>((acc, b, i) => (i === 0 ? [b] : [...acc, ' · ', b]), [])}
        </p>
      )}
      {conferencia.carregou && (
        <div className="acoes">
          <button type="button" className="botao principal" onClick={concluir}>
            {fora.length === 0 ? 'Concluir o plano' : 'Concluir assim mesmo'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── O ciclo já planejado ───────────────────────────────────────────────────

function ResumoDoCiclo({
  ciclo,
  areas,
  ir,
  aoRever,
  aoMudar,
}: {
  ciclo: Ciclo
  areas: AreaDoPlano[]
  ir: Ir
  aoRever: () => void
  aoMudar: () => void
}) {
  const objetivos = useConsulta<Objetivo[]>(
    () => supabase.from('objetivo').select('*').eq('ciclo_id', ciclo.id).order('id'),
    [ciclo.id],
  )
  const projetos = useConsulta<ProjetoCurto[]>(() =>
    supabase.from('projeto').select('id, nome, objetivo_id, estado').neq('estado', 'concluido').order('id'),
  )
  const conferencia = useConferencia(ciclo.id, objetivos.dados)
  const [erro, setErro] = useState<string | null>(null)
  const lista = objetivos.dados ?? []
  const fora = (conferencia.dados ?? []).filter((r) => !r.ok)
  const nomeDaArea = (id: number) => areas.find((a) => a.id === id)?.nome ?? ''

  async function mudarObjetivo(id: number, estado: Objetivo['estado']) {
    const { error } = await supabase.from('objetivo').update({ estado }).eq('id', id)
    setErro(error ? textoDoErro(error, 'Não foi possível mudar o objetivo.') : null)
    objetivos.recarregar()
  }

  return (
    <>
      <div className="cartao">
        <p className="destaque-linha">
          {ciclo.nome}
          <small>
            {br(ciclo.inicio)} a {br(ciclo.fim)}
          </small>
        </p>
        {ciclo.intencao && <p>{ciclo.intencao}</p>}
        {ciclo.unica_coisa && (
          <section className="unica-coisa">
            <p className="rotulo-ambar">
              <i aria-hidden="true" />A única coisa do ciclo
            </p>
            <p className="texto-da-unica-coisa">{ciclo.unica_coisa}</p>
          </section>
        )}
      </div>

      {lista.length === 0 && <p className="vazio pequeno">O ciclo ainda não tem objetivos.</p>}
      {lista.length > 0 && (
        <ul className="lista bloco">
          {lista.map((o) => {
            const faltam = fasesQueFaltam(o)
            return (
              <li key={o.id}>
                <div className="item">
                  <span className={o.estado === 'ativo' ? undefined : 'riscado'}>
                    <PontoDaArea nome={nomeDaArea(o.area_id)} />
                    {o.titulo}
                  </span>
                  <small>
                    {[
                      NIVEIS[o.nivel],
                      o.pronto_quando && `acaba quando: ${o.pronto_quando}`,
                      o.minimo && `semana ruim: ${o.minimo}`,
                      o.estado !== 'ativo' && (o.estado === 'concluido' ? 'concluído' : 'abandonado'),
                      o.estado === 'ativo' && faltam.length > 0 && `falta ${faltam.join(', ')}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                  {(projetos.dados ?? [])
                    .filter((x) => x.objetivo_id === o.id)
                    .map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        className="link"
                        onClick={() => ir({ tela: 'tarefas', id: x.id })}
                      >
                        Projeto: {x.nome}
                      </button>
                    ))}
                </div>
                {o.estado === 'ativo' ? (
                  <button type="button" className="link" onClick={() => mudarObjetivo(o.id, 'concluido')}>
                    concluir
                  </button>
                ) : (
                  <button type="button" className="link" onClick={() => mudarObjetivo(o.id, 'ativo')}>
                    reabrir
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {conferencia.carregou && (
        <div className="cartao">
          {fora.length === 0 ? (
            <p className="ajuda">O plano está dentro de todas as regras do Sistema.</p>
          ) : (
            <>
              <p className="ajuda">
                {fora.length === 1 ? 'Um ponto está fora das regras:' : `${fora.length} pontos estão fora das regras:`}
              </p>
              <ListaDaConferencia regras={fora} />
            </>
          )}
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}

      <div className="botoes bloco">
        <button type="button" className="botao" onClick={aoRever}>
          Rever o plano
        </button>
      </div>
      <AcoesDoCiclo ciclo={ciclo} aoMudar={aoMudar} />
    </>
  )
}
