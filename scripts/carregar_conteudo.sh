#!/bin/bash
# Carrega o conteúdo pessoal de dados/conteudo/ (fora do git) no banco:
#   1. hábitos e métricas, de habitos.csv;
#   2. textos da Constituição, de constituicao/indice.csv e dos .md ao lado.
#
# Uso:  scripts/carregar_conteudo.sh
#       DB_URL=postgresql://... scripts/carregar_conteudo.sh   (outro banco)
#
# Só insere o que ainda não existe. Texto que já está no banco não é
# sobrescrito: depois da primeira carga, ele só muda por emenda, no app.
# Rodar de novo depois de `supabase db reset`, que apaga o conteúdo.
set -euo pipefail

export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
cd "$(dirname "$0")/.."

DB="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:55322/postgres}"
C="dados/conteudo"

echo "== Hábitos e métricas"
psql "$DB" -v ON_ERROR_STOP=1 -qAt -f scripts/carregar_habitos.sql

echo "== Constituição"
tail -n +2 "$C/constituicao/indice.csv" | while IFS=, read -r arquivo titulo tipo chave ordem; do
  [ -z "$arquivo" ] && continue
  if [ ! -f "$C/constituicao/$arquivo" ]; then
    echo "arquivo não encontrado: $C/constituicao/$arquivo" >&2
    exit 1
  fi
  psql "$DB" -v ON_ERROR_STOP=1 -qAt \
    -v titulo="$titulo" -v tipo="$tipo" -v chave="$chave" -v ordem="$ordem" \
    -v corpo="$(cat "$C/constituicao/$arquivo")" <<'SQL'
with nova as (
  insert into public.estrategia (area_id, titulo, tipo, chave, ordem, corpo)
  select a.id, :'titulo', :'tipo', :'chave', :'ordem'::int, :'corpo'
  from public.area a
  where a.tipo = 'sistema'
    and not exists (select 1 from public.estrategia e where e.chave = :'chave')
  returning 1
)
select case when exists (select 1 from nova) then 'carregado:  ' else 'já existia: ' end || :'titulo';
SQL
done
