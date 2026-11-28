import { useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { corDaArea } from '../lib/areas'
import { Estrategias } from '../componentes/Estrategias'
import { duracao } from '../lib/formato'
import { NOME_DO_MODO, textoDoErro, useAreas, useConsulta, type Ir, type Modo } from '../lib/dados'
import { Texto } from '../componentes/Texto'
import { FolhaDoCadastro } from './CadastroDeHabitos'
import { Habitos } from './Habitos'

type Painel = {
  id: number
  nome: string
  modo: Modo
  padrao_minimo: string | null
  rever_em: string | null
  habitos: number
  marcacoes_na_semana: number
  projetos_ativos: number
  tarefas_abertas: number
  notas: number
  minutos_na_semana: number
  objetivos: string | null
  habitos_de_base: number
  habitos_de_base_cumpridos: number
  visao: string | null
}
type Curto = { id: number; titulo: string }
type ProjetoCurto = { id: number; nome: string; tarefas_abertas: number; notas: number }

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function Areas({ areaId, ir }: { areaId?: number; ir: Ir }) {
  const painel = useConsulta<Painel[]>(() => supabase.from('v_area_painel').select('*').order('ordem'))
  const areas = painel.dados ?? []

  if (areaId !== undefined) {
    const area = areas.find((a) => a.id === areaId)
    return (
      <main>
        {area ? (
          <PaginaDaArea area={area} ir={ir} aoMudar={painel.recarregar} />
        ) : (
          painel.carregou && <p className="vazio">Área não encontrada.</p>
        )}
      </main>
    )
  }

  const emFoco = areas.filter((a) => a.modo === 'foco')
  return (
    <main>
      <h1 className="titulo-tela">Áreas</h1>
      <p className="ajuda">
        Tudo mapeado, pouco em foco.{' '}
        {emFoco.length === 0
          ? 'Nenhuma área em foco agora.'
          : `Em foco agora: ${emFoco.map((a) => a.nome).join(' e ')}.`}
      </p>
      <ul className="lista bloco painel-areas">
        {areas.map((a) => (
          <li key={a.id}>
            <button type="button" className="item" onClick={() => ir({ tela: 'areas', id: a.id })}>
              <span>
                <i className="ponto-da-area" style={{ background: corDaArea(a.nome) }} />
                {a.nome}
                <small className={a.modo === 'foco' ? 'chip' : 'chip neutro'}>{NOME_DO_MODO[a.modo]}</small>
              </span>
              <small>
                {[
                  a.habitos > 0 && plural(a.habitos, 'hábito', 'hábitos'),
                  a.projetos_ativos > 0 && plural(a.projetos_ativos, 'projeto', 'projetos'),
                  a.tarefas_abertas > 0 && plural(a.tarefas_abertas, 'tarefa', 'tarefas'),
                  a.notas > 0 && plural(a.notas, 'nota', 'notas'),
                  a.minutos_na_semana > 0 && `${duracao(a.minutos_na_semana)} na semana`,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Ainda sem nada ligado'}
              </small>
              {a.objetivos && <small>Objetivo: {a.objetivos}</small>}
              {a.habitos_de_base > 0 && (
                <small>
                  Padrão mínimo: {a.habitos_de_base_cumpridos} de {a.habitos_de_base} cumpridos na semana
                </small>
              )}
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}

// A página de uma área junta o que cada módulo tem dela. A visão vem logo
// abaixo do nome, inteira: é o norte de tudo o que está embaixo.
function PaginaDaArea({ area, ir, aoMudar }: { area: Painel; ir: Ir; aoMudar: () => void }) {
  const projetos = useConsulta<ProjetoCurto[]>(
    () =>
      supabase
        .from('v_projeto')
        .select('id, nome, tarefas_abertas, notas')
        .eq('area_id', area.id)
        .eq('estado', 'ativo')
        .order('nome'),
    [area.id],
  )
  const tarefas = useConsulta<Curto[]>(
    () =>
      supabase
        .from('v_tarefa')
        .select('id, titulo')
        .eq('area_id', area.id)
        .eq('estado', 'aberta')
        .is('projeto_id', null)
        .order('id'),
    [area.id],
  )
  const notas = useConsulta<Curto[]>(
    () =>
      supabase
        .from('v_nota')
        .select('id, titulo')
        .eq('area_id', area.id)
        .eq('arquivada', false)
        .is('projeto_id', null)
        .order('atualizado_em', { ascending: false }),
    [area.id],
  )
  const areasDaVida = useAreas()
  const [minimo, setMinimo] = useState(area.padrao_minimo ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [novoHabito, setNovoHabito] = useState(false)
  // Muda quando um hábito é criado aqui, para a lista embutida reler o banco.
  const [versaoDosHabitos, setVersaoDosHabitos] = useState(0)
  const cor = corDaArea(area.nome)

  async function mudar(mudanca: Record<string, unknown>) {
    const { error } = await supabase.from('area').update(mudanca).eq('id', area.id)
    setErro(error ? textoDoErro(error, 'Não foi possível salvar a área.') : null)
    aoMudar()
  }

  const listaDeProjetos = projetos.dados ?? []
  const listaDeTarefas = tarefas.dados ?? []
  const listaDeNotas = notas.dados ?? []

  return (
    <div className="pagina-da-area" style={{ '--cor-da-area': cor } as CSSProperties}>
      <button type="button" className="link voltar" onClick={() => ir({ tela: 'areas' })}>
        ‹ Áreas
      </button>

      <header className="topo-da-area">
        <div className="nome-da-area">
          <i className="ponto-da-area" style={{ background: cor }} />
          <h1 className="titulo-tela">{area.nome}</h1>
        </div>
        <div className="segmentos modo-da-area" role="radiogroup" aria-label="Modo da área">
          {(['foco', 'manutencao', 'pausa'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={area.modo === m}
              className={area.modo === m ? 'ativo' : undefined}
              onClick={() => area.modo !== m && mudar({ modo: m, rever_em: m === 'pausa' ? area.rever_em : null })}
            >
              {NOME_DO_MODO[m]}
            </button>
          ))}
        </div>
      </header>
      {area.modo === 'pausa' && (
        <label className="rever-pausa">
          Rever a pausa em
          <input
            type="date"
            className="campo"
            value={area.rever_em ?? ''}
            onChange={(e) => mudar({ rever_em: e.target.value || null })}
          />
        </label>
      )}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <VisaoDaArea texto={area.visao} aoSalvar={(t) => mudar({ visao: t })} />

      <dl className="numeros-da-area">
        <div>
          <dt>Hábitos na semana</dt>
          <dd>{area.marcacoes_na_semana}</dd>
          <small>{area.marcacoes_na_semana === 1 ? 'marcação' : 'marcações'}</small>
        </div>
        <div>
          <dt>Padrão mínimo</dt>
          <dd>
            {area.habitos_de_base > 0 ? (
              <>
                {area.habitos_de_base_cumpridos}
                <span className="de"> de {area.habitos_de_base}</span>
              </>
            ) : (
              '–'
            )}
          </dd>
          <small>{area.habitos_de_base > 0 ? 'na meta da semana' : 'sem hábito de base'}</small>
        </div>
        <div>
          <dt>Foco e estudo</dt>
          <dd>{area.minutos_na_semana > 0 ? duracao(area.minutos_na_semana) : '0'}</dd>
          <button type="button" className="link" onClick={() => ir({ tela: 'foco', id: area.id })}>
            ver histórico
          </button>
        </div>
        <div>
          <dt>Projetos ativos</dt>
          <dd>{area.projetos_ativos}</dd>
          <small>{plural(area.tarefas_abertas, 'tarefa aberta', 'tarefas abertas')}</small>
        </div>
      </dl>

      <div className="colunas">
        <div className="coluna">
          <section className="secao-da-area">
            <header>
              <h2>Padrão mínimo</h2>
            </header>
            <label className="sem-rotulo">
              <span className="ajuda">O que significa "está ok" nesta área, mesmo fora do foco.</span>
              <textarea
                className="campo"
                rows={3}
                value={minimo}
                onChange={(e) => setMinimo(e.target.value)}
                onBlur={() =>
                  (minimo.trim() || null) !== area.padrao_minimo && mudar({ padrao_minimo: minimo.trim() || null })
                }
              />
            </label>
            <p className="ajuda">
              {area.habitos_de_base > 0
                ? `Acompanhado por ${plural(area.habitos_de_base, 'hábito', 'hábitos')} de padrão mínimo.`
                : 'Nenhum hábito acompanha o padrão mínimo. Crie um ao lado e marque "Padrão mínimo".'}
            </p>
          </section>

          <section className="secao-da-area">
            <header>
              <h2>Objetivo no ciclo</h2>
              <button type="button" className="link" onClick={() => ir({ tela: 'plano' })}>
                Abrir o plano
              </button>
            </header>
            <p className={area.objetivos ? 'objetivo-da-area' : 'vazio pequeno'}>
              {area.objetivos ?? 'Sem objetivo no ciclo atual.'}
            </p>
          </section>

          <section className="secao-da-area">
            <header>
              <h2>Estratégia da área</h2>
            </header>
            <Estrategias areaId={area.id} constituicao={false} />
          </section>
        </div>

        <div className="coluna">
          <section className="secao-da-area">
            <header>
              <h2>Hábitos</h2>
              <span className="acoes-da-secao">
                <button type="button" className="link" onClick={() => ir({ tela: 'habitos' })}>
                  Abrir Hábitos
                </button>
                <button type="button" className="botao pequeno" onClick={() => setNovoHabito(true)}>
                  + Novo hábito
                </button>
              </span>
            </header>
            <Habitos key={versaoDosHabitos} areaId={area.id} embutido />
          </section>

          <section className="secao-da-area">
            <header>
              <h2>Projetos ativos</h2>
              <button type="button" className="link" onClick={() => ir({ tela: 'tarefas' })}>
                Projetos e Tarefas
              </button>
            </header>
            {listaDeProjetos.length === 0 ? (
              <p className="vazio pequeno">Nenhum projeto ativo nesta área.</p>
            ) : (
              <ul className="lista">
                {listaDeProjetos.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="item" onClick={() => ir({ tela: 'tarefas', id: p.id })}>
                      <span>{p.nome}</span>
                      <small>
                        {plural(p.tarefas_abertas, 'tarefa aberta', 'tarefas abertas')} ·{' '}
                        {plural(p.notas, 'nota', 'notas')}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {listaDeTarefas.length > 0 && (
              <>
                <h3 className="subtitulo-da-secao">Tarefas abertas sem projeto</h3>
                <ul className="lista">
                  {listaDeTarefas.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="item" onClick={() => ir({ tela: 'tarefas' })}>
                        <span>{t.titulo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="secao-da-area">
            <header>
              <h2>Notas</h2>
              <button type="button" className="link" onClick={() => ir({ tela: 'notas' })}>
                Abrir Notas
              </button>
            </header>
            {listaDeNotas.length === 0 ? (
              <p className="vazio pequeno">Nenhuma nota desta área.</p>
            ) : (
              <ul className="lista">
                {listaDeNotas.map((n) => (
                  <li key={n.id}>
                    <button type="button" className="item" onClick={() => ir({ tela: 'notas', id: n.id })}>
                      <span>{n.titulo}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {novoHabito && (
        <FolhaDoCadastro
          habito={null}
          areas={areasDaVida}
          areaInicial={area.id}
          ordem={999}
          aoFechar={() => setNovoHabito(false)}
          aoSalvar={() => {
            setNovoHabito(false)
            setVersaoDosHabitos((v) => v + 1)
            aoMudar()
          }}
        />
      )}
    </div>
  )
}

// A visão de longo prazo, inteira, como o norte da página. Edita no lugar.
function VisaoDaArea({ texto, aoSalvar }: { texto: string | null; aoSalvar: (t: string | null) => void }) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(texto ?? '')

  if (editando) {
    return (
      <section className="visao-da-area editando">
        <h2>Visão de longo prazo</h2>
        <textarea
          className="campo"
          rows={8}
          autoFocus
          value={rascunho}
          placeholder="Como esta área está daqui a alguns anos?"
          onChange={(e) => setRascunho(e.target.value)}
        />
        <div className="botoes">
          <button
            type="button"
            className="botao principal"
            onClick={() => {
              aoSalvar(rascunho.trim() || null)
              setEditando(false)
            }}
          >
            Salvar
          </button>
          <button
            type="button"
            className="botao"
            onClick={() => {
              setRascunho(texto ?? '')
              setEditando(false)
            }}
          >
            Cancelar
          </button>
        </div>
      </section>
    )
  }

  if (!texto) {
    return (
      <button type="button" className="visao-da-area vazia" onClick={() => setEditando(true)}>
        <h2>Visão de longo prazo</h2>
        <span>Como esta área está daqui a alguns anos? Escreva aqui: é o norte do que vem abaixo.</span>
      </button>
    )
  }

  return (
    <section className="visao-da-area">
      <header>
        <h2>Visão de longo prazo</h2>
        <button
          type="button"
          className="link"
          onClick={() => {
            setRascunho(texto)
            setEditando(true)
          }}
        >
          editar
        </button>
      </header>
      <Texto fonte={texto} />
    </section>
  )
}
