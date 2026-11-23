export const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/** Lê um número digitado, aceitando vírgula. Devolve null se não for um número válido. */
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.')
  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** 45 -> "45 min"; 60 -> "1h"; 100 -> "1h40" */
export function duracao(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/** Tempo corrido de um cronômetro: "07:05" ou "1:07:05" */
export function cronometro(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Hora local de um instante: "09:30" */
export function hora(instante: string): string {
  return new Date(instante).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
