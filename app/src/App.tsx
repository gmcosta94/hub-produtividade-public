import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Rota, Tela } from './lib/dados'
import { Login } from './telas/Login'
import { Hoje } from './telas/Hoje'
import { Habitos } from './telas/Habitos'
import { Tarefas } from './telas/Tarefas'
import { Notas } from './telas/Notas'
import { Areas } from './telas/Areas'
import { Plano } from './telas/Plano'
import { Assistente } from './telas/Assistente'
import { HistoricoDeFoco } from './telas/HistoricoDeFoco'
import { Sistema } from './telas/Sistema'
import { Folha } from './componentes/Folha'
import { Icone } from './componentes/Icones'

type Grupo = 'dia' | 'reflexao' | 'sistema'
const TELAS: { id: Tela; nome: string; curto?: string; grupo: Grupo }[] = [
  { id: 'hoje', nome: 'Hoje', grupo: 'dia' },
  { id: 'habitos', nome: 'Hábitos', grupo: 'dia' },
  { id: 'tarefas', nome: 'Projetos e Tarefas', curto: 'Tarefas', grupo: 'dia' },
  { id: 'notas', nome: 'Notas', grupo: 'dia' },
  { id: 'areas', nome: 'Áreas', grupo: 'reflexao' },
  { id: 'plano', nome: 'Plano', grupo: 'reflexao' },
  { id: 'assistente', nome: 'Assistente', grupo: 'reflexao' },
  { id: 'sistema', nome: 'Sistema', grupo: 'sistema' },
]
// No celular, quatro telas ficam na barra de baixo; as outras, em "Mais".
const NA_BARRA: Tela[] = ['hoje', 'habitos', 'tarefas', 'notas']
// O histórico de foco pertence a Hoje.
const telaDoMenu = (t: Tela): Tela => (t === 'foco' ? 'hoje' : t)
const grupoDa = (t: Tela): Grupo => TELAS.find((x) => x.id === telaDoMenu(t))?.grupo ?? 'dia'

export default function App() {
  // undefined = ainda verificando; null = sem login.
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  // O hub tem um usuário só. Conta que não está em membro não vê nada; o banco
  // é quem barra de fato, aqui é só para mostrar um aviso em vez de telas vazias.
  const [membro, setMembro] = useState<{ userId: string; ok: boolean } | null>(null)
  // Os módulos se chamam por aqui: uma área abre um projeto, um projeto abre uma nota.
  const [rota, setRota] = useState<Rota>({ tela: 'hoje' })
  const [mais, setMais] = useState(false)
  const ir = useCallback((r: Rota) => {
    setRota(r)
    setMais(false)
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = sessao?.user.id
  useEffect(() => {
    if (!userId) return
    let cancelado = false
    supabase
      .from('membro')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelado) setMembro({ userId, ok: data !== null })
      })
    return () => {
      cancelado = true
    }
  }, [userId])

  if (sessao === undefined) return null
  if (sessao === null) return <Login />
  if (membro?.userId !== sessao.user.id) return null

  if (!membro.ok) {
    return (
      <main>
        <p className="vazio">Esta conta não tem acesso ao hub.</p>
        <footer className="rodape">
          <span>{sessao.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>Sair</button>
        </footer>
      </main>
    )
  }

  // A chave refaz a tela quando o item aberto muda.
  const chave = `${rota.tela}-${rota.id ?? ''}-${rota.dia ?? ''}`
  return (
    <div className="app">
      {/* Computador: menu lateral em grupos, com o ponto de cor de cada grupo. */}
      <nav className="navegacao" aria-label="Telas">
        <p className="marca">Hub de Produtividade</p>
        {(
          [
            ['Dia a dia', ['dia']],
            ['Reflexão', ['reflexao', 'sistema']],
          ] as const
        ).map(([titulo, grupos]) => (
          <div key={titulo} className="menu-grupo">
            <p>{titulo}</p>
            {TELAS.filter((t) => (grupos as readonly Grupo[]).includes(t.grupo)).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={telaDoMenu(rota.tela) === t.id ? 'page' : undefined}
                className={`grupo-${t.grupo}${telaDoMenu(rota.tela) === t.id ? ' ativo' : ''}`}
                onClick={() => ir({ tela: t.id })}
              >
                <i className="ponto-do-menu" aria-hidden="true" />
                {t.nome}
              </button>
            ))}
          </div>
        ))}
        <div className="conta">
          <span>{sessao.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </nav>

      {/* Celular: quatro telas e "Mais" na barra de baixo. */}
      <nav className="abas" aria-label="Telas">
        {TELAS.filter((t) => NA_BARRA.includes(t.id)).map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={telaDoMenu(rota.tela) === t.id ? 'page' : undefined}
            className={telaDoMenu(rota.tela) === t.id ? 'ativo' : undefined}
            onClick={() => ir({ tela: t.id })}
          >
            <Icone nome={t.id} />
            {t.curto ?? t.nome}
          </button>
        ))}
        <button
          type="button"
          className={!NA_BARRA.includes(telaDoMenu(rota.tela)) ? 'ativo' : undefined}
          onClick={() => setMais(true)}
        >
          <Icone nome="mais" />
          Mais
        </button>
      </nav>
      {mais && (
        <Folha titulo="Mais" aoFechar={() => setMais(false)}>
          <div className="lista-mais">
            {TELAS.filter((t) => !NA_BARRA.includes(t.id)).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`grupo-${t.grupo}${telaDoMenu(rota.tela) === t.id ? ' ativo' : ''}`}
                onClick={() => ir({ tela: t.id })}
              >
                <Icone nome={t.id} />
                <span>{t.nome}</span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </Folha>
      )}

      <div className={`conteudo grupo-${grupoDa(rota.tela)}`}>
        {rota.tela === 'hoje' && <Hoje ir={ir} />}
        {rota.tela === 'habitos' && <Habitos key={chave} diaInicial={rota.dia} />}
        {rota.tela === 'tarefas' && <Tarefas key={chave} projetoId={rota.id} ir={ir} />}
        {rota.tela === 'notas' && <Notas key={chave} notaId={rota.id} ir={ir} />}
        {rota.tela === 'areas' && <Areas key={chave} areaId={rota.id} ir={ir} />}
        {rota.tela === 'plano' && <Plano ir={ir} />}
        {rota.tela === 'assistente' && <Assistente key={chave} conversaId={rota.id} ir={ir} />}
        {rota.tela === 'sistema' && <Sistema key={chave} textoId={rota.id} ir={ir} />}
        {rota.tela === 'foco' && <HistoricoDeFoco key={chave} areaId={rota.id} ir={ir} />}
        <footer className="rodape">
          <span>{sessao.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>Sair</button>
        </footer>
      </div>
    </div>
  )
}
