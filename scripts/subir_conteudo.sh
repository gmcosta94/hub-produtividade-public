#!/bin/bash
# Carrega o conteúdo pessoal de dados/conteudo/ no banco de PRODUÇÃO
# (o projeto vinculado pelo `supabase link`).
#
# Uso:  scripts/subir_conteudo.sh
#
# Pede a senha do banco sem mostrá-la na tela e sem gravá-la em lugar nenhum.
# Faz a mesma carga do banco local (scripts/carregar_conteudo.sh): só insere
# o que ainda não existe. Depois da primeira carga, um texto da Constituição
# só muda por emenda, então vale revisar dados/conteudo/constituicao/ antes.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f supabase/.temp/pooler-url ]; then
  echo "Projeto não vinculado. Rode antes: supabase link --project-ref <ref>" >&2
  exit 1
fi

URL="$(cat supabase/.temp/pooler-url)"
echo "Destino: $URL"
read -r -s -p "Senha do banco: " PGPASSWORD; echo
export PGPASSWORD

DB_URL="$URL" scripts/carregar_conteudo.sh
