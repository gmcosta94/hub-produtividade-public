#!/bin/bash
# Prepara o app para rodar contra o banco LOCAL:
#   1. grava app/.env.local com o endereço e a chave pública do Supabase local;
#   2. cria um usuário de teste e guarda o login em app/.env.local.
#
# Uso:  scripts/preparar_app_local.sh
# Rodar de novo depois de `supabase db reset`, que apaga os usuários locais.
# Nada aqui toca a produção. app/.env.local fica fora do git.
set -euo pipefail

export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
cd "$(dirname "$0")/.."

eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
DB="postgresql://postgres:postgres@127.0.0.1:55322/postgres"
EMAIL="teste@hub.local"
SENHA="$(openssl rand -hex 12)"

# recria o usuário de teste do zero
psql "$DB" -qc "delete from auth.users where email = '$EMAIL'"
ID=$(curl -s -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\",\"email_confirm\":true}" \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
psql "$DB" -qc "insert into public.membro (user_id, nome) values ('$ID', 'Teste local')"

cat > app/.env.local <<EOF
# Gerado por scripts/preparar_app_local.sh — banco LOCAL. Não versionar.
VITE_SUPABASE_URL=$API_URL
VITE_SUPABASE_ANON_KEY=$ANON_KEY
# Login de teste (só existe no banco local):
TESTE_EMAIL=$EMAIL
TESTE_SENHA=$SENHA
EOF
echo "Pronto: app/.env.local gravado e usuário de teste criado ($EMAIL)."
