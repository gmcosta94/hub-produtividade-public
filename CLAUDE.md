# Hub de organização e produtividade

## Regras do projeto

- Responder em português.
- O objetivo do produto é leveza. Ao propor uma função, preferir a versão que reduz compromissos simultâneos, e não a que acrescenta metas, contadores ou cobranças.
- O hub é para pensar, não para armazenar. Toda área usa as mesmas seis peças; antes de criar uma tabela ou tela específica de uma área, verificar se as peças já resolvem.
- O módulo Sistema é a Constituição (seção 7): as outras telas executam os processos e os limites escritos nele.
- Os limites (áreas em foco, espaços do dia, capacidade) são regra de negócio, não detalhe de tela.
- Ordem de construção (decisão de 16/11/2026, que substitui a regra de uma fase a cada duas semanas): primeiro todos os módulos em corte mínimo e ligados entre si, depois o aprofundamento de cada um. O que liga os módulos é a área e o projeto. Ver `docs/04-integracao.md`.
- A Constituição foi enxugada em 16/11/2026 (ver `docs/04-integracao.md`): três escalas (ciclo, semana, dia), sem metas mensais, ciclo de tamanho variável, e hábitos com três pesos (`essencial`, `base`, `livre`).
- Conteúdo de notas pessoais, visão de longo prazo e dados de saúde e de família não vão para arquivos versionados, logs nem serviços externos além do banco escolhido e do assistente (seção 10). Exemplos em docs e testes usam dados fictícios.
- Especificações e decisões ficam em `docs/`.

## Como rodar (banco local)

```bash
colima start        # Docker leve; necessário para o Supabase local
supabase start -x studio,imgproxy,storage-api,realtime,logflare,vector,edge-runtime,supavisor,postgres-meta,mailpit
supabase db reset   # recria o banco: migrations + seed.sql
scripts/carregar_conteudo.sh   # hábitos, métricas e textos da Constituição, de dados/conteudo/
```

- `scripts/carregar_conteudo.sh` só insere o que falta; não sobrescreve o que já está no banco. Para apontar para outro banco: `DB_URL=... scripts/carregar_conteudo.sh`.

App (React + Vite, em `app/`):

```bash
scripts/preparar_app_local.sh   # grava app/.env.local e cria o usuário de teste local (refazer após db reset)
npm --prefix app run dev        # http://localhost:5174, apontando para o banco local
npm --prefix app run build && npm --prefix app run lint
```

- O app lê views `v_*` e chama funções do banco; regra de negócio fica em SQL. "Este dia conta para a semana?" só é respondido por `v_habito_registro`.
- View nova precisa de `security_invoker = true`, `revoke all ... from anon` e `grant select ... to authenticated`.
- O app marca hábitos e métricas por `marcar_habito` e `marcar_metrica`, e sessões por `iniciar_sessao`, `encerrar_sessao` e `lancar_sessao`, não por escrita direta nas tabelas. Apagar uma sessão é a exceção: é um `delete` em `registro`.
- Ciclo, objetivo, semana, projeto, tarefa, nota, dia e os cadastros (área, parâmetro) são escritos direto nas tabelas; os limites ficam em gatilhos (`conferir_areas_em_foco`, `arrumar_tarefa`). Quando o banco recusa com `raise exception`, a mensagem já vem escrita para a pessoa (`textoDoErro` em `app/src/lib/dados.ts`).
- As telas se chamam por `ir({ tela, id })` (`app/src/lib/dados.ts`): uma área abre um projeto, um projeto abre uma nota. `Habitos` e `Foco` aceitam `embutido` para aparecer dentro de outra tela; `Habitos` também aceita `soHoje` (sem semana nem seletor de dia) e `marcarComo` (o que um toque grava; no dia mínimo, a versão mínima).
- `revisao_da_semana()` devolve a semana inteira em JSON, para o assistente.
- O assistente tem duas funções (Deno, TypeScript): `supabase/functions/assistente` (revisão da semana) e `supabase/functions/conversa` (conversa com ferramentas de leitura), com o código comum em `supabase/functions/_compartilhado/`. Publicar: `supabase functions deploy assistente conversa --use-api`. A chave da API fica só nos segredos do Supabase (`scripts/configurar_chave_da_api.sh`), nunca no app nem no repositório. Testar localmente: `deno run --allow-net --allow-env --allow-read supabase/functions/assistente/index.ts` com `SUPABASE_URL`, `SUPABASE_ANON_KEY` e, para não gastar, `ANTHROPIC_BASE_URL` apontando para uma API falsa. Dependências npm só em versões com mais de uma semana.
- O assistente lê tudo e só escreve em `revisao`, `proposta`, `conversa` e `mensagem`; a mudança no hub acontece quando a pessoa aceita (`decidir_proposta`). O histórico da conversa vai para a API exatamente como voltou: nunca editar nem apagar mensagens do meio de `conversa.historico`.
- Para mudar textos da Constituição em lote: editar `dados/conteudo/constituicao/` e rodar `scripts/emendar_textos.py "motivo"`, que gera o SQL das emendas.
- Layout responsivo (`app/src/index.css`, fim do arquivo): celular em uma coluna com abas no alto; tablet (768 px ou mais) um pouco mais largo; computador (1024 px ou mais) com menu lateral e telas em colunas (`.colunas`, `.coluna`, `.larga-estreita`). Em Tarefas e Notas, o celular mostra uma parte por vez e o computador mostra tudo lado a lado, só com CSS (`.coluna-do-quadro.ativa`, `.lista-detalhe.com-nota`).
- Versão nova: `app/src/lib/atualizacao.ts` (o mesmo do hub financeiro) procura atualização ao abrir, a cada meia hora e quando a janela volta a ficar visível, e recarrega sozinho quando nada está sendo editado. Por isso o PWA usa `registerType: 'prompt'`.
- Componentes compartilhados em `app/src/componentes/`: `Folha` (painel que sobe do rodapé), `Texto` (leitor de Markdown) e `Estrategias` (os textos de uma área, com emenda e histórico).
- Portas próprias, para rodar junto com o hub financeiro: app em 5174, API em 55321, Postgres em 55322.
- `psql` vem do libpq do Homebrew: `/opt/homebrew/opt/libpq/bin/psql postgresql://postgres:postgres@127.0.0.1:55322/postgres`.
- A semana vai de domingo a sábado. A função `inicio_da_semana` é a única definição de semana; não usar `date_trunc('week', ...)`.
- Conteúdo pessoal (hábitos, textos da Constituição) fica em `dados/conteudo/`, fora do git. O seed versionado só tem estrutura.

