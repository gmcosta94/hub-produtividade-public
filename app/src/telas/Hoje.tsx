import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { hoje, porExtenso, somarDias } from '../lib/datas'
import { hora } from '../lib/formato'
import { Folha } from '../componentes/Folha'
import { Texto } from '../componentes/Texto'
import { Habitos } from './Habitos'
import { textoDoErro, useAreas, useConsulta, type Area, type Ir } from '../lib/dados'
import { Foco } from './Foco'
import { corDaArea } from '../lib/areas'

type Tamanho = 'minimo' | 'normal' | 'cheio'
type DiaLinha = {
  tamanho: Tamanho
  destaque: string | null
  destaque_area_id: number | null
  destaque_feito: boolean
}
type DiaCompleto = DiaLinha & { inicio_em: string | null; encerrado_em: string | null }
type ChaveDoRitual = 'ritual_inicio' | 'ritual_fim'
type Ritual = { chave: ChaveDoRitual; titulo: string; corpo: string | null }
type Tarefa = { id: number; titulo: string; estado: string; area: string | null; projeto: string | null }

const TAMANHOS: { id: Tamanho; nome: string; ajuda: string }[] = [
  { id: 'minimo', nome: 'Mínimo', ajuda: 'Dia mínimo: só o destaque, e os hábitos valem na versão mínima.' },
  { id: 'normal', nome: 'Normal', ajuda: 'Dia normal: o destaque e os espaços do dia.' },
  { id: 'cheio', nome: 'Cheio', ajuda: 'Dia cheio: há energia e tempo para ir além do combinado.' },
]

