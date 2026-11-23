// A consulta é uma função nova a cada desenho da tela; quem diz quando reler é `deps`.
/* oxlint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

// As telas do hub e a forma de ir de uma para outra. O id abre um item:
// uma área, um projeto (em Tarefas), uma nota ou um texto do Sistema.
export type Tela = 'hoje' | 'habitos' | 'tarefas' | 'notas' | 'areas' | 'plano' | 'assistente' | 'sistema' | 'foco'
export type Rota = { tela: Tela; id?: number; dia?: string }
export type Ir = (rota: Rota) => void

type Resposta = { data: unknown; error: unknown }

// Lê do banco e guarda o resultado. `recarregar` repete a leitura.
export function useConsulta<T>(consulta: () => PromiseLike<Resposta>, deps: readonly unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null)
  const [carregou, setCarregou] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let cancelado = false
    consulta().then(({ data, error }) => {
      if (cancelado) return
      setFalhou(Boolean(error))
      if (!error) setDados(data as T)
      setCarregou(true)
    })
    return () => {
      cancelado = true
    }
  }, [...deps, versao])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])
  return { dados, carregou, falhou, recarregar }
}

export type Modo = 'foco' | 'manutencao' | 'pausa'
export type Area = { id: number; nome: string; modo: Modo }

export function useAreas(): Area[] {
  const { dados } = useConsulta<Area[]>(() =>
    supabase.from('area').select('id, nome, modo').eq('tipo', 'vida').eq('ativa', true).order('ordem'),
  )
  return dados ?? []
}

export const NOME_DO_MODO: Record<Modo, string> = { foco: 'Em foco', manutencao: 'Manutenção', pausa: 'Pausa' }

// Regra de negócio fica no banco: quando ele recusa (raise exception), a
// mensagem já vem escrita para a pessoa. Qualquer outro erro usa o texto padrão.
export function textoDoErro(error: { code?: string; message: string } | null, padrao: string): string {
  return error?.code === 'P0001' ? error.message : padrao
}

// As funções do assistente devolvem { erro } com a mensagem já escrita para a pessoa.
export async function mensagemDaFuncao(error: unknown, padrao: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const corpo = await error.context.json().catch(() => null)
    if (typeof corpo?.erro === 'string') return corpo.erro
  }
  return padrao
}
