import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Folha } from '../componentes/Folha'
import { lerNumero, numero } from '../lib/formato'
import { textoDoErro, useAreas, useConsulta, type Area } from '../lib/dados'

type Tipo = 'sim_nao' | 'quantidade'
type Comparacao = 'pelo_menos' | 'no_maximo'
type Prioridade = 'essencial' | 'base' | 'livre'
const PESOS: { id: Prioridade; nome: string; ajuda: string }[] = [
  {
    id: 'essencial',
    nome: 'Em construção',
    ajuda: 'Um hábito que você está adotando agora. São poucos de cada vez: o hub limita quantos.',
  },
  {
    id: 'base',
    nome: 'Padrão mínimo',
    ajuda: 'Sustenta o padrão mínimo da área, mesmo sem ela estar em foco. Não precisa ser todo dia.',
  },
  {
    id: 'livre',
    nome: 'Acompanhamento',
    ajuda: 'Registro quando der, sem pendência nem cobrança: suplementos, passos, peso.',
  },
]
export type HabitoDoCadastro = {
  id: number
  nome: string
  area_id: number
  tipo: Tipo
  unidade: string | null
  comparacao: Comparacao | null
  meta_valor: number | null
  meta_dias: number | null
  versao_minima: string | null
  prioridade: Prioridade
  ativo: boolean
}

