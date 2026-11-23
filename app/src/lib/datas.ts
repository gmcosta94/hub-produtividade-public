// Datas como texto 'AAAA-MM-DD', sempre no fuso do aparelho.
// A semana vai de domingo a sábado, igual à função inicio_da_semana do banco.

export type Dia = string

function paraData(dia: Dia): Date {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(a, m - 1, d)
}

function paraDia(data: Date): Dia {
  const m = String(data.getMonth() + 1).padStart(2, '0')
  const d = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${m}-${d}`
}

export function hoje(): Dia {
  return paraDia(new Date())
}

export function somarDias(dia: Dia, n: number): Dia {
  const data = paraData(dia)
  data.setDate(data.getDate() + n)
  return paraDia(data)
}

export function inicioDaSemana(dia: Dia): Dia {
  return somarDias(dia, -paraData(dia).getDay())
}

export function diasDaSemana(inicio: Dia): Dia[] {
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i))
}

export const LETRAS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const NOMES_DA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function diaDoMes(dia: Dia): number {
  return paraData(dia).getDate()
}

/** "segunda, 16 de nov" */
export function porExtenso(dia: Dia): string {
  const data = paraData(dia)
  return `${NOMES_DA_SEMANA[data.getDay()]}, ${data.getDate()} de ${MESES[data.getMonth()]}`
}

/** "15 a 21 de nov" ou "29 de nov a 5 de dez" */
export function intervaloDaSemana(inicio: Dia): string {
  const a = paraData(inicio)
  const b = paraData(somarDias(inicio, 6))
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} a ${b.getDate()} de ${MESES[b.getMonth()]}`
  }
  return `${a.getDate()} de ${MESES[a.getMonth()]} a ${b.getDate()} de ${MESES[b.getMonth()]}`
}
