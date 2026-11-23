#!/bin/bash
# Backup dos dados do hub para dados/backups/ (fora do git).
#
# Uso:
#   scripts/backup.sh            # banco da nuvem (o projeto vinculado)
#   scripts/backup.sh --local    # banco local
#   scripts/backup.sh --testar   # depois do dump, restaura num banco temporário
#                                # local e confere tabela por tabela
#
# Não pede senha: usa a conexão do Supabase CLI (supabase login + supabase link).
# Precisa do pg_dump do Homebrew (libpq), em versão igual ou maior que a do banco.
# O arquivo tem só os dados do schema public. A estrutura está nas migrations,
# e a conta de login é do Supabase (auth), que não entra aqui.
#
# Para restaurar num projeto novo: aplicar as migrations (supabase db push),
# criar o usuário no painel e carregar o arquivo com psql.
set -euo pipefail

export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
cd "$(dirname "$0")/.."

LOCAL="postgresql://postgres:postgres@127.0.0.1:55322/postgres"
ALVO="--remote"
ORIGEM="nuvem"
TESTAR=0
for a in "$@"; do
  case "$a" in
    --local) ALVO=""; ORIGEM="local" ;;
    --testar) TESTAR=1 ;;
    *) echo "Opção desconhecida: $a" >&2; exit 1 ;;
  esac
done

mkdir -p dados/backups
ARQ="dados/backups/hub-$ORIGEM-$(date +%Y%m%d-%H%M%S).sql"

# O Supabase CLI monta o comando de exportação (com uma credencial temporária)
# e o pg_dump roda aqui mesmo, sem Docker: dentro do contêiner a resolução de
# nomes falha nesta máquina.
trap 'rm -f "$ARQ"' ERR
# shellcheck disable=SC2086
supabase db dump $ALVO --dry-run --data-only --use-copy --schema public 2>/dev/null | bash > "$ARQ"
trap - ERR
if ! grep -q '^COPY ' "$ARQ"; then
  echo "O backup saiu sem nenhuma tabela. Confira o login do Supabase CLI." >&2
  rm -f "$ARQ"
  exit 1
fi
echo "Backup ($ORIGEM) salvo em $ARQ ($(du -h "$ARQ" | cut -f1))"

if [ "$TESTAR" = 1 ]; then
  BANCO="hub_teste_restauracao"
  TESTE="${LOCAL%/*}/$BANCO"
  psql "$LOCAL" -q -c "drop database if exists $BANCO" -c "create database $BANCO"
  # O mínimo que a estrutura espera encontrar do Supabase.
  psql "$TESTE" -q -v ON_ERROR_STOP=1 <<'SQL'
drop schema public cascade;
create schema if not exists auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql as 'select null::uuid';
SQL
  # A estrutura vem do banco local, criado pelas mesmas migrations.
  pg_dump "$LOCAL" --schema=public --schema-only --no-owner --no-privileges \
    | psql "$TESTE" -q -v ON_ERROR_STOP=1 >/dev/null
  psql "$TESTE" -q -v ON_ERROR_STOP=1 -f "$ARQ" >/dev/null

  # Linhas de cada tabela no arquivo contra linhas no banco restaurado.
  FALHAS=0
  while IFS='|' read -r TABELA NO_ARQUIVO; do
    NO_BANCO=$(psql "$TESTE" -Atc "select count(*) from public.\"$TABELA\"")
    if [ "$NO_ARQUIVO" = "$NO_BANCO" ]; then RESULTADO=OK; else RESULTADO=DIFERENTE; FALHAS=1; fi
    echo "  $TABELA: arquivo=$NO_ARQUIVO restaurado=$NO_BANCO $RESULTADO"
  done < <(python3 - "$ARQ" <<'PY'
import re, sys
tabela, linhas = None, 0
for linha in open(sys.argv[1], encoding='utf-8'):
    if tabela is None:
        m = re.match(r'COPY "?public"?\."?([a-z_]+)"? ', linha)
        if m:
            tabela, linhas = m.group(1), 0
    elif linha.rstrip('\n') == '\\.':
        print(f'{tabela}|{linhas}')
        tabela = None
    else:
        linhas += 1
PY
)
  psql "$LOCAL" -q -c "drop database $BANCO"
  if [ "$FALHAS" = 1 ]; then echo "Restauração com diferenças." >&2; exit 1; fi
  echo "Restauração conferida."
fi