## Publicação (produção)

- Banco: projeto Supabase `hub-produtividade` (região sa-east-1). Vincular uma vez com `supabase link --project-ref <ref-do-projeto>`.
- Migration nova vai para a nuvem com `supabase db push --remote` (antes, conferir com `--dry-run`). Nunca rodar `db reset` contra o projeto remoto.
- Conteúdo pessoal na nuvem: `scripts/subir_conteudo.sh`. Pede a senha do banco na hora e só insere o que falta.
- Backup: `scripts/backup.sh` exporta os dados da nuvem para `dados/backups/` (fora do git), sem senha; `--testar` restaura num banco temporário local e confere tabela por tabela; `--local` exporta o banco local. O `pg_dump` roda fora do Docker porque, dentro do contêiner, a resolução de nomes falha nesta máquina.
- App: https://hub-produtividade.gm-costa94.workers.dev, no Cloudflare (Workers com arquivos estáticos, `app/wrangler.jsonc`), publicado a cada push na `main`. No Cloudflare, o diretório raiz do build é `app`. As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (a chave publicável do projeto) ficam nas configurações de build do Cloudflare, não no repositório.
- O trabalho acontece em branch; a `main` é o que está publicado.
- Vitrine pública: este repositório é privado; `scripts/publicar_vitrine.sh` copia a `main` para `gmcosta94/hub-produtividade-public`, sem o briefing, o `docs/03-fase-1.md`, a pasta `.claude` e o próprio script, trocando trechos pessoais e recusando termos vetados. Rodar depois de publicar algo que deva aparecer lá.
- Acesso: o usuário é criado no painel do Supabase e incluído em `membro`. Sem login, a API não lê nenhuma tabela (testado em 16/11/2026).

## Estrutura

- `docs/01-stack.md` — stack proposta e a questão do projeto Supabase.
- `docs/02-modelo-de-dados.md` — tabelas e views das seis peças; convenções de dia, semana e meta.
- `docs/04-integracao.md` — a decisão de 16/11/2026, o que liga os módulos, o que cada um tem e o que falta, e como usar o assistente.
- `docs/05-assistente.md` — arquitetura proposta do assistente de IA (ainda não implementado).
- `README.md` — apresentação do projeto para a página do GitHub.
- `supabase/migrations/` — schema em SQL numerado; `supabase/seed.sql` — áreas e parâmetros.
- `app/` — o app. Telas em `app/src/telas/`, utilitários em `app/src/lib/`.
- `scripts/` — carga do conteúdo pessoal (local e na nuvem) e preparação do app local.
- `dados/` — conteúdo pessoal (`dados/conteudo/`) e backups, fora do git.

## Convenções do banco

- Tabela nova em `public` chama `select aplicar_acesso_padrao('public.nome')` na própria migration.
- Migration que cria função termina com `revoke execute on all functions in schema public from public, anon` e dá `grant execute ... to authenticated` só ao que o app chama.
- O texto de uma estratégia muda por `emendar_estrategia(id, corpo, motivo)`. Na Constituição o motivo é obrigatório, e o histórico (`estrategia_versao`) só é escrito pelo gatilho.

## Referência

O hub financeiro (`../hub-financeiro`) é o modelo de stack e de forma de trabalho: Supabase com regras em SQL, app em React + Vite, especificações em `docs/`.
