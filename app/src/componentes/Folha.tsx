import { useEffect, type ReactNode } from 'react'

// Painel que sobe do rodapé, sobre a tela. Fecha com Esc, com o ✕ ou tocando fora.
export function Folha({
  titulo,
  subtitulo,
  aoFechar,
  children,
}: {
  titulo: string
  subtitulo?: string
  aoFechar: () => void
  children: ReactNode
}) {
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoFechar])

  return (
    <div className="fundo-folha" onClick={aoFechar}>
      <div className="folha" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button type="button" aria-label="Fechar" onClick={aoFechar}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
