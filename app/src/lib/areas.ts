// A cor de cada área da vida: um ponto pequeno que liga tarefas, notas,
// hábitos e sessões. Sempre acompanhado do nome da área.
const CORES: Record<string, string> = {
  Carreira: '#3a6ea5',
  Estudos: '#6d55b3',
  Saúde: '#2f8a5f',
  Finanças: '#9c7a12',
  Família: '#c0573e',
  Religião: '#9b4f7b',
  Lazer: '#2c8c99',
}

export const corDaArea = (nome: string | null | undefined): string => (nome && CORES[nome]) || '#8a9099'
