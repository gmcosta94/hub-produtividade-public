#!/usr/bin/env python3
"""Gera o SQL que leva os textos de dados/conteudo/constituicao/ para o banco.

Texto que já existe e mudou vira emenda, com o motivo dado. Texto novo é criado.
Texto igual ao do banco fica como está. O SQL sai na saída padrão.

Uso:
  scripts/emendar_textos.py "motivo da emenda" > /tmp/emendas.sql
  psql ... -f /tmp/emendas.sql                       # banco local
  supabase db query --remote --yes -f /tmp/emendas.sql   # banco da nuvem
"""
import csv
import pathlib
import sys

if len(sys.argv) != 2 or not sys.argv[1].strip():
    sys.exit('Informe o motivo da emenda entre aspas.')
motivo = sys.argv[1].strip()
pasta = pathlib.Path(__file__).resolve().parent.parent / 'dados' / 'conteudo' / 'constituicao'


def literal(texto: str) -> str:
    assert '$hub$' not in texto
    return f'$hub${texto}$hub$'


print('do $emendas$\ndeclare\n  v_id bigint;\n  v_sistema bigint := (select id from public.area where tipo = \'sistema\');\nbegin')
with open(pasta / 'indice.csv', encoding='utf-8') as indice:
    for linha in csv.DictReader(indice):
        corpo = (pasta / linha['arquivo']).read_text(encoding='utf-8').rstrip('\n')
        chave = literal(linha['chave'])
        print(f"""
  select id into v_id from public.estrategia where chave = {chave};
  if v_id is null then
    insert into public.estrategia (area_id, titulo, tipo, chave, ordem, corpo)
    values (v_sistema, {literal(linha['titulo'])}, {literal(linha['tipo'])}, {chave}, {int(linha['ordem'])}, {literal(corpo)});
    raise notice 'criado: %', {literal(linha['titulo'])};
  elsif (select corpo from public.estrategia where id = v_id) is distinct from {literal(corpo)} then
    perform public.emendar_estrategia(v_id, {literal(corpo)}, {literal(motivo)});
    update public.estrategia set ordem = {int(linha['ordem'])} where id = v_id;
    raise notice 'emendado: %', {literal(linha['titulo'])};
  end if;""")
print('end;\n$emendas$;')
