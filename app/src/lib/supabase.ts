import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !chave) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. Rode scripts/preparar_app_local.sh ou crie app/.env.local.',
  )
}

// A chave pública só identifica o projeto; quem decide o que cada pessoa
// vê e altera são as políticas de acesso por linha do banco.
export const supabase = createClient(url, chave)
