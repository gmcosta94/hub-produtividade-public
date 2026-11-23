import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { corDaArea } from '../lib/areas'
import { Estrategias } from '../componentes/Estrategias'
import { duracao } from '../lib/formato'
import { NOME_DO_MODO, textoDoErro, useConsulta, type Ir, type Modo } from '../lib/dados'
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

// A página de uma área junta o que cada módulo tem dela.
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
  const [minimo, setMinimo] = useState(area.padrao_minimo ?? '')
  const [visao, setVisao] = useState(area.visao ?? '')
  const [erro, setErro] = useState<string | null>(null)

  async function mudar(mudanca: Record<string, unknown>) {
    const { error } = await supabase.from('area').update(mudanca).eq('id', area.id)
    setErro(error ? textoDoErro(error, 'Não foi possível salvar a área.') : null)
    aoMudar()
  }

  return (
    <>
      <button type="button" className="link voltar" onClick={() => ir({ tela: 'areas' })}>
        ‹ Áreas
      </button>
      <h1 className="titulo-tela">{area.nome}</h1>

      <div className="colunas">
        <div className="coluna">
          <div className="cartao">
            <div className="segmentos" role="radiogroup" aria-label="Modo da área">
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
            {erro && (
              <p className="erro" role="alert">
                {erro}
              </p>
            )}
            {area.modo === 'pausa' && (
              <label>
                Rever a pausa em
                <input
                  type="date"
                  value={area.rever_em ?? ''}
                  onChange={(e) => mudar({ rever_em: e.target.value || null })}
                />
              </label>
            )}
            <label>
              Visão de longo prazo: como esta área está daqui a alguns anos
              <textarea
                rows={3}
                value={visao}
                onChange={(e) => setVisao(e.target.value)}
                onBlur={() => (visao.trim() || null) !== area.visao && mudar({ visao: visao.trim() || null })}
              />
            </label>
            <label>
              Padrão mínimo: o que significa "está ok" nesta área
              <textarea
                rows={2}
                value={minimo}
                onChange={(e) => setMinimo(e.target.value)}
                onBlur={() =>
                  (minimo.trim() || null) !== area.padrao_minimo && mudar({ padrao_minimo: minimo.trim() || null })
                }
              />
            </label>
            <p className="ajuda">
              {area.habitos_de_base > 0
                ? `O padrão mínimo é acompanhado por ${plural(area.habitos_de_base, 'hábito', 'hábitos')}: ${area.habitos_de_base_cumpridos} já cumpriram a meta desta semana.`
                : 'Nenhum hábito acompanha o padrão mínimo. Em Hábitos, marque como "Padrão mínimo" os que sustentam esta área.'}
            </p>
            <p className="ajuda">
              {area.objetivos ? `Objetivo no ciclo: ${area.objetivos}. ` : 'Sem objetivo no ciclo atual. '}
              <button type="button" className="link" onClick={() => ir({ tela: 'plano' })}>
                Abrir o plano
              </button>
            </p>
            <p className="ajuda">
              Nesta semana: {plural(area.marcacoes_na_semana, 'marcação de hábito', 'marcações de hábito')}
              {area.minutos_na_semana > 0 && ` e ${duracao(area.minutos_na_semana)} de foco e estudo`}.
            </p>
            <p className="ajuda">
              <button type="button" className="link" onClick={() => ir({ tela: 'foco', id: area.id })}>
                Ver o histórico de foco e estudo desta área
              </button>
            </p>
          </div>

          <section className="bloco">
            <h2 className="titulo-bloco">Estratégia da área</h2>
            <Estrategias areaId={area.id} constituicao={false} />
          </section>
        </div>
        <div className="coluna">
          <section className="bloco primeiro">
            <h2 className="titulo-bloco">Hábitos da área</h2>
            <Habitos areaId={area.id} embutido />
          </section>

          <section className="bloco">
            <h2 className="titulo-bloco">Projetos</h2>
            {(projetos.dados ?? []).length === 0 ? (
              <p className="vazio pequeno">
                Nenhum projeto ativo.{' '}
                <button type="button" className="link" onClick={() => ir({ tela: 'tarefas' })}>
                  Criar em Tarefas
                </button>
              </p>
            ) : (
              <ul className="lista">
                {(projetos.dados ?? []).map((p) => (
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
          </section>

          {(tarefas.dados ?? []).length > 0 && (
            <section className="bloco">
              <h2 className="titulo-bloco">Tarefas abertas sem projeto</h2>
              <ul className="lista">
                {(tarefas.dados ?? []).map((t) => (
                  <li key={t.id}>
                    <button type="button" className="item" onClick={() => ir({ tela: 'tarefas' })}>
                      <span>{t.titulo}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="bloco">
            <h2 className="titulo-bloco">Notas da área</h2>
            {(notas.dados ?? []).length === 0 ? (
              <p className="vazio pequeno">
                Nenhuma nota desta área.{' '}
                <button type="button" className="link" onClick={() => ir({ tela: 'notas' })}>
                  Abrir Notas
                </button>
              </p>
            ) : (
              <ul className="lista">
                {(notas.dados ?? []).map((n) => (
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
    </>
  )
}