// A tela do dia: junta o que os outros módulos têm para hoje.
export function Hoje({ ir }: { ir: Ir }) {
  const data = hoje()
  const areas = useAreas()
  const dia = useConsulta<DiaCompleto | null>(
    () =>
      supabase
        .from('dia')
        .select('tamanho, destaque, destaque_area_id, destaque_feito, inicio_em, encerrado_em')
        .eq('data', data)
        .maybeSingle(),
    [data],
  )
  const tarefas = useConsulta<Tarefa[]>(
    () =>
      supabase
        .from('v_tarefa')
        .select('id, titulo, estado, area, projeto')
        .eq('dia', data)
        .in('estado', ['aberta', 'feita'])
        .order('id'),
    [data],
  )
  const entrada = useConsulta<{ id: number }[]>(() => supabase.from('tarefa').select('id').eq('estado', 'entrada'))
  const espacos = useConsulta<{ valor: number } | null>(() =>
    supabase.from('parametro').select('valor').eq('chave', 'espacos_extras_dia').maybeSingle(),
  )
  const [captura, setCaptura] = useState('')
  const [tamanhoEscolhido, setTamanhoEscolhido] = useState<Tamanho | null>(null)
  const tamanho = tamanhoEscolhido ?? dia.dados?.tamanho ?? 'normal'
  const [erro, setErro] = useState<string | null>(null)

  async function capturar(e: FormEvent) {
    e.preventDefault()
    if (!captura.trim()) return
    const { error } = await supabase.from('tarefa').insert({ titulo: captura })
    if (error) return setErro(textoDoErro(error, 'Não foi possível guardar. Tente de novo.'))
    setCaptura('')
    setErro(null)
    entrada.recarregar()
  }

  async function mudarTarefa(t: Tarefa, mudanca: { estado?: string; dia?: null }) {
    const { error } = await supabase.from('tarefa').update(mudanca).eq('id', t.id)
    setErro(error ? textoDoErro(error, 'Não foi possível salvar a tarefa.') : null)
    tarefas.recarregar()
  }

  const limite = espacos.dados?.valor ?? null
  const doDia = tarefas.dados ?? []
  const naEntrada = entrada.dados?.length ?? 0

  return (
    <main className="hoje">
      <header className="cabecalho-do-dia">
        <div>
          <p className="data">{porExtenso(data)}</p>
          <h1 className="titulo-tela">Hoje</h1>
        </div>
        {dia.carregou && (
          <Rituais
            data={data}
            inicioEm={dia.dados?.inicio_em ?? null}
            encerradoEm={dia.dados?.encerrado_em ?? null}
            aoMudar={dia.recarregar}
            ir={ir}
          />
        )}
      </header>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <div className="colunas">
        <div className="coluna">
          {dia.carregou && (
            <CartaoDoDia data={data} inicial={dia.dados} areas={areas} aoMudarTamanho={setTamanhoEscolhido} />
          )}

          <section className="bloco">
            <h2 className="titulo-bloco">Espaços{limite !== null && ` · ${doDia.length} de ${limite}`}</h2>
            {doDia.length > 0 && (
              <ul className="lista">
                {doDia.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={t.estado === 'feita' ? 'marcar-tarefa feita' : 'marcar-tarefa'}
                      aria-label={t.estado === 'feita' ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
                      onClick={() => mudarTarefa(t, { estado: t.estado === 'feita' ? 'aberta' : 'feita' })}
                    >
                      {t.estado === 'feita' && <Visto />}
                    </button>
                    <span className="item">
                      <span className={t.estado === 'feita' ? 'riscado' : undefined}>{t.titulo}</span>
                      {(t.projeto ?? t.area) && (
                        <small>
                          {t.area && <i className="ponto-da-area" style={{ background: corDaArea(t.area) }} />}
                          {t.projeto ?? t.area}
                        </small>
                      )}
                    </span>
                    {t.estado !== 'feita' && (
                      <button type="button" className="link" onClick={() => mudarTarefa(t, { dia: null })}>
                        tirar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {limite !== null &&
              Array.from({ length: Math.max(0, limite - doDia.length) }, (_, i) => (
                <button key={i} type="button" className="vaga" onClick={() => ir({ tela: 'tarefas' })}>
                  Espaço livre · escolher em Tarefas
                </button>
              ))}
            <form className="captura" onSubmit={capturar}>
              <input
                aria-label="Capturar uma tarefa ou ideia"
                placeholder="Capturar uma tarefa ou ideia"
                value={captura}
                onChange={(e) => setCaptura(e.target.value)}
              />
              <button type="submit">Guardar</button>
            </form>
            {naEntrada > 0 && (
              <p className="ajuda">
                {naEntrada === 1
                  ? '1 item na entrada, ainda sem decisão.'
                  : `${naEntrada} itens na entrada, ainda sem decisão.`}{' '}
                <button type="button" className="link" onClick={() => ir({ tela: 'tarefas' })}>
                  Abrir a entrada
                </button>
              </p>
            )}
          </section>
        </div>
        <div className="coluna">
          <section className="bloco">
            <h2 className="titulo-bloco">Hábitos{tamanho === 'minimo' && ' · um toque marca a versão mínima'}</h2>
            <Habitos
              embutido
              soHoje
              agruparPor="peso"
              marcarComo={tamanho === 'minimo' ? 'minimo' : 'feito'}
              mostrarMinima={tamanho === 'minimo'}
            />
            <p className="ajuda">
              <button type="button" className="link" onClick={() => ir({ tela: 'habitos' })}>
                Ver a semana e os outros dias ›
              </button>
            </p>
          </section>

          <Foco embutido aoVerHistorico={() => ir({ tela: 'foco' })} />
        </div>
      </div>
    </main>
  )
}

function CartaoDoDia({
  data,
  inicial,
  areas,
  aoMudarTamanho,
}: {
  data: string
  inicial: DiaLinha | null
  areas: Area[]
  aoMudarTamanho: (t: Tamanho) => void
}) {
  // Só os quatro campos deste cartão: os horários dos rituais são gravados à parte.
  const [linha, setLinha] = useState<DiaLinha>({
    tamanho: inicial?.tamanho ?? 'normal',
    destaque: inicial?.destaque ?? null,
    destaque_area_id: inicial?.destaque_area_id ?? null,
    destaque_feito: inicial?.destaque_feito ?? false,
  })
  const [texto, setTexto] = useState(inicial?.destaque ?? '')
  const [erro, setErro] = useState<string | null>(null)
  // A única coisa do ciclo fica à vista: a de hoje costuma servir a ela.
  const ciclo = useConsulta<{ unica_coisa: string | null } | null>(() =>
    supabase.from('v_ciclo_atual').select('unica_coisa').maybeSingle(),
  )

  async function salvar(mudanca: Partial<DiaLinha>) {
    const nova = { ...linha, ...mudanca }
    setLinha(nova)
    const { error } = await supabase.from('dia').upsert({ data, ...nova }, { onConflict: 'data' })
    setErro(error ? 'Não foi possível salvar o dia.' : null)
  }

  function salvarDestaque() {
    const destaque = texto.trim() || null
    if (destaque !== linha.destaque) void salvar({ destaque, destaque_feito: destaque ? linha.destaque_feito : false })
  }

  return (
    <>
      <div className="segmentos tamanho-do-dia" role="radiogroup" aria-label="Tamanho do dia">
        {TAMANHOS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={linha.tamanho === t.id}
            className={linha.tamanho === t.id ? 'ativo' : undefined}
            title={t.ajuda}
            onClick={() => {
              aoMudarTamanho(t.id)
              void salvar({ tamanho: t.id })
            }}
          >
            {t.nome}
          </button>
        ))}
      </div>
      {linha.tamanho === 'minimo' && <p className="ajuda">{TAMANHOS[0].ajuda}</p>}
      <section className="unica-coisa">
        <p className="rotulo-ambar">
          <i aria-hidden="true" />A única coisa
        </p>
        {ciclo.dados?.unica_coisa && <p className="unica-coisa-do-ciclo">No ciclo: {ciclo.dados.unica_coisa}</p>}
        <form
          className="linha-do-destaque"
          onSubmit={(e) => {
            e.preventDefault()
            salvarDestaque()
          }}
        >
          <textarea
            className={linha.destaque_feito ? 'destaque riscado' : 'destaque'}
            aria-label="A única coisa de hoje"
            placeholder="O que faz o dia valer?"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={salvarDestaque}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                salvarDestaque()
                e.currentTarget.blur()
              }
            }}
          />
          <button
            type="button"
            className={linha.destaque_feito ? 'marcar-destaque feito' : 'marcar-destaque'}
            aria-label={linha.destaque_feito ? 'Desmarcar a única coisa' : 'Marcar a única coisa como feita'}
            aria-pressed={linha.destaque_feito}
            disabled={!linha.destaque}
            onClick={() => salvar({ destaque_feito: !linha.destaque_feito })}
          >
            {linha.destaque_feito && <Visto />}
          </button>
        </form>
        <select
          aria-label="Área da única coisa"
          value={linha.destaque_area_id ?? ''}
          onChange={(e) => salvar({ destaque_area_id: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Sem área</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
        {erro && <p className="erro">{erro}</p>}
      </section>
    </>
  )
}

function Visto() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

// Início e fim de expediente: o checklist vem do texto do Sistema; aqui só se
// guarda a hora em que cada um foi concluído.
function Rituais({
  data,
  inicioEm,
  encerradoEm,
  aoMudar,
  ir,
}: {
  data: string
  inicioEm: string | null
  encerradoEm: string | null
  aoMudar: () => void
  ir: Ir
}) {
  const textos = useConsulta<Ritual[]>(() =>
    supabase.from('estrategia').select('chave, titulo, corpo').in('chave', ['ritual_inicio', 'ritual_fim']),
  )
  const [aberto, setAberto] = useState<ChaveDoRitual | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const texto = (textos.dados ?? []).find((x) => x.chave === aberto)
  const coluna = aberto === 'ritual_inicio' ? 'inicio_em' : 'encerrado_em'
  const feitoEm = aberto === 'ritual_inicio' ? inicioEm : encerradoEm

  async function registrar(valor: string | null) {
    const { error } = await supabase.from('dia').upsert({ data, [coluna]: valor }, { onConflict: 'data' })
    if (error) return setErro('Não foi possível registrar o ritual.')
    setErro(null)
    setAberto(null)
    aoMudar()
  }

  return (
    <div className="rituais-do-dia">
      <button
        type="button"
        className={inicioEm ? 'pilula-ritual concluido' : 'pilula-ritual'}
        onClick={() => setAberto('ritual_inicio')}
      >
        {inicioEm ? `Início feito · ${hora(inicioEm)}` : 'Início do expediente'}
      </button>
      <button
        type="button"
        className={encerradoEm ? 'pilula-ritual concluido' : 'pilula-ritual'}
        onClick={() => setAberto('ritual_fim')}
      >
        {encerradoEm ? `Encerrado · ${hora(encerradoEm)}` : 'Fim do expediente'}
      </button>
      {aberto && (
        <Folha
          titulo={texto?.titulo ?? (aberto === 'ritual_inicio' ? 'Início de expediente' : 'Fim de expediente')}
          subtitulo={feitoEm ? `Concluído às ${hora(feitoEm)}` : undefined}
          aoFechar={() => setAberto(null)}
        >
          {texto?.corpo?.trim() ? (
            <Texto fonte={texto.corpo} />
          ) : (
            <p className="ajuda">Este ritual ainda não tem texto. Escreva o passo a passo em Sistema.</p>
          )}
          {aberto === 'ritual_inicio' && (
            <p className="ajuda">
              <button type="button" className="link" onClick={() => ir({ tela: 'habitos', dia: somarDias(data, -1) })}>
                Marcar os hábitos de ontem
              </button>
            </p>
          )}
          {erro && <p className="erro">{erro}</p>}
          <div className="acoes">
            {feitoEm && (
              <button type="button" onClick={() => registrar(null)}>
                Desfazer
              </button>
            )}
            <button type="button" className="principal" onClick={() => registrar(new Date().toISOString())}>
              {aberto === 'ritual_inicio' ? 'Concluir o início' : 'Shutdown complete'}
            </button>
          </div>
        </Folha>
      )}
    </div>
  )
}
