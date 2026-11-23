import type { ReactNode } from 'react'
import type { Tela } from '../lib/dados'

// Ícones de traço das telas, desenhados para 24 px. Herdam a cor do texto.
const CAMINHOS: Partial<Record<Tela | 'mais', ReactNode>> = {
  hoje: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  habitos: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.8 2.8L16.5 9.5" />
    </>
  ),
  tarefas: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.5" cy="6.5" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="17.5" r="1" />
    </>
  ),
  notas: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14.5 3v4.5H19M9 12h7M9 16h5" />
    </>
  ),
  areas: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </>
  ),
  plano: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  assistente: <path d="M5 5h14v10H10l-5 4z" />,
  sistema: (
    <>
      <path d="M5 4h10a4 4 0 014 4v12H9a4 4 0 01-4-4z" />
      <path d="M9 9h6M9 13h4" />
    </>
  ),
  mais: (
    <>
      <circle cx="5.5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18.5" cy="12" r="1.2" />
    </>
  ),
}

export function Icone({ nome, tamanho = 24 }: { nome: Tela | 'mais'; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {CAMINHOS[nome]}
    </svg>
  )
}
