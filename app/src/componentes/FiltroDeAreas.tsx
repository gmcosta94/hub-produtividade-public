import { useEffect, useRef, useState } from 'react'
import { corDaArea } from '../lib/areas'

type Opcao = { id: number; nome: string; quantos: number }

// Filtro de áreas em lista que abre, com mais de uma escolha. Nenhuma marcada = todas.
export function FiltroDeAreas({
  opcoes,
  marcadas,
  aoMudar,
}: {
  opcoes: Opcao[]
  marcadas: number[]
  aoMudar: (ids: number[]) => void
}) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  // Fecha ao tocar fora ou com Esc.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  const escolhidas = opcoes.filter((o) => marcadas.includes(o.id))
  const rotulo =
    escolhidas.length === 0
      ? 'Todas as áreas'
      : escolhidas.length <= 2
        ? escolhidas.map((o) => o.nome).join(', ')
        : `${escolhidas.length} áreas`

  function alternar(id: number) {
    aoMudar(marcadas.includes(id) ? marcadas.filter((x) => x !== id) : [...marcadas, id])
  }

  return (
    <div className="filtro-de-areas" ref={raiz}>
      <button
        type="button"
        className={escolhidas.length ? 'gatilho com-filtro' : 'gatilho'}
        aria-haspopup="true"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <span className="pontos" aria-hidden="true">
          {(escolhidas.length ? escolhidas : opcoes).slice(0, 4).map((o) => (
            <i key={o.id} className="ponto-da-area" style={{ background: corDaArea(o.nome) }} />
          ))}
        </span>
        <span className="rotulo-do-filtro">{rotulo}</span>
        <span className="seta" aria-hidden="true">
          ▾
        </span>
      </button>
      {aberto && (
        <div className="painel-do-filtro" role="group" aria-label="Áreas">
          {opcoes.map((o) => (
            <label key={o.id}>
              <input type="checkbox" checked={marcadas.includes(o.id)} onChange={() => alternar(o.id)} />
              <i className="ponto-da-area" style={{ background: corDaArea(o.nome) }} />
              <span>{o.nome}</span>
              <small>{o.quantos}</small>
            </label>
          ))}
          <button type="button" className="link" disabled={marcadas.length === 0} onClick={() => aoMudar([])}>
            Mostrar todas
          </button>
        </div>
      )}
    </div>
  )
}
