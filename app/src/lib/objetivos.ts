import { supabase } from './supabase'
import { useConsulta } from './dados'

export type ObjetivoDoCiclo = {
  id: number
  area_id: number
  titulo: string
  pronto_quando: string | null
  minimo: string | null
}

// Os objetivos ativos do ciclo atual: o plano semanal lembra deles e a folha
// da tarefa deixa ligar uma tarefa a um deles.
export function useObjetivosDoCiclo(cicloId: number | null | undefined) {
  return useConsulta<ObjetivoDoCiclo[]>(
    () =>
      supabase
        .from('objetivo')
        .select('id, area_id, titulo, pronto_quando, minimo')
        .eq('ciclo_id', cicloId ?? -1)
        .eq('estado', 'ativo')
        .order('id'),
    [cicloId],
  )
}