// Criar, editar, mudar o peso e desativar hábitos. Fica no pé da tela Hábitos
// e é o passo de revisão dos hábitos no plano do ciclo (sempreAberto).
// Desativar guarda o hábito com o histórico: ele pode voltar quando quiser.
export function CadastroDeHabitos({ aoMudar, sempreAberto = false }: { aoMudar: () => void; sempreAberto?: boolean }) {
  const areas = useAreas()
  const habitos = useConsulta<HabitoDoCadastro[]>(() =>
    supabase
      .from('habito')
      .select('id, nome, area_id, tipo, unidade, comparacao, meta_valor, meta_dias, versao_minima, prioridade, ativo')
      .order('ordem')
      .order('id'),
  )
  const [abertoAgora, setAberto] = useState(false)
  const [editando, setEditando] = useState<HabitoDoCadastro | 'novo' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const aberto = sempreAberto || abertoAgora
  const lista = habitos.dados ?? []

  if (!aberto) {
    return (
      <p className="bloco">
        <button type="button" className="botao" onClick={() => setAberto(true)}>
          Gerenciar hábitos
        </button>
      </p>
    )
  }

  async function alternarAtivo(h: HabitoDoCadastro) {
    const { error } = await supabase.from('habito').update({ ativo: !h.ativo }).eq('id', h.id)
    setErro(error ? textoDoErro(error, 'Não foi possível mudar o hábito.') : null)
    habitos.recarregar()
    aoMudar()
  }

  const grupos: { titulo: string; itens: HabitoDoCadastro[] }[] = [
    ...PESOS.map((p) => ({ titulo: p.nome, itens: lista.filter((h) => h.ativo && h.prioridade === p.id) })),
    { titulo: 'Guardados', itens: lista.filter((h) => !h.ativo) },
  ]

  return (
    <section className={sempreAberto ? 'cadastro-de-habitos' : 'bloco cadastro-de-habitos'}>
      {!sempreAberto && <h2 className="titulo-bloco">Gerenciar hábitos</h2>}
      {grupos
        .filter((g) => g.itens.length > 0)
        .map((g) => (
          <div key={g.titulo} className="grupo-do-cadastro">
            <h3 className="rotulo-do-grupo">
              {g.titulo} ({g.itens.length})
            </h3>
            <ul className="lista">
              {g.itens.map((h) => (
                <li key={h.id}>
                  <button type="button" className="item" onClick={() => setEditando(h)}>
                    <span className={h.ativo ? undefined : 'riscado'}>{h.nome}</span>
                    <small>
                      {[
                        areas.find((a) => a.id === h.area_id)?.nome,
                        h.tipo === 'sim_nao' ? 'sim ou não' : h.unidade,
                        h.meta_dias ? `${h.meta_dias} dias por semana` : 'sem meta semanal',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </button>
                  <button type="button" className="link" onClick={() => alternarAtivo(h)}>
                    {h.ativo ? 'guardar' : 'voltar'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <div className="botoes bloco">
        <button type="button" className="botao principal" onClick={() => setEditando('novo')}>
          Novo hábito
        </button>
        {!sempreAberto && (
          <button type="button" className="botao" onClick={() => setAberto(false)}>
            Fechar
          </button>
        )}
      </div>
      {editando && (
        <FolhaDoCadastro
          key={editando === 'novo' ? 'novo' : editando.id}
          habito={editando === 'novo' ? null : editando}
          areas={areas}
          ordem={lista.length + 1}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null)
            habitos.recarregar()
            aoMudar()
          }}
        />
      )}
    </section>
  )
}

// Também é o que abre ao tocar num hábito na tela de Hábitos, com Guardar e Histórico.
export function FolhaDoCadastro({
  habito,
  areas,
  ordem,
  aoFechar,
  aoSalvar,
  aoVerHistorico,
  areaInicial,
}: {
  habito: HabitoDoCadastro | null
  areas: Area[]
  ordem: number
  aoFechar: () => void
  aoSalvar: () => void
  aoVerHistorico?: () => void
  areaInicial?: number
}) {
  const [nome, setNome] = useState(habito?.nome ?? '')
  const [areaId, setAreaId] = useState<number | null>(habito?.area_id ?? areaInicial ?? null)
  const [tipo, setTipo] = useState<Tipo>(habito?.tipo ?? 'sim_nao')
  const [unidade, setUnidade] = useState(habito?.unidade ?? '')
  const [comparacao, setComparacao] = useState<Comparacao | ''>(
    habito?.meta_valor != null ? (habito.comparacao ?? '') : '',
  )
  const [limite, setLimite] = useState(habito?.meta_valor != null ? numero.format(habito.meta_valor) : '')
  const [metaDias, setMetaDias] = useState<number | null>(habito?.meta_dias ?? null)
  const [minima, setMinima] = useState(habito?.versao_minima ?? '')
  const [prioridade, setPrioridade] = useState<Prioridade>(habito?.prioridade ?? 'livre')
  const [erro, setErro] = useState<string | null>(null)
  // O formato só muda enquanto o hábito não tem registros (o banco também confere).
  const registros = useConsulta<number>(async () => {
    if (!habito) return { data: 0, error: null }
    const { count, error } = await supabase
      .from('habito_registro')
      .select('id', { count: 'exact', head: true })
      .eq('habito_id', habito.id)
    return { data: count ?? 0, error }
  }, [habito?.id])
  const formatoLivre = !habito || registros.dados === 0

  // Excluir apaga o hábito e todo o histórico dele (o banco apaga os registros junto).
  // Pede confirmação na própria folha, porque não tem volta.
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  async function excluir() {
    if (!habito) return
    const { error } = await supabase.from('habito').delete().eq('id', habito.id)
    if (error) return setErro(textoDoErro(error, 'Não foi possível excluir o hábito.'))
    aoSalvar()
  }

  async function alternarAtivo() {
    if (!habito) return
    const { error } = await supabase.from('habito').update({ ativo: !habito.ativo }).eq('id', habito.id)
    if (error) return setErro(textoDoErro(error, 'Não foi possível mudar o hábito.'))
    aoSalvar()
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim() || areaId === null) return setErro('Dê um nome e escolha a área.')
    let numeros: { unidade: string | null; comparacao: Comparacao | null; meta_valor: number | null } = {
      unidade: null,
      comparacao: null,
      meta_valor: null,
    }
    if (tipo === 'quantidade') {
      if (!unidade.trim()) return setErro('Diga a unidade: minutos, refeições, blocos.')
      const valor = comparacao ? lerNumero(limite) : null
      if (comparacao && valor === null) return setErro('Digite o número do limite.')
      numeros = { unidade: unidade.trim(), comparacao: comparacao || null, meta_valor: valor }
    }
    const campos = {
      nome: nome.trim(),
      area_id: areaId,
      ...numeros,
      meta_dias: metaDias,
      versao_minima: minima.trim() || null,
      prioridade,
    }
    const { error } = habito
      ? await supabase
          .from('habito')
          .update(formatoLivre ? { ...campos, tipo } : campos)
          .eq('id', habito.id)
      : await supabase.from('habito').insert({ ...campos, tipo, ordem })
    if (error) {
      return setErro(
        error.code === '23505'
          ? 'Já existe um hábito com esse nome.'
          : textoDoErro(error, 'Não foi possível salvar o hábito.'),
      )
    }
    aoSalvar()
  }

  return (
    <Folha titulo={habito ? 'Editar hábito' : 'Novo hábito'} aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label>
          Área
          <select value={areaId ?? ''} onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Escolha</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="segmentos" role="radiogroup" aria-label="Peso no ciclo">
          {PESOS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={prioridade === p.id}
              className={prioridade === p.id ? 'ativo' : undefined}
              onClick={() => setPrioridade(p.id)}
            >
              {p.nome}
            </button>
          ))}
        </div>
        <p className="ajuda">{PESOS.find((p) => p.id === prioridade)?.ajuda}</p>
        {formatoLivre ? (
          <div className="segmentos" role="radiogroup" aria-label="Formato">
            {(
              [
                ['sim_nao', 'Sim ou não'],
                ['quantidade', 'Quantidade por dia'],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={tipo === id}
                className={tipo === id ? 'ativo' : undefined}
                onClick={() => setTipo(id)}
              >
                {rotulo}
              </button>
            ))}
          </div>
        ) : (
          registros.carregou && (
            <p className="ajuda">
              Formato: {tipo === 'sim_nao' ? 'sim ou não' : 'quantidade por dia'}. Ele já tem registros, então o formato
              não muda mais. Para trocar, desative este e crie outro.
            </p>
          )
        )}
        {tipo === 'quantidade' && (
          <>
            <label>
              Unidade
              <input
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="min, refeições, blocos"
              />
            </label>
            <div className="lado-a-lado">
              <label>
                Limite do dia
                <select value={comparacao} onChange={(e) => setComparacao(e.target.value as Comparacao | '')}>
                  <option value="">Sem limite: só registrar</option>
                  <option value="no_maximo">No máximo</option>
                  <option value="pelo_menos">Pelo menos</option>
                </select>
              </label>
              {comparacao && (
                <label>
                  Quanto
                  <input inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} />
                </label>
              )}
            </div>
          </>
        )}
        <label>
          Meta por semana
          <select value={metaDias ?? ''} onChange={(e) => setMetaDias(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sem meta: só acompanhar</option>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'dia' : 'dias'} por semana
              </option>
            ))}
          </select>
        </label>
        <label>
          Versão mínima: o que vale num dia ruim
          <input value={minima} onChange={(e) => setMinima(e.target.value)} />
        </label>
        {erro && <p className="erro">{erro}</p>}
        {habito && (
          <p className="ajuda">
            {habito.ativo
              ? 'Guardar tira o hábito da lista sem perder o histórico; ele pode voltar quando quiser.'
              : 'Este hábito está guardado. Volte com ele para a lista quando quiser.'}
          </p>
        )}
        {habito && confirmarExclusao && (
          <div
            className="confirmar-exclusao"
            role="alert"
            ref={(el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}
          >
            <p>
              Excluir "{habito.nome}" apaga o hábito e todo o histórico dele
              {registros.dados ? ` (${registros.dados} ${registros.dados === 1 ? 'registro' : 'registros'})` : ''}. Não
              dá para desfazer. Se for só tirar da lista, use Guardar.
            </p>
            <div className="acoes">
              <button type="button" onClick={() => setConfirmarExclusao(false)}>
                Manter
              </button>
              <button type="button" className="perigo" onClick={excluir}>
                Excluir de vez
              </button>
            </div>
          </div>
        )}
        <div className="acoes">
          {habito && (
            <button type="button" className="excluir" onClick={() => setConfirmarExclusao(true)}>
              Excluir
            </button>
          )}
          {habito && (
            <button type="button" onClick={alternarAtivo}>
              {habito.ativo ? 'Guardar' : 'Voltar para a lista'}
            </button>
          )}
          {aoVerHistorico && (
            <button type="button" onClick={aoVerHistorico}>
              Histórico
            </button>
          )}
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="principal">
            Salvar
          </button>
        </div>
      </form>
    </Folha>
  )
}
